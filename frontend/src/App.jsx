import React, {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import * as Cesium from 'cesium';
import { AppProvider, useAppState, useDispatch } from './context/AppContext';
import CesiumGlobe from './components/CesiumGlobe';
import ThreeOverlay from './components/ThreeOverlay';
import DeckOverlay from './components/DeckOverlay';
import BridgeOverlay from './components/overlay/BridgeOverlay';
import BinocularsMask from './components/overlay/BinocularsMask';
import LegendContainer from './components/hud/LegendContainer';
import TeleportOverlay from './components/hud/TeleportOverlay';
// //* [Modified Code] 우측 하단 레이더 UI 컴포넌트 임포트
import Minimap from './components/hud/Minimap';
import WeatherHud from './components/hud/WeatherHud';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import SimulationControls from './components/layout/SimulationControls';
import TimelineBar from './components/layout/TimelineBar';
import BottomPanel from './components/layout/BottomPanel';
import ShipSpecsSummaryModal from './components/layout/ShipSpecsSummaryModal';
import RouteChangeAlert from './components/layout/RouteChangeAlert';
import { ROUTES, TOTAL_SECONDS, getTotalSeconds, ROUTE_DAYS } from './data/arcticRoutes';
import { PORTS } from './data/ports';
import { SHIP_PRESETS } from './data/vesselPresets';
import useManualControl from './hooks/useManualControl';
import { fetchIceConcentration, fetchIcebergs, fetchWeather } from './services/api';
import {
  buildTimings,
  routePos,
  routeHeading,
  calculateRouteDistanceKM,
  getSeaState,
} from './services/shipSimulator';
import { evaluateRouting, deriveIceConditions } from './services/polarisRIO';
import { generateRoute, isSameRegion } from './services/routeGenerator';
import { checkRouteAhead, rerouteAroundIceberg } from './services/icebergAvoidance';

function AppInner() {
  const state = useAppState();
  const dispatch = useDispatch();

  const cesiumRef = useRef(null);
  const threeRef = useRef(null);
  const deckRef = useRef(null);
  const viewerRef = useRef(null);
  const [cesiumViewerState, setCesiumViewerState] = useState(null);

  const animFrameRef = useRef(null);

  // 키보드 수동 조종
  const { keys } = useManualControl();

  // 텔레포트 오버레이 상태
  const [teleportOpen, setTeleportOpen] = useState(false);

  // 토스트 알림 상태
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef(null);
  const showToast = useCallback((msg, duration = 4000) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(''), duration);
  }, []);

  // ── 시뮬레이션용 refs (rAF 내에서 최신 state 접근) ───────────
  const isSimulatingRef = useRef(false);
  const multiplierRef = useRef(1000);
  const manualModeRef = useRef(false);
  const currentRouteKeyRef = useRef('NSR');
  const shipSpecsRef = useRef(state.shipSpecs);
  const simElapsedRef = useRef(0);
  const currentModeRef = useRef('SATELLITE');
  const nsidcActiveRef = useRef(false); // nsidcConc 기본 OFF
  const iceGridCacheRef = useRef(null); // 해빙 격자 O(1) lookup 캐시
  const realBergsRef = useRef([]); // NIC 실제 빙산 위치
  const lastBergsUpdateRef = useRef(0); // 마지막 updateRealBergs 호출 시각
  const bergCesiumEntitiesRef = useRef([]); // Cesium 빙산 엔티티 목록
  const userCameraInteracting = useRef(false); // 사용자 카메라 조작 중 여부
  const cameraInteractTimer = useRef(null);  // 조작 후 추적 재개 딜레이
  const [mouseGlobePos, setMouseGlobePos] = useState(null); // 마우스 위치 (출항 전 기상 조회용)
  const shipStateRef = useRef(state.shipState);
  const oceanOverlayModeRef = useRef('none'); // 모든 WMS 레이어 기본 OFF
  const cesiumIceLayerRef = useRef(null); // Cesium 캔버스 해빙 레이어 (gibsIce)
  const nsidcConcCanvasRef = useRef(null); // Cesium 캔버스 해빙 농도 레이어 (nsidcConc)

  useEffect(() => {
    isSimulatingRef.current = state.isSimulating;
  }, [state.isSimulating]);
  useEffect(() => {
    shipStateRef.current = state.shipState;
    // shipState 변경 시 HUD 기본 정보 항상 업데이트 (시뮬레이션 여부 무관)
    const { lat, lon } = state.shipState;
    const sicVal =
      lat < 60
        ? 0
        : lat < 68
          ? ((lat - 60) / 8) * 0.3
          : lat < 75
            ? 0.3 + ((lat - 68) / 7) * 0.4
            : lat < 82
              ? 0.7 + ((lat - 75) / 7) * 0.25
              : 0.95;
    let dangerLabel, dangerCls;
    if (sicVal < 0.15) {
      dangerLabel = '낮음 🟢';
      dangerCls = 'safe';
    } else if (sicVal < 0.4) {
      dangerLabel = '보통 🟡';
      dangerCls = 'moderate';
    } else if (sicVal < 0.7) {
      dangerLabel = '높음 🟠';
      dangerCls = 'warning';
    } else {
      dangerLabel = '극심 🔴';
      dangerCls = 'critical';
    }
    const tempEst = lat > 80 ? -1.8 : lat > 70 ? -0.5 : lat > 60 ? 2.1 : 8.5;
    const sea = getSeaState(lat);
    const phase = !state.isSimulating
      ? '대기 중'
      : state.simProgress < 0.02
        ? '출항'
        : lat > 66
          ? '북극 항해 중'
          : state.simProgress > 0.95
            ? '입항 접근'
            : '항해 중';

    // 속도: 시뮬레이션 중이면 계산, 아니면 수동 속도 또는 0
    let speedText = '0.0 kn';
    let throttleText = '정지';
    if (state.isSimulating && !state.manualMode) {
      const distKm = calculateRouteDistanceKM(activeWaypoints);
// //! [Original Code] 하드코딩된 총 초 수
//      const totalSec = getTotalSeconds(state.currentRouteKey);
// //* [Modified Code] 실측 거리 기반 동적 초 산출 (15노트 기준)
      const dynamicDays = Math.max(1, Math.round(distKm / (15 * 1.852 * 24)));
      const totalSec = dynamicDays * 86400;
      const speedKmH = (distKm / totalSec) * state.multiplier * 3600;
      const kn = (speedKmH / 1.852).toFixed(1);
      speedText = kn + ' kn';
      throttleText = '자동 ×' + Math.round(state.multiplier / 20);
    } else if (state.manualMode) {
      speedText = (state.manualSpeed || 0).toFixed(1) + ' kn';
      throttleText = (state.manualThrottle || 0) + '%';
    }

    // RFI 지수: 해빙농도 기반 위험 지수 (0~10)
    const rfiVal =
      sicVal < 0.15
        ? 0
        : sicVal < 0.4
          ? sicVal * 5
          : sicVal < 0.7
            ? 3 + (sicVal - 0.4) * 10
            : 6 + (sicVal - 0.7) * 13.3;

    // Roll/Pitch: ThreeOverlay motionState에서 읽기
    const motion = threeRef.current?.motionState;
    const rollDeg = motion ? (motion.shipRoll * 180) / Math.PI : 0;
    const pitchDeg = motion ? (motion.shipPitch * 180) / Math.PI : 0;

    // 빙산 경보: 가까운 빙산 거리 기반
    const nearestIce = motion?.nearestIceDist ?? Infinity;
    const bergAlertVisible = nearestIce < 500 && lat >= 60;
    const bergAlert =
      nearestIce < 200
        ? `빙산 충돌 위험! 거리 ${Math.round(nearestIce)}m`
        : nearestIce < 500
          ? `전방 빙산 접근 중 — ${Math.round(nearestIce)}m`
          : '';

    dispatch({
      type: 'UPDATE_HUD',
      payload: {
        speed: speedText,
        throttle: throttleText,
        progress: (state.simProgress * 100).toFixed(1) + '%',
        position: lat.toFixed(2) + '°N, ' + lon.toFixed(2) + '°E',
        iceState:
          sicVal > 0.5
            ? '결빙 수역'
            : sicVal > 0.15
              ? '해빙 경계'
              : '개방 수역',
        phase,
        danger: dangerLabel,
        dangerClass: dangerCls,
        sic: Math.round(sicVal * 100) + '%',
        temp: (tempEst >= 0 ? '+' : '') + tempEst.toFixed(1) + '°C',
        rfi: rfiVal.toFixed(1),
        hs: sea.Hs.toFixed(1) + ' m',
        roll: (rollDeg >= 0 ? '+' : '') + rollDeg.toFixed(1) + '°',
        pitch: (pitchDeg >= 0 ? '+' : '') + pitchDeg.toFixed(1) + '°',
        seaLabel: sea.label,
        iceClass: state.shipSpecs.iceClass || 'PC2',
        bergAlert,
        bergAlertVisible,
      },
    });
  }, [
    state.shipState,
    state.shipSpecs.iceClass,
    state.isSimulating,
    state.manualMode,
    state.manualSpeed,
    state.manualThrottle,
    state.multiplier,
    state.simProgress,
    state.currentRouteKey,
    dispatch,
  ]);
  useEffect(() => {
    currentModeRef.current = state.currentMode;
  }, [state.currentMode]);
  useEffect(() => {
    multiplierRef.current = state.multiplier;
  }, [state.multiplier]);
  useEffect(() => {
    manualModeRef.current = state.manualMode;
  }, [state.manualMode]);
  useEffect(() => {
    currentRouteKeyRef.current = state.currentRouteKey;
  }, [state.currentRouteKey]);
// //! [Original Code] 
//   useEffect(() => {
//     shipSpecsRef.current = state.shipSpecs;
//   }, [state.shipSpecs]);

// //* [Modified Code] 선박 제원(선종) 변경 시 Cesium 선박 아이콘 즉시 업데이트 (시뮬레이션 정지 시 대응)
  useEffect(() => {
    shipSpecsRef.current = state.shipSpecs;
    if (!isSimulatingRef.current || manualModeRef.current) {
      if (cesiumRef.current && cesiumRef.current.updateShipEntity) {
        const { lat, lon, heading } = state.shipState;
        cesiumRef.current.updateShipEntity({ lat, lon }, heading, state.shipSpecs);
      }
    }
  }, [state.shipSpecs]);

  // ── 타임드 웨이포인트 (항로/항구 변경 시 재계산) ─────────────────
  const activeWaypoints = useMemo(() => {
    return state.generatedWaypoints || ROUTES[state.currentRouteKey] || ROUTES.NSR;
  }, [state.currentRouteKey, state.generatedWaypoints]);

  const timedWaypoints = useMemo(() => {
    return buildTimings(activeWaypoints);
  }, [activeWaypoints]);
  const activeWpRef = useRef(activeWaypoints);
  useEffect(() => {
    activeWpRef.current = activeWaypoints;
  }, [activeWaypoints]);

  const timedWpRef = useRef(timedWaypoints);
  useEffect(() => {
    timedWpRef.current = timedWaypoints;
  }, [timedWaypoints]);

  // ── 항구/경로 변경 시 동적 경로 생성 ──────────────────────────
  useEffect(() => {
    // 기본 부산-로테르담이 아닌 경우에만 동적 경로 생성
    if (state.departurePort === 'BUSAN' && state.arrivalPort === 'ROTTERDAM') {
      if (state.generatedWaypoints) {
        dispatch({ type: 'SET_GENERATED_WAYPOINTS', payload: null });
      }
      return;
    }

    const depPort = PORTS[state.departurePort];
    const arrPort = PORTS[state.arrivalPort];
    if (!depPort || !arrPort) return;

    let cancelled = false;
    (async () => {
      dispatch({ type: 'SET_REROUTING', payload: true });
      try {
        const wps = await generateRoute(
          depPort, arrPort, state.currentRouteKey,
          state.cachedIceData, realBergsRef.current
        );
        if (!cancelled && wps && wps.length > 1) {
          dispatch({ type: 'SET_GENERATED_WAYPOINTS', payload: wps });
          showToast(`${depPort.name} → ${arrPort.name} 경로 생성 완료`);
        }
      } catch (e) {
        console.error('[App] 동적 경로 생성 실패:', e);
      } finally {
        if (!cancelled) dispatch({ type: 'SET_REROUTING', payload: false });
      }
    })();

    return () => { cancelled = true; };
  }, [state.departurePort, state.arrivalPort, state.currentRouteKey]);

  // ── 시뮬레이션 중 빙산 회피 체크 (10초 간격) ──────────────────
  useEffect(() => {
    if (!state.isSimulating || state.manualMode) return;
    if (realBergsRef.current.length === 0) return;

    const interval = setInterval(async () => {
      const wps = activeWaypoints;
      const progress = state.simProgress;
      const currentSeg = Math.floor(progress * (wps.length - 1));

      const { blocked, dangerIdx } = checkRouteAhead(
        wps, currentSeg, realBergsRef.current, 10, 15
      );

      if (blocked && state.cachedIceData) {
        showToast('빙산 감지! 우회 경로 계산 중...', 5000);
        dispatch({ type: 'SET_REROUTING', payload: true });
        try {
          const { rerouted, newWaypoints } = await rerouteAroundIceberg(
            wps, dangerIdx, state.cachedIceData, realBergsRef.current
          );
          if (rerouted) {
            dispatch({ type: 'SET_GENERATED_WAYPOINTS', payload: newWaypoints });
            showToast('빙산 우회 경로 적용 완료');
          }
        } catch (e) {
          console.error('[App] 빙산 우회 실패:', e);
        } finally {
          dispatch({ type: 'SET_REROUTING', payload: false });
        }
      }
    }, 10000); // 10초마다

    return () => clearInterval(interval);
  }, [state.isSimulating, state.manualMode, state.simProgress]);

  // ── 메인 애니메이션 루프 ──────────────────────────────────────
  useEffect(() => {
    let lastTime = performance.now();
    let manualHeading = 0;
    let manualSpeed = 0;
    let manualThrottle = 0;
    let manualTurnRate = 0; // 현재 선회 속도 (관성 적용)
    let lastHudUpdate = 0;

    function loop(now) {
      animFrameRef.current = requestAnimationFrame(loop);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // ── 자동 항해 시뮬레이션 ──────────────────────────────────
      if (isSimulatingRef.current && !manualModeRef.current) {
        const mult = multiplierRef.current;
        simElapsedRef.current += dt * mult;
        const routeKey = currentRouteKeyRef.current;
// //! [Original Code] 
//        const routeTotalSec = getTotalSeconds(routeKey);
// //* [Modified Code] 동적 시간 계산
        const wps = activeWpRef.current;
        const distKm = calculateRouteDistanceKM(wps);
        const dynamicDays = Math.max(1, Math.round(distKm / (15 * 1.852 * 24)));
        const routeTotalSec = dynamicDays * 86400;
        const progress = Math.min(simElapsedRef.current / routeTotalSec, 1);

        const TWP = timedWpRef.current;

        const pos = routePos(progress, TWP, wps);
        const hdg = routeHeading(progress, TWP, wps);
        const hdgDeg = ((hdg * 180) / Math.PI + 360) % 360;

        // 상태 업데이트
        dispatch({ type: 'SET_PROGRESS', payload: progress });
        dispatch({ type: 'SET_ELAPSED', payload: simElapsedRef.current });
        dispatch({
          type: 'SET_SHIP_STATE',
          payload: { lat: pos.lat, lon: pos.lon, heading: hdgDeg },
        });

        // 타임라인 일수 동기화
// //! [Original Code] 
//        const routeDays = ROUTE_DAYS[routeKey] || 14;
//        const dayValue = Math.min(routeDays, Math.floor(progress * routeDays));
// //* [Modified Code] 동적으로 계산된 남은 일수로 업데이트 (소수점 유지)
        const routeDays = dynamicDays;
        const dayValue = Math.min(routeDays, progress * routeDays);
        dispatch({ type: 'SET_TIMELINE', payload: dayValue });

        // HUD 업데이트 (10프레임마다, 성능 최적화)
        lastHudUpdate++;
        if (lastHudUpdate >= 10) {
          lastHudUpdate = 0;
          const distKm = calculateRouteDistanceKM(wps);
          const speedKmH = (distKm / routeTotalSec) * mult * 3600;
          const speedKnots = (speedKmH / 1.852).toFixed(1);
          const sea = getSeaState(pos.lat);

          // 해빙 농도 추정 (위도 기반)
          const sicVal =
            pos.lat < 60
              ? 0
              : pos.lat < 68
                ? ((pos.lat - 60) / 8) * 0.3
                : pos.lat < 75
                  ? 0.3 + ((pos.lat - 68) / 7) * 0.4
                  : pos.lat < 82
                    ? 0.7 + ((pos.lat - 75) / 7) * 0.25
                    : 0.95;

          // 위험도 라벨
          let dangerLabel, dangerCls;
          if (sicVal < 0.15) {
            dangerLabel = '낮음 🟢';
            dangerCls = 'safe';
          } else if (sicVal < 0.4) {
            dangerLabel = '보통 🟡';
            dangerCls = 'moderate';
          } else if (sicVal < 0.7) {
            dangerLabel = '높음 🟠';
            dangerCls = 'warning';
          } else {
            dangerLabel = '극심 🔴';
            dangerCls = 'critical';
          }

          // 현재 단계 판별
          let phase;
          if (progress < 0.02) phase = '출항';
          else if (pos.lat > 66) phase = '북극 항해 중';
          else if (progress > 0.95) phase = '입항 접근';
          else phase = '항해 중';

          // 수온 추정 (위도 기반)
          const tempEst =
            pos.lat > 80
              ? -1.8
              : pos.lat > 70
                ? -0.5
                : pos.lat > 60
                  ? 2.1
                  : 8.5;

          dispatch({
            type: 'UPDATE_HUD',
            payload: {
              speed: speedKnots + ' kn',
              throttle: '자동 ×' + Math.round(mult / 20),
              progress: (progress * 100).toFixed(1) + '%',
              position: pos.lat.toFixed(2) + '°N, ' + pos.lon.toFixed(2) + '°E',
              iceState:
                sicVal > 0.5
                  ? '결빙 수역'
                  : sicVal > 0.15
                    ? '해빙 경계'
                    : '개방 수역',
              phase,
              danger: dangerLabel,
              dangerClass: dangerCls,
              iceClass: shipSpecsRef.current.iceClass || 'PC2',
              sic: Math.round(sicVal * 100) + '%',
              temp: (tempEst >= 0 ? '+' : '') + tempEst.toFixed(1) + '°C',
              hs: sea.Hs.toFixed(1) + ' m',
              seaLabel: sea.label,
            },
          });
        }

        // ── Cesium 선박 엔티티 위치 업데이트 (모든 모드에서) ──
        if (cesiumRef.current && cesiumRef.current.updateShipEntity) {
          cesiumRef.current.updateShipEntity(pos, hdgDeg, shipSpecsRef.current);
        }

        // ── Cesium 카메라 추적 (SATELLITE/WIDE 모드 전용) ──
        const viewer = viewerRef.current;
        const curMode = currentModeRef.current;
        if (
          viewer && !viewer.isDestroyed() &&
          !userCameraInteracting.current &&
          (curMode === 'SATELLITE' || curMode === 'WIDE')
        ) {
          try {
            const camPos = viewer.camera.positionCartographic;
            const currentAlt = camPos ? camPos.height : (curMode === 'WIDE' ? 3000000 : 120000);
// //! [Original Code] 
//            viewer.camera.setView({
//              destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, currentAlt),
//              orientation: {
//                heading: viewer.camera.heading,
//                pitch: viewer.camera.pitch,
//                roll: 0,
//              },
//            });
// //* [Modified Code] 카메라가 바라보는 타겟(중심)을 선박으로 유지 (화면 하단 쏠림 방지)
            const target = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat);
            const pitch = viewer.camera.pitch;
            const range = currentAlt / Math.sin(Math.abs(pitch));
            viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, range));
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          } catch (e) {
            /* ignore */
          }
        }

        // 항해 완료
        if (progress >= 1) {
          dispatch({ type: 'SET_SIMULATING', payload: false });
        }

        // BRIDGE / FOLLOW 모드: Three.js 선박 시각 이동
        if (curMode === 'BRIDGE' || curMode === 'FOLLOW') {
          const three = threeRef.current;
          if (three?.shipPivot) {
            // Base Reference: 출발항 기준 위/경도 직사영 사용 (렌더링 동기화)
            const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
            const METERS_PER_DEGREE_LAT = 111132.954;
            const mPerDegLon = 111319.491 * Math.cos((depPort.lat * Math.PI) / 180);
            three.shipPivot.position.x = ((pos.lon - depPort.lon) * mPerDegLon) / 1.5;
            three.shipPivot.position.z =
              (-(pos.lat - depPort.lat) * METERS_PER_DEGREE_LAT) / 1.5;
            // 선박 흔들림 (roll/pitch/heave)
            if (three.updateShipMotion) three.updateShipMotion(dt, pos.lat);
          }
          // 실제 빙산 위치 5초마다 갱신 (선박 이동에 따라 50km 내 빙산 재계산)
          if (
            realBergsRef.current.length > 0 &&
            now - lastBergsUpdateRef.current > 5000
          ) {
            threeRef.current?.updateRealBergs(
              realBergsRef.current,
              pos.lat,
              pos.lon,
            );
            lastBergsUpdateRef.current = now;
          }
        }
      }

      // ── 수동 조종 키보드 입력 처리 ──
      const k = keys.current;
      if (
        k &&
        (k['KeyW'] || k['KeyS'] || k['KeyA'] || k['KeyD'] || k['KeyX'])
      ) {
        // 스로틀 (W/S) — 천천히 올라가고 천천히 내려감
        if (k['KeyW']) manualThrottle = Math.min(manualThrottle + dt * 25, 100);
        if (k['KeyS']) manualThrottle = Math.max(manualThrottle - dt * 25, -20);
        if (k['KeyX']) manualThrottle *= 0.9; // 급정지 대신 부드럽게 감속

        // 타 (A/D) — 관성 기반 선회: 천천히 돌기 시작, 천천히 멈춤
        const maxTurnRate = 0.4;
        let targetTurn = 0;
        if (k['KeyA']) targetTurn = -maxTurnRate;
        if (k['KeyD']) targetTurn = maxTurnRate;
        manualTurnRate += (targetTurn - manualTurnRate) * dt * 1.5; // 부드럽게 가감속
        if (Math.abs(manualTurnRate) < 0.001) manualTurnRate = 0;
        manualHeading += manualTurnRate * dt;

        // 속도 계산 — 관성 강하게 (느리게 반응)
        const targetSpeed = manualThrottle * 0.3;
        manualSpeed += (targetSpeed - manualSpeed) * dt * 0.8;

        // Three.js 선박 위치 업데이트
        const moveScale = 40;
        const three = threeRef.current;
        if (three && three.shipPivot) {
          three.shipPivot.rotation.y = -manualHeading;

          // 수동 이동 시 Three.js 좌표 평면을 기준으로 전역 위도/경도를 역산출해 동기화
          three.shipPivot.position.x +=
            Math.sin(manualHeading) * manualSpeed * dt * moveScale;
          three.shipPivot.position.z -=
            Math.cos(manualHeading) * manualSpeed * dt * moveScale;

          const depPortM = PORTS[state.departurePort] || PORTS.BUSAN;
          const METERS_PER_DEGREE_LAT = 111132.954;
          const mPerDegLon = 111319.491 * Math.cos((depPortM.lat * Math.PI) / 180);
          const newLon =
            depPortM.lon + (three.shipPivot.position.x * 1.5) / mPerDegLon;
          const newLat =
            depPortM.lat - (three.shipPivot.position.z * 1.5) / METERS_PER_DEGREE_LAT;

          dispatch({
            type: 'SET_SHIP_STATE',
            payload: {
              lat: newLat,
              lon: newLon,
              heading: ((manualHeading * 180) / Math.PI + 360) % 360,
            },
          });
        }

        // HUD 수동 계기 업데이트
        dispatch({
          type: 'SET_MANUAL',
          payload: {
            manualThrottle: Math.round(manualThrottle),
            manualSpeed: Math.round(manualSpeed * 10) / 10,
            manualHeading: Math.round(
              ((manualHeading * 180) / Math.PI + 360) % 360,
            ),
            manualYawRate: Math.round(manualTurnRate * 100) / 100,
          },
        });
      }

      // deck.gl Cesium 카메라 싱크
      const deck = deckRef.current;
      if (deck && deck.syncView && viewerRef.current) {
        try {
          deck.syncView();
        } catch (e) {}
      }

      // BRIDGE/FOLLOW: WMS 데이터 레이어 → 바다 색상 오버레이
      const curMode = currentModeRef.current;
      if (curMode === 'BRIDGE' || curMode === 'FOLLOW') {
        const three = threeRef.current;
        if (three && three.updateOceanOverlay) {
          const ship = shipStateRef.current;
          const grid = iceGridCacheRef.current;
          const iceFn = (lon, lat) => {
            const estimate = (la) => {
              if (la < 60) return 0;
              if (la < 68) return ((la - 60) / 8) * 0.3;
              if (la < 75) return 0.3 + ((la - 68) / 7) * 0.4;
              if (la < 82) return 0.7 + ((la - 75) / 7) * 0.25;
              return 0.95;
            };
            if (!grid || grid.size === 0) return estimate(lat);
            const latF = Math.floor(lat),
              lonF = Math.floor(lon);
            const tLat = lat - latF,
              tLon = lon - lonF;
            const lookup = (la, lo) => {
              const v = grid.get(`${la},${lo}`);
              if (v !== undefined) return v;
              for (let dl = -1; dl <= 1; dl++) {
                for (let dn = -1; dn <= 1; dn++) {
                  if (dl === 0 && dn === 0) continue;
                  const v2 = grid.get(`${la + dl},${lo + dn}`);
                  if (v2 !== undefined) return v2;
                }
              }
              return estimate(la);
            };
            const c00 = lookup(latF, lonF);
            const c10 = lookup(latF + 1, lonF);
            const c01 = lookup(latF, lonF + 1);
            const c11 = lookup(latF + 1, lonF + 1);
            return (
              c00 * (1 - tLat) * (1 - tLon) +
              c10 * tLat * (1 - tLon) +
              c01 * (1 - tLat) * tLon +
              c11 * tLat * tLon
            );
          };

          // oceanOverlayModeRef에 저장된 모드 사용 (handleLayerToggle에서 갱신)
          // 'none'일 때는 호출 안 함 — handleLayerToggle에서 이미 리셋 처리
          const activeMode = oceanOverlayModeRef.current;
          if (activeMode !== 'none') {
            three.updateOceanOverlay(activeMode, ship.lon, ship.lat, iceFn);
          }
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [dispatch, keys]);

  // API 레이어 상태
  const [layerStates, setLayerStates] = useState({
    nsidcConc: false,
    copThick: false,
    nsidcEdge: false,
    esaSar: false,
    gebcoBathy: false,
    s2True: false,
    s2Ndsi: false,
    gibsIce: false,
  });
  const [gebcoOpacity, setGebcoOpacity] = useState(75);

  // 항로 표시 상태 (다중 체크박스)
  const [routeVisibility, setRouteVisibility] = useState({
    NSR: true,
    NWP: false,
    TSR: false,
    SUEZ: false,
    CAPE: false,
    ETC: false,
  });
  const handleRouteVisibilityChange = useCallback((key, visible) => {
    setRouteVisibility((prev) => ({ ...prev, [key]: visible }));
    // Cesium polyline 표시/숨김은 CesiumGlobe에서 처리
    const viewer = viewerRef.current;
    if (viewer && viewer._routeEntities && viewer._routeEntities[key]) {
      viewer._routeEntities[key].show = visible;
    }
  }, []);

  const [routeDistances, setRouteDistances] = useState({});
  const [generatedRoutes, setGeneratedRoutes] = useState({});

  useEffect(() => {
    const depPort = PORTS[state.departurePort];
    const arrPort = PORTS[state.arrivalPort];
    if (!depPort || !arrPort) return;
    
    let cancelled = false;
    (async () => {
      try {
        const routeKeys = ['NSR', 'NWP', 'TSR', 'SUEZ', 'CAPE', 'ETC'];
        const results = await Promise.all(
          routeKeys.map(async key => {
            if (isSameRegion(depPort.id, arrPort.id) && key !== 'ETC') {
              return { key, dist: '-' };
            }
            if (!isSameRegion(depPort.id, arrPort.id) && key === 'ETC') {
              return { key, dist: '-' };
            }
            const wps = await generateRoute(depPort, arrPort, key, null, []); // 해빙 데이터 없이 빠른 생성
            return { key, dist: calculateRouteDistanceKM(wps) };
          })
        );
        if (!cancelled) {
          const distances = {};
          const paths = {};
          results.forEach(r => {
            distances[r.key] = r.dist;
            paths[r.key] = r.wps;
          });
          setRouteDistances(distances);
          setGeneratedRoutes(paths);
        }
      } catch (e) {
        console.warn('[App] 거리 동적 계산 실패:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [state.departurePort, state.arrivalPort]);

  // 라우팅 평가 결과
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [showSpecsModal, setShowSpecsModal] = useState(false);
  const [pendingPolarParams, setPendingPolarParams] = useState(null);
  const [routeAlert, setRouteAlert] = useState(null);

  // Open-Meteo 실시간 기상 데이터 (파고·기온·가시거리)
  const [weatherData, setWeatherData] = useState(null);
  useEffect(() => {
    fetchWeather()
      .then(setWeatherData)
      .catch(() => {}); // 데이터 없으면 수동 입력 fallback
  }, []);

  // Cesium viewer 준비되면 LIVE 빙산 데이터 로딩 + 카메라 상호작용 감지
  useEffect(() => {
    if (!cesiumViewerState) return;
    const handler = new Cesium.ScreenSpaceEventHandler(
      cesiumViewerState.scene.canvas,
    );
    const startInteract = () => {
      userCameraInteracting.current = true;
      if (cameraInteractTimer.current) clearTimeout(cameraInteractTimer.current);
    };
    const endInteract = () => {
      if (cameraInteractTimer.current) clearTimeout(cameraInteractTimer.current);
      cameraInteractTimer.current = setTimeout(() => {
        userCameraInteracting.current = false;
      }, 3000);
    };
    handler.setInputAction(startInteract, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(endInteract, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(startInteract, Cesium.ScreenSpaceEventType.MIDDLE_DOWN);
    handler.setInputAction(endInteract, Cesium.ScreenSpaceEventType.MIDDLE_UP);
    handler.setInputAction(startInteract, Cesium.ScreenSpaceEventType.RIGHT_DOWN);
    handler.setInputAction(endInteract, Cesium.ScreenSpaceEventType.RIGHT_UP);
    handler.setInputAction(() => { startInteract(); endInteract(); }, Cesium.ScreenSpaceEventType.WHEEL);

    // 마우스 위치 → 위경도 변환 (출항 전 기상 HUD용, 200ms 스로틀)
    let lastMouseUpdate = 0;
    handler.setInputAction((movement) => {
      if (isSimulatingRef.current) return;
      const now = Date.now();
      if (now - lastMouseUpdate < 200) return;
      lastMouseUpdate = now;
      const cart = cesiumViewerState.camera.pickEllipsoid(
        movement.endPosition, cesiumViewerState.scene.globe.ellipsoid,
      );
      if (cart) {
        const carto = Cesium.Cartographic.fromCartesian(cart);
        setMouseGlobePos({
          lat: Cesium.Math.toDegrees(carto.latitude),
          lon: Cesium.Math.toDegrees(carto.longitude),
        });
      }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    handleMonthChange('live');
    return () => {
      handler.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cesiumViewerState]);

  // Cesium 뷰어 준비 완료 → 선박 출발 위치로 카메라 이동
  const handleViewerReady = useCallback((viewer) => {
    viewerRef.current = viewer;
    setCesiumViewerState(viewer);
    // 초기 지구본 뷰(13,000km) 대신 선박 위치(부산)로 이동
    const { lon, lat } = shipStateRef.current;
    setTimeout(() => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(lon, lat, 120000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-80),
            roll: 0,
          },
          duration: 2.0,
        });
      }
    }, 2500);
  }, []);

  // 시뮬레이션 제어
  const handleStart = useCallback(() => {
    if (!state.isSimulating) {
      // 시작 시 simElapsed를 현재 progress 기반으로 복원
// //! [Original Code] 
//      simElapsedRef.current = state.simProgress * getTotalSeconds(state.currentRouteKey);
// //* [Modified Code] 
      const distKm = calculateRouteDistanceKM(activeWaypoints);
      const dynamicDays = Math.max(1, Math.round(distKm / (15 * 1.852 * 24)));
      simElapsedRef.current = state.simProgress * (dynamicDays * 86400);
      dispatch({ type: 'SET_ELAPSED', payload: simElapsedRef.current });
    }
    dispatch({ type: 'SET_SIMULATING', payload: !state.isSimulating });
  }, [state.isSimulating, state.simProgress, state.currentRouteKey, dispatch]);

  const handleReset = useCallback(() => {
    simElapsedRef.current = 0;
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  // 카메라 모드
  const handleModeChange = useCallback(
    (mode) => {
      dispatch({ type: 'SET_MODE', payload: mode });
      dispatch({
        type: 'SET_BRIDGE_VISIBLE',
        payload: mode === 'BRIDGE' || mode === 'FOLLOW',
      });

      // SATELLITE/WIDE 전환 시 카메라를 선박 위치로 이동
      if (mode === 'SATELLITE' || mode === 'WIDE') {
        const { lon, lat } = state.shipState;
        threeRef.current?.updateOceanOverlay('none', lon, lat, null);

        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) {
          const alt = mode === 'WIDE' ? 3000000 : 120000;
          const pitch = mode === 'WIDE' ? -60 : -80;
// //! [Original Code]
//          viewer.camera.flyTo({
//            destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
//            orientation: {
//              heading: 0,
//              pitch: Cesium.Math.toRadians(pitch),
//              roll: 0,
//            },
//            duration: 1.0,
//          });
// //* [Modified Code] flyToBoundingSphere를 사용하여 정중앙 정렬
          const pitchRad = Cesium.Math.toRadians(pitch);
          const range = alt / Math.sin(Math.abs(pitchRad));
          viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat), 0), {
            offset: new Cesium.HeadingPitchRange(0, pitchRad, range),
            duration: 1.0,
          });
        }
      }
    },
    [dispatch, state.shipState],
  );

  const handleManualToggle = useCallback(() => {
    dispatch({ type: 'SET_MANUAL_MODE', payload: !state.manualMode });
  }, [state.manualMode, dispatch]);

  // 배속/타임라인
  const handleMultiplierChange = useCallback(
    (value) => {
      dispatch({ type: 'SET_MULTIPLIER', payload: Number(value) });
    },
    [dispatch],
  );

  const handleTimelineChange = useCallback(
    (value) => {
      // 슬라이더 스크러빙 시 기존 렌더링 락(카메라 조작) 강제 해제
      userCameraInteracting.current = false;
      const day = Number(value);
      dispatch({ type: 'SET_TIMELINE', payload: day });
      // 타임라인 슬라이더를 드래그하면 시뮬레이션 위치도 이동
// //! [Original Code] 
//      const totalDays = ROUTE_DAYS[state.currentRouteKey] || 14;
//      const newProgress = Math.min(1, day / totalDays);
//      const newElapsed = newProgress * getTotalSeconds(state.currentRouteKey);
// //* [Modified Code] 실제 거리에 기반하여 progress 재계산
      const distKm = calculateRouteDistanceKM(activeWaypoints);
      const totalDays = Math.max(1, Math.round(distKm / (15 * 1.852 * 24)));
      const newProgress = Math.min(1, day / totalDays);
      const newElapsed = newProgress * (totalDays * 86400);
      simElapsedRef.current = newElapsed;
      dispatch({ type: 'SET_PROGRESS', payload: newProgress });
      dispatch({ type: 'SET_ELAPSED', payload: newElapsed });
// //! [Original Code]
//       // 선박 위치 즉시 업데이트
//       const wps = activeWaypoints;
//       const TWP = timedWaypoints;
//       const pos = routePos(newProgress, TWP, wps);
//       const hdg = routeHeading(newProgress, TWP, wps);
//       dispatch({
//         type: 'SET_SHIP_STATE',
//         payload: {
//           lat: pos.lat,
//           lon: pos.lon,
//           heading: ((hdg * 180) / Math.PI + 360) % 360,
//         },
//       });
//     },
//     [dispatch, state.currentRouteKey, timedWaypoints],
// //* [Modified Code] 선박 위치 업데이트 및 정지 시 카메라/객체 강제 뷰 리렌더링
      const wps = activeWaypoints;
      const TWP = timedWaypoints;
      const pos = routePos(newProgress, TWP, wps);
      const hdg = routeHeading(newProgress, TWP, wps);
      const hdgDeg = ((hdg * 180) / Math.PI + 360) % 360;
      
      dispatch({
        type: 'SET_SHIP_STATE',
        payload: { lat: pos.lat, lon: pos.lon, heading: hdgDeg },
      });

      // 일시 정지(또는 수동 모드) 중일 때 스크러빙하면 메인루프가 3D뷰를 갱신하지 않으므로 수동 트리거
      if (!isSimulatingRef.current || manualModeRef.current) {
        if (cesiumRef.current && cesiumRef.current.updateShipEntity) {
          cesiumRef.current.updateShipEntity(pos, hdgDeg, shipSpecsRef.current);
        }

        const viewer = viewerRef.current;
        const curMode = currentModeRef.current;
        if (viewer && !viewer.isDestroyed() && !userCameraInteracting.current && (curMode === 'SATELLITE' || curMode === 'WIDE')) {
          try {
            const camPos = viewer.camera.positionCartographic;
            const currentAlt = camPos ? camPos.height : (curMode === 'WIDE' ? 3000000 : 120000);
// //! [Original Code]
//            viewer.camera.setView({
//              destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, currentAlt),
//              orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
//            });
// //* [Modified Code] 중앙 정렬된 lookAt 사용
            const target = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat);
            const pitch = viewer.camera.pitch;
            const range = currentAlt / Math.sin(Math.abs(pitch));
            viewer.camera.lookAt(target, new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, range));
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          } catch(e) {}
        }
        
        if ((curMode === 'BRIDGE' || curMode === 'FOLLOW') && threeRef.current && threeRef.current.shipPivot) {
          const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
          const METERS_PER_DEGREE_LAT = 111132.954;
          const mPerDegLon = 111319.491 * Math.cos((depPort.lat * Math.PI) / 180);
          threeRef.current.shipPivot.position.x = ((pos.lon - depPort.lon) * mPerDegLon) / 1.5;
          threeRef.current.shipPivot.position.z = (-(pos.lat - depPort.lat) * METERS_PER_DEGREE_LAT) / 1.5;
          if (threeRef.current.updateShipMotion) threeRef.current.updateShipMotion(0, pos.lat);
        }
      }
    },
    [dispatch, state.currentRouteKey, timedWaypoints, activeWaypoints, state.departurePort],
  );

  // 항로/선박 제원
  const handleRouteChange = useCallback(
    (routeKey) => {
      dispatch({ type: 'SET_ROUTE', payload: routeKey });
      dispatch({ type: 'SET_GENERATED_WAYPOINTS', payload: null }); // 경로 변경 시 리셋
    },
    [dispatch],
  );

  const handleSpecChange = useCallback(
    (field, value) => {
      dispatch({ type: 'SET_SHIP_SPECS', payload: { [field]: value } });
    },
    [dispatch],
  );

  const handlePresetLoad = useCallback(
    (presetKey) => {
      const preset = SHIP_PRESETS[presetKey];
      if (preset) dispatch({ type: 'SET_SHIP_SPECS', payload: preset });
    },
    [dispatch],
  );

  // 제원 적용 버튼 — 모달 오픈
  const handleApplySpecs = useCallback((polarParams) => {
    setPendingPolarParams(polarParams);
    setShowSpecsModal(true);
  }, []);

  // FOV
  const handleFovChange = useCallback(
    (value) => {
      dispatch({ type: 'SET_FOV', payload: Number(value) });
      dispatch({ type: 'SET_FOV_OVERRIDE', payload: true });
    },
    [dispatch],
  );

  // 해빙 데이터 월 변경
  const handleMonthChange = useCallback(
    async (month) => {
      const apiMonth = month === 'live' ? 'latest' : month;

      // ── 1. Cesium 위성영상 + WMS 오버레이 TIME 업데이트 ──
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed() && viewer._updateWmsTime) {
        viewer._updateWmsTime(apiMonth);
      }

      // ── 2. 백엔드 해빙 데이터 로드 (DeckOverlay + ThreeOverlay) ──
      try {
        const iceData = await fetchIceConcentration(apiMonth);

        // DeckOverlay 포맷으로 변환
        const icePoints = (iceData?.cells || []).map((c) => ({
          lon: c.lon,
          lat: c.lat,
          weight: c.concentration,
        }));

        const isLive = month === 'live';

        // ── A. 빙산 Cesium 엔티티 갱신 (최신: NIC 실데이터 / 아카이브: 고농도 셀 파생) ──
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) {
          for (const ent of bergCesiumEntitiesRef.current)
            viewer.entities.remove(ent);
          bergCesiumEntitiesRef.current = [];

          let bergList = [];
          if (isLive) {
            try {
              const bergData = await fetchIcebergs();
              // 업데이트 시간 저장 (클릭 팝업에서 사용)
              if (bergData?.updated_at && viewer) {
                viewer._bergUpdatedAt = bergData.updated_at;
              }
              bergList = (bergData?.bergs || [])
                .filter((b) => b.lat >= 0) // 북반구만
                .map((b) => ({
                  id: b.id,
                  lon: b.lon,
                  lat: b.lat,
                  source: b.source || '',
                  period: b.period || '',
                  length_m: b.length_m || 5000,
                  width_m: b.width_m || 2000,
                }));
            } catch (e) {
              console.warn('[BergData] fetch 실패:', e.message);
            }
          } else {
            // 아카이브: 해당 월 고농도 셀(≥0.8) → 빙산 위치로 활용
            const BERG_MAX = 300;
            const highConc = icePoints.filter(
              (c) => c.lat > 60 && c.weight >= 0.8,
            );
            const step =
              highConc.length > BERG_MAX
                ? Math.floor(highConc.length / BERG_MAX)
                : 1;
            bergList = highConc
              .filter((_, i) => i % step === 0)
              .slice(0, BERG_MAX)
              .map((c) => ({
                id: null,
                lon: c.lon,
                lat: c.lat,
                source: 'archive',
                length_m: 10000 + c.weight * 20000,
                width_m: 5000 + c.weight * 10000,
              }));
          }

          // ── PointPrimitiveCollection으로 렌더링 (700+ 빙산 성능 최적화) ──
          // 기존 컬렉션 제거
          if (viewer._bergPointCollection) {
            viewer.scene.primitives.remove(viewer._bergPointCollection);
            viewer._bergPointCollection = null;
          }
          const pointCollection = viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection()
          );
          viewer._bergPointCollection = pointCollection;

          for (const b of bergList) {
            const isCopernicus = (b.source || '').includes('Copernicus');
            const color = isCopernicus
              ? Cesium.Color.ORANGE
              : Cesium.Color.YELLOW;

            pointCollection.add({
              position: Cesium.Cartesian3.fromDegrees(b.lon, b.lat, 0),
              pixelSize: isCopernicus ? 7 : 10,
              color,
              outlineColor: isCopernicus
                ? Cesium.Color.DARKORANGE
                : Cesium.Color.ORANGERED,
              outlineWidth: 2,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
              id: b, // 클릭 시 데이터 접근용
            });

            // NIC/IIP 빙산만 라벨 (Copernicus 723개 라벨은 성능 이슈)
            if (b.id && !isCopernicus) {
              const ent = viewer.entities.add({
                position: Cesium.Cartesian3.fromDegrees(b.lon, b.lat, 0),
                label: {
                  text: b.id,
                  font: '11px sans-serif',
                  fillColor: Cesium.Color.YELLOW,
                  outlineColor: Cesium.Color.BLACK,
                  outlineWidth: 2,
                  style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                  pixelOffset: new Cesium.Cartesian2(0, -14),
                  scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 5e6, 0),
                },
              });
              bergCesiumEntitiesRef.current.push(ent);
            }
          }

          // 빙산 클릭 핸들러 (source/period 팝업)
          if (!viewer._bergClickHandler) {
            const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            handler.setInputAction((click) => {
              const picked = viewer.scene.pick(click.position);
              if (picked?.primitive instanceof Cesium.PointPrimitive && picked.primitive.id) {
                const b = picked.primitive.id;
                const isCop = (b.source || '').includes('Copernicus');
                const lines = [`🧊 ${b.id || 'Iceberg'}`];
                lines.push(`📍 ${b.lat?.toFixed(4)}°N, ${b.lon?.toFixed(4)}°E`);
                lines.push(`📡 ${b.source}`);
                if (b.period) lines.push(`📅 ${b.period}`);
                if (b.length_m) lines.push(`📏 ${(b.length_m/1000).toFixed(1)}km × ${(b.width_m/1000).toFixed(1)}km`);
                if (viewer._bergUpdatedAt) lines.push(`🔄 Updated: ${viewer._bergUpdatedAt}`);
                alert(lines.join('\n'));
              }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
            viewer._bergClickHandler = handler;
          }

          // ThreeOverlay용: 항상 북극(lat>60) 고농도(≥0.8) 셀 사용 (NIC 데이터는 남반구라 불가)
          const BERG_MAX_THREE = 300;
          const highConcCells = icePoints.filter(
            (c) => c.lat > 60 && c.weight >= 0.8,
          );
          const threeStep =
            highConcCells.length > BERG_MAX_THREE
              ? Math.floor(highConcCells.length / BERG_MAX_THREE)
              : 1;
          realBergsRef.current = highConcCells
            .filter((_, i) => i % threeStep === 0)
            .slice(0, BERG_MAX_THREE)
            .map((c) => ({
              lon: c.lon,
              lat: c.lat,
              size: 8000 + c.weight * 15000,
            }));
        }

        // DeckOverlay 업데이트 (보조)
        deckRef.current?.updateLayers({ iceData: icePoints, realBergData: [] });

        // BRIDGE / FOLLOW 모드: 현재 선박 위치 기준 초기 반영
        const { lat, lon } = state.shipState;
        threeRef.current?.updateRealBergs(realBergsRef.current, lat, lon);

        // 해빙 격자 O(1) lookup 캐시 생성 (BRIDGE/FOLLOW 바다 색상용)
        const grid = new Map();
        for (const c of icePoints) {
          const key = `${Math.round(c.lat)},${Math.round(c.lon)}`;
          const existing = grid.get(key);
          if (!existing || c.weight > existing) grid.set(key, c.weight);
        }
        iceGridCacheRef.current = grid;

        // HUD 데이터 소스 라벨 업데이트
        const rawDate = iceData?.date || '';
        const fmtDate = rawDate.length === 8
          ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
          : rawDate;
        const source =
          month === 'live'
            ? `실시간 (${fmtDate})`
            : `아카이브 ${month}`;
        dispatch({
          type: 'SET_ICE_DATA',
          payload: { data: iceData, key: month, source },
        });

        const cellCount = iceData?.cell_count || icePoints.length;
        showToast(
          `${source} 로드 완료 — ${cellCount.toLocaleString()}개 셀, WMS 위성영상 갱신됨`,
        );
      } catch (err) {
        console.warn('[IceData] fetch 실패, 절차적 폴백 유지:', err.message);
        dispatch({
          type: 'SET_ICE_DATA',
          payload: { data: null, key: month, source: '절차적 폴백' },
        });
        showToast(
          `해빙 데이터 로드 실패: ${err.message} — 절차적 폴백 사용 중`,
        );
      }
    },
    [state.shipState, dispatch, showToast],
  );

  // API 레이어 토글
  // sampleIce: 격자 캐시에서 O(1) 해빙 농도 조회
  const sampleIceFn = useCallback((lon, lat) => {
    const grid = iceGridCacheRef.current;
    if (!grid) {
      // 캐시 없으면 위도 기반 폴백
      if (lat < 60) return 0;
      if (lat < 68) return ((lat - 60) / 8) * 0.3;
      if (lat < 75) return 0.3 + ((lat - 68) / 7) * 0.4;
      if (lat < 82) return 0.7 + ((lat - 75) / 7) * 0.25;
      return 0.95;
    }
    const key = `${Math.round(lat)},${Math.round(lon)}`;
    return grid.get(key) ?? 0;
  }, []);

  const handleLayerToggle = useCallback(
    (layerKey, checked) => {
      setLayerStates((prev) => ({ ...prev, [layerKey]: checked }));
      const viewer = viewerRef.current;
      if (!viewer || !viewer._apiLayers) return;
      const layerMap = {
        gebcoBathy: 'gebco',
        nsidcConc: 'nsidcConc',
        copThick: 'copThick',
        nsidcEdge: 'nsidcEdge',
        esaSar: 'esaSar',
        s2True: 's2True',
        s2Ndsi: 's2Ndsi',
      };
      // ── nsidcConc: GIBS WMS 해빙 농도 (자연스러운 렌더링) ──
      if (layerKey === 'nsidcConc') {
        const wmsLayer = viewer._apiLayers?.nsidcConc;
        if (wmsLayer) wmsLayer.show = false;

        if (checked) {
          if (nsidcConcCanvasRef.current) {
            try { viewer.imageryLayers.remove(nsidcConcCanvasRef.current); } catch (_) {}
            nsidcConcCanvasRef.current = null;
          }
          try {
            const provider = new Cesium.WebMapServiceImageryProvider({
              url: '/nsidc-proxy/',
              layers: 'AMSRU2_Sea_Ice_Concentration_25km',
              parameters: { transparent: 'true', format: 'image/png' },
              tileWidth: 256, tileHeight: 256,
              enablePickFeatures: false,
            });
            const ly = viewer.imageryLayers.addImageryProvider(provider);
            ly.alpha = 0.8;
            nsidcConcCanvasRef.current = ly;
            viewer.imageryLayers.raiseToTop(ly);
          } catch (e) { console.warn('[nsidcConc] 실패:', e); }
        } else {
          if (nsidcConcCanvasRef.current) {
            try { viewer.imageryLayers.remove(nsidcConcCanvasRef.current); } catch (_) {}
            nsidcConcCanvasRef.current = null;
          }
        }
      }

      // 기타 WMS 레이어 토글
      const cesiumLayerKey = layerMap[layerKey];
      if (cesiumLayerKey && layerKey !== 'nsidcConc') {
        const cesiumLayer = viewer._apiLayers[cesiumLayerKey];
        if (cesiumLayer) {
          cesiumLayer.show = checked;
          if (checked) {
            try {
              viewer.imageryLayers.raiseToTop(cesiumLayer);
            } catch (_) {}
          }
        }
      }

      // gibsIce → 해빙 자연색 모드: NASA GIBS 해빙 + 베이스 무채색
      if (layerKey === 'gibsIce') {
        const baseLayer = viewer.imageryLayers.get(0);

        if (checked) {
          // ── 베이스 레이어: 무채색 (땅=밝은 회색, 바다=어두운색) ──
          if (baseLayer) {
            baseLayer.saturation = 0.0;
            baseLayer.brightness = 0.7;
            baseLayer.contrast = 0.9;
          }
          viewer.scene.globe.enableLighting = false;
          viewer.scene.atmosphere.show = false;
          viewer.scene.fog.enabled = false;
          viewer.scene.globe.showGroundAtmosphere = false;
          viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#1a2535');

          // ── 기존 gibsIce 레이어 제거 ──
          if (cesiumIceLayerRef.current) {
            try { viewer.imageryLayers.remove(cesiumIceLayerRef.current); } catch (_) {}
            cesiumIceLayerRef.current = null;
          }

          // ── NASA GIBS MODIS 해빙 레이어 (흰색 스타일) ──
          const gibsDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
          try {
            const iceProvider = new Cesium.WebMapServiceImageryProvider({
              url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
              layers: 'MODIS_Terra_Sea_Ice',
              parameters: { transparent: 'true', format: 'image/png', TIME: gibsDate },
              tileWidth: 512, tileHeight: 512,
              enablePickFeatures: false, credit: 'NASA GIBS',
            });
            const iceLayer = viewer.imageryLayers.addImageryProvider(iceProvider);
            iceLayer.alpha = 0.9;
            iceLayer.brightness = 2.0;
            iceLayer.saturation = 0.0;
            iceLayer.contrast = 1.3;
            cesiumIceLayerRef.current = iceLayer;
            viewer.imageryLayers.raiseToTop(iceLayer);
          } catch (e) {
            console.warn('[gibsIce] GIBS layer 실패:', e);
          }
        } else {
          // ── 복원 ──
          if (baseLayer) {
            baseLayer.saturation = 1.0;
            baseLayer.brightness = 1.0;
            baseLayer.contrast = 1.0;
          }
          viewer.scene.globe.enableLighting = true;
          viewer.scene.atmosphere.show = true;
          viewer.scene.fog.enabled = true;
          viewer.scene.globe.showGroundAtmosphere = true;

          if (cesiumIceLayerRef.current) {
            try { viewer.imageryLayers.remove(cesiumIceLayerRef.current); } catch (_) {}
            cesiumIceLayerRef.current = null;
          }
          // nsidcEdge 폴백 복원
          const edgeFb = viewer._apiLayers?.nsidcEdge;
          if (edgeFb) {
            edgeFb.show = layerStates.nsidcEdge || false;
            edgeFb.alpha = 0.7;
            edgeFb.brightness = 1.0;
            edgeFb.saturation = 1.0;
          }
        }
      }

      // WMS 레이어 토글 → BRIDGE/FOLLOW 바다 색상 모드 결정
      const oceanLayers = {
        gibsIce: 'ice',
        nsidcConc: 'ice',
        copThick: 'thickness',
        nsidcEdge: 'edge',
        gebcoBathy: 'depth',
      };
      if (layerKey in oceanLayers) {
        if (layerKey === 'nsidcConc') nsidcActiveRef.current = checked;

        let overlayMode;
        if (checked) {
          overlayMode = oceanLayers[layerKey];
        } else {
          const newStates = { ...layerStates, [layerKey]: false };
          overlayMode = 'none';
          for (const [key, mode] of Object.entries(oceanLayers)) {
            if (newStates[key]) {
              overlayMode = mode;
              break;
            }
          }
        }
        oceanOverlayModeRef.current = overlayMode;

        const mode = currentModeRef.current;
        if (mode === 'BRIDGE' || mode === 'FOLLOW') {
          const { lat, lon } = state.shipState;
          threeRef.current?.updateOceanOverlay(
            overlayMode,
            lon,
            lat,
            sampleIceFn,
          );
        }
      }
    },
    [state.shipState, sampleIceFn, layerStates],
  );

  // 위성 실사영상 (MODIS/VIIRS) 토글
  const [satVisible, setSatVisible] = useState(false);
  const handleSatToggle = useCallback((checked) => {
    setSatVisible(checked);
    const viewer = viewerRef.current;
    if (viewer && viewer._satLayers) {
      for (const lyr of viewer._satLayers) {
        lyr.show = checked;
      }
    }
  }, []);

  // GEBCO 투명도
  const handleGebcoOpacityChange = useCallback((value) => {
    setGebcoOpacity(value);
    const viewer = viewerRef.current;
    if (viewer && viewer._apiLayers && viewer._apiLayers.gebco) {
      viewer._apiLayers.gebco.alpha = value / 100;
    }
  }, []);

  // 라우팅 평가 — 항로 전체 구간에서 최악 빙해역 기준 POLARIS RIO 계산
  const handleEvaluate = useCallback(
    (formData) => {
      console.log('[Routing] evaluate:', formData);

      // 해빙 농도 조회 함수 (격자 캐시 우선, 없으면 위도 폴백)
      const grid = iceGridCacheRef.current;
      const sampleIce = (_lon, _lat) => {
        if (grid && grid.size > 0) {
          const v = grid.get(`${Math.round(_lat)},${Math.round(_lon)}`);
          if (v !== undefined) return v;
          for (let dl = -1; dl <= 1; dl++) {
            for (let dn = -1; dn <= 1; dn++) {
              if (dl === 0 && dn === 0) continue;
              const v2 = grid.get(
                `${Math.round(_lat) + dl},${Math.round(_lon) + dn}`,
              );
              if (v2 !== undefined) return v2;
            }
          }
        }
        if (_lat < 60) return 0;
        if (_lat < 68) return ((_lat - 60) / 8) * 0.3;
        if (_lat < 75) return 0.3 + ((_lat - 68) / 7) * 0.4;
        if (_lat < 82) return 0.7 + ((_lat - 75) / 7) * 0.25;
        return 0.95;
      };

      // 항로 전체 구간 샘플링 — 최악 구간(최고 농도) 기준으로 평가
      const currentWps = activeWaypoints;
      let worstLat = state.shipState.lat;
      let worstLon = state.shipState.lon;
      let worstConc = 0;
      for (const wp of currentWps) {
        const conc = sampleIce(wp.lon, wp.lat);
        if (conc > worstConc) {
          worstConc = conc;
          worstLat = wp.lat;
          worstLon = wp.lon;
        }
      }

      // 최악 구간의 해빙 조건으로 POLARIS 평가
      const iceConditions = deriveIceConditions(worstLon, worstLat, sampleIce);

      const result = evaluateRouting({
        isSanctionedCountry: formData.isSanctioned || false,
        hasNsraPermit: formData.hasNsra !== false,
        hasPwom: formData.hasPwom !== false,
        // Step 1c
        fuelType: formData.fuelType || 'MGO',
        hasHfoExemption: formData.hasHfoExemption || false,
        draft: formData.draft || state.shipSpecs.draft || 8.5,
        beam: state.shipSpecs.width || 30,
        maxRescueDays: formData.rescueDays || 7,
        designTempMargin: formData.tempMargin || 12,
        hasWinterization: formData.hasWinter !== false,
        hasZeroDischarge: formData.hasZeroDis !== false,
        hasPolarComms: formData.hasComms !== false,
        hasIceNavigator: formData.hasNavigator !== false,
        // Step 3d
        latitude: formData.latitude ?? worstLat,
        commsType: formData.commsType || 'GEO',
        // Step 4 — 항로별 실시간 기상 데이터 우선, 없으면 수동 입력값 사용
        shipType: formData.shipType || 'General',
        waveHeight: formData.waveHeight
          ?? weatherData?.routes?.[state.currentRouteKey]?.route_summary?.max_wave_height_m
          ?? weatherData?.route_summary?.max_wave_height_m ?? 0.0,
        visibilityKm: formData.visibilityKm
          ?? weatherData?.routes?.[state.currentRouteKey]?.route_summary?.min_visibility_km
          ?? weatherData?.route_summary?.min_visibility_km ?? 10.0,
        isTempBelowMinus10: formData.isColdRoute
          ?? weatherData?.routes?.[state.currentRouteKey]?.route_summary?.is_temp_below_minus_10
          ?? weatherData?.route_summary?.is_temp_below_minus_10
          ?? false,
        iceClass: state.shipSpecs.iceClass || 'PC2',
        iceConditions,
      });

      // 항로 거리 계산
      const suezWps = ROUTES.SUEZ;
      const currentDist = Math.round(calculateRouteDistanceKM(currentWps));
      const suezDist = Math.round(calculateRouteDistanceKM(suezWps));

      const finalReason =
        result.reason +
        ` (최악 구간: ${worstLat.toFixed(1)}°N, SIC ${Math.round(worstConc * 100)}%)`;
      setEvaluationResult({
        status: result.status,
        rioScore: result.rioScore,
        reason: finalReason,
        distances: {
          current: currentDist,
          suez: suezDist,
        },
      });

      showToast(
        `POLARIS 평가 완료: ${result.status} (최악 SIC ${Math.round(worstConc * 100)}%)`,
      );
      return {
        status: result.status,
        rioScore: result.rioScore,
        reason: finalReason,
      };
    },
    [state.shipState, state.shipSpecs, state.currentRouteKey, weatherData, showToast],
  );

  // 모달 확인 — 평가 실행 + 항로 불일치 감지
  const STATUS_TO_REROUTE = { REROUTE_SUEZ: 'SUEZ', REROUTE_CAPE: 'CAPE' };

  const handleModalConfirm = useCallback(() => {
    setShowSpecsModal(false);
    if (!pendingPolarParams) return;
    const { draft, rescueDays, tempMargin, checks } = pendingPolarParams;
    const evalResult = handleEvaluate({
      draft,
      rescueDays,
      tempMargin,
      hasPwom: checks.pwom,
      hasNsra: checks.nsra,
      hasWinter: checks.winter,
      hasZeroDis: checks.zeroDis,
      hasComms: checks.comms,
      hasNavigator: checks.navigator,
      isSanctioned: checks.sanctioned,
      isColdRoute: checks.coldRoute,
    });

    // 항로 변경 필요 여부 확인
    const suggestedRoute = STATUS_TO_REROUTE[evalResult?.status];
    if (suggestedRoute && suggestedRoute !== state.currentRouteKey) {
      const stepMatch = evalResult.reason.match(/\[Step (\w+)\]/);
      setRouteAlert({
        fromRoute: state.currentRouteKey,
        toRoute: suggestedRoute,
        stepTag: stepMatch ? stepMatch[1] : null,
        reason: evalResult.reason,
      });
    }

    showToast(
      `제원 적용 완료 — ${state.shipSpecs.iceClass}, ${state.shipSpecs.displacement}t`,
    );
  }, [
    pendingPolarParams,
    handleEvaluate,
    state.currentRouteKey,
    state.shipSpecs,
    showToast,
  ]);

  const handleModalClose = useCallback(() => setShowSpecsModal(false), []);

  // 텔레포트
  const handleTeleport = useCallback(
    (lat, lon) => {
      dispatch({ type: 'SET_SHIP_STATE', payload: { lat, lon } });
      setTeleportOpen(false);

      // Cesium 카메라 이동
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        try {
// //! [Original Code]
//          viewer.camera.flyTo({
//            destination: Cesium.Cartesian3.fromDegrees(lon, lat, 120000),
//            orientation: {
//              heading: 0,
//              pitch: Cesium.Math.toRadians(-80),
//              roll: 0,
//            },
//            duration: 1.5,
//          });
// //* [Modified Code] flyToBoundingSphere를 사용하여 정중앙 정렬
          const pitch = Cesium.Math.toRadians(-80);
          const alt = 120000;
          const range = alt / Math.sin(Math.abs(pitch));
          viewer.camera.flyToBoundingSphere(
            new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat), 0),
            { offset: new Cesium.HeadingPitchRange(0, pitch, range), duration: 1.5 }
          );
        } catch (e) {
          console.warn('flyTo error:', e);
        }
      }

      // Three.js 선박 위치 리셋 (Three.js 세계에서는 원점 기준)
      const three = threeRef.current;
      if (three && three.shipPivot) {
        three.shipPivot.position.set(0, 0, 0);
        three.shipPivot.rotation.y = 0;
      }

      console.log(`[Teleport] → ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`);
    },
    [dispatch],
  );

  // 리센터
  const handleRecenter = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer) {
      const { lon, lat } = state.shipState;
// //! [Original Code]
//      viewer.camera.flyTo({
//        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 120000),
//        orientation: {
//          heading: 0,
//          pitch: Cesium.Math.toRadians(-80),
//          roll: 0,
//        },
//        duration: 1.0,
//      });
// //* [Modified Code] flyToBoundingSphere를 사용하여 정중앙 정렬
      const target = Cesium.Cartesian3.fromDegrees(lon, lat);
      const pitch = Cesium.Math.toRadians(-80);
      const range = 120000 / Math.sin(Math.abs(pitch));
      viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
        offset: new Cesium.HeadingPitchRange(0, pitch, range),
        duration: 1.0,
      });
    }
  }, [state.shipState]);

  const waypoints = activeWaypoints;

  return (
    <div className="dt-app">
      {/* ═══ Header ═══ */}
      <Header />

      {/* ═══ Main Area (Sidebar + Viewport) ═══ */}
      <div className="dt-main">
        <Sidebar
          currentRoute={state.currentRouteKey}
          onRouteChange={handleRouteChange}
          routeVisibility={routeVisibility}
          onRouteVisibilityChange={handleRouteVisibilityChange}
          currentMode={state.currentMode}
          manualMode={state.manualMode}
          onModeChange={handleModeChange}
          onManualToggle={handleManualToggle}
          layerStates={layerStates}
          onLayerToggle={handleLayerToggle}
          satVisible={satVisible}
          onSatToggle={handleSatToggle}
          iceDataSource={state.iceDataSource}
          onMonthChange={handleMonthChange}
          departurePort={state.departurePort}
          arrivalPort={state.arrivalPort}
          onDepartureChange={(v) => dispatch({ type: 'SET_DEPARTURE_PORT', payload: v })}
          onArrivalChange={(v) => dispatch({ type: 'SET_ARRIVAL_PORT', payload: v })}
          routeDistances={routeDistances}
        />

        <div className="dt-viewport">
          {/* 3D Engine Layers */}
          <CesiumGlobe
            ref={cesiumRef}
            currentRouteKey={state.currentRouteKey}
            onViewerReady={handleViewerReady}
            activeWaypoints={activeWaypoints}
            routeVisibility={routeVisibility}
            generatedRoutes={generatedRoutes}
          />
          <ThreeOverlay
            ref={threeRef}
            visible={
              state.currentMode === 'BRIDGE' || state.currentMode === 'FOLLOW'
            }
            shipState={state.shipState}
            specs={state.shipSpecs}
            mode={state.currentMode}
            baseRef={PORTS[state.departurePort] || PORTS.BUSAN}
          />
          <DeckOverlay
            ref={deckRef}
            visible={
              state.currentMode === 'SATELLITE' || state.currentMode === 'WIDE'
            }
            cesiumViewer={cesiumViewerState}
          />
          <div id="fade" />

          {/* Bridge Overlay */}
          <BridgeOverlay
            visible={state.bridgeVisible}
            heading={state.shipState.heading}
            speed={state.hud.speed}
            rollAngle={parseFloat(state.hud.roll) || 0}
            mode={state.currentMode}
          />
          <BinocularsMask
            visible={state.binocularsActive}
            label="x 8.0 BINOCULARS"
          />

          {/* Viewport Overlays */}
          <SimulationControls
            isSimulating={state.isSimulating}
            onStart={handleStart}
            onReset={handleReset}
            multiplier={state.multiplier}
            onMultiplierChange={handleMultiplierChange}
          />
          <TimelineBar
            simProgress={state.simProgress}
            timelineDay={state.timelineDay}
            onTimelineChange={handleTimelineChange}
            currentRouteKey={state.currentRouteKey}
            departureName={(PORTS[state.departurePort] || PORTS.BUSAN).name}
            arrivalName={(PORTS[state.arrivalPort] || PORTS.ROTTERDAM).name}
// //* [Modified Code] 동적 총 소요 일수를 렌더링에 반영 (totalDays prop 추가)
            totalDays={Math.max(1, Math.round(calculateRouteDistanceKM(activeWaypoints) / (15 * 1.852 * 24)))}
          />

          {/* WMS Legends (bottom-left overlay, above timeline) */}
          <LegendContainer
            gebcoVisible={layerStates.gebcoBathy}
            nsidcVisible={layerStates.nsidcConc}
            copVisible={layerStates.copThick}
          />

          {/* Indicators */}
          {state.manualMode && (
            <div id="manual-indicator">⚑ 수동 조종 모드</div>
          )}
          <div id="hud-hint" />
          <div id="polar-night-ind">극야 구간</div>
          <div id="banner" />
          <div id="gebco-depth-popup" />

          {/* 해역 기상 HUD — 출항 전: 마우스 위치 / 출항 후: 선박 위치 */}
          <WeatherHud
            shipPos={state.isSimulating || state.simProgress > 0 ? state.shipState : (mouseGlobePos || state.shipState)}
            weatherData={weatherData}
            currentRouteKey={state.currentRouteKey}
            isMouseMode={!state.isSimulating && state.simProgress === 0 && !!mouseGlobePos}
          />

          {/* //* [Modified Code] 레이더(미니맵)을 메인 뷰포트 영역 내부 우측 하단에 부착하여 패널에 가려지지 않게 함 */}
          <Minimap
            shipPos={state.shipState}
            progress={state.simProgress}
            heading={state.shipState.heading}
            waypoints={waypoints}
            onOpenTeleport={() => setTeleportOpen(true)}
            departurePort={PORTS[state.departurePort] || PORTS.BUSAN}
            arrivalPort={PORTS[state.arrivalPort] || PORTS.ROTTERDAM}
          />
        </div>
      </div>

      {/* ═══ Bottom Panel ═══ */}
      <BottomPanel
        hud={state.hud}
        specs={state.shipSpecs}
        onSpecChange={handleSpecChange}
        onPresetLoad={handlePresetLoad}
        onApply={handleApplySpecs}
        onRecenter={handleRecenter}
        evaluationResult={evaluationResult}
        onEvaluate={handleEvaluate}
        currentRoute={state.currentRouteKey}
      />

      {/* Ship Specs Summary Modal */}
      <ShipSpecsSummaryModal
        open={showSpecsModal}
        specs={state.shipSpecs}
        polarParams={pendingPolarParams}
        currentRoute={state.currentRouteKey}
        onConfirm={handleModalConfirm}
        onClose={handleModalClose}
      />

      {/* Route Change Alert */}
      <RouteChangeAlert
        visible={routeAlert !== null}
        fromRoute={routeAlert?.fromRoute}
        toRoute={routeAlert?.toRoute}
        stepTag={routeAlert?.stepTag}
        reason={routeAlert?.reason}
        onClose={() => setRouteAlert(null)}
        onConfirm={() => {
          if (routeAlert?.toRoute) {
            handleRouteChange(routeAlert.toRoute);
            setRouteAlert(null);
          }
        }}
      />

      {/* Teleport Overlay */}
      <TeleportOverlay
        visible={teleportOpen}
        waypoints={waypoints}
        shipPos={state.shipState}
        heading={state.shipState.heading}
        onTeleport={handleTeleport}
        onClose={() => setTeleportOpen(false)}
      />

      {/* Toast */}
      {toastMsg && <div className="dt-toast">{toastMsg}</div>}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
