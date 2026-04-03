import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import * as Cesium from 'cesium';
import { AppProvider, useAppState, useDispatch } from './context/AppContext';
import CesiumGlobe from './components/CesiumGlobe';
import ThreeOverlay from './components/ThreeOverlay';
import DeckOverlay from './components/DeckOverlay';
import HudLeft from './components/hud/HudLeft';
import HudRight from './components/hud/HudRight';
import CameraPanel from './components/hud/CameraPanel';
import ManualControl from './components/hud/ManualControl';
import ShipSpecsPanel from './components/hud/ShipSpecsPanel';
import BottomControl from './components/hud/BottomControl';
import RoutingEvaluationPanel from './components/hud/RoutingEvaluationPanel';
import ApiLayersControl from './components/hud/ApiLayersControl';
import LegendContainer from './components/hud/LegendContainer';
import Minimap from './components/hud/Minimap';
import TeleportOverlay from './components/hud/TeleportOverlay';
import RecenterButton from './components/hud/RecenterButton';
import AiAnalysisPanel from './components/hud/AiAnalysisPanel';
import DraggablePanel from './components/hud/DraggablePanel';
import BridgeOverlay from './components/overlay/BridgeOverlay';
import BinocularsMask from './components/overlay/BinocularsMask';
import { ROUTES, TOTAL_SECONDS } from './data/arcticRoutes';
import { SHIP_PRESETS } from './data/vesselPresets';
import useManualControl from './hooks/useManualControl';
import { fetchIceConcentration, fetchIcebergs } from './services/api';
import { buildTimings, routePos, routeHeading, calculateRouteDistanceKM, getSeaState } from './services/shipSimulator';
import { evaluateRouting, deriveIceConditions } from './services/polarisRIO';

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
  const nsidcActiveRef = useRef(true); // nsidcConc 기본 ON
  const iceGridCacheRef = useRef(null); // 해빙 격자 O(1) lookup 캐시
  const realBergsRef = useRef([]); // NIC 실제 빙산 위치
  const lastBergsUpdateRef = useRef(0); // 마지막 updateRealBergs 호출 시각
  const bergCesiumEntitiesRef = useRef([]); // Cesium 빙산 엔티티 목록
  const userCameraInteracting = useRef(false); // 사용자 카메라 드래그 중 여부
  const shipStateRef = useRef(state.shipState);
  const oceanOverlayModeRef = useRef('ice'); // nsidcConc 기본 ON

  useEffect(() => { isSimulatingRef.current = state.isSimulating; }, [state.isSimulating]);
  useEffect(() => {
    shipStateRef.current = state.shipState;
    // shipState 변경 시 HUD 기본 정보 항상 업데이트 (시뮬레이션 여부 무관)
    const { lat, lon } = state.shipState;
    const sicVal = lat < 60 ? 0 : lat < 68 ? ((lat - 60) / 8) * 0.3
      : lat < 75 ? 0.3 + ((lat - 68) / 7) * 0.4
      : lat < 82 ? 0.7 + ((lat - 75) / 7) * 0.25 : 0.95;
    let dangerLabel, dangerCls;
    if (sicVal < 0.15) { dangerLabel = '낮음 🟢'; dangerCls = 'safe'; }
    else if (sicVal < 0.40) { dangerLabel = '보통 🟡'; dangerCls = 'moderate'; }
    else if (sicVal < 0.70) { dangerLabel = '높음 🟠'; dangerCls = 'warning'; }
    else { dangerLabel = '극심 🔴'; dangerCls = 'critical'; }
    const tempEst = lat > 80 ? -1.8 : lat > 70 ? -0.5 : lat > 60 ? 2.1 : 8.5;
    const sea = getSeaState(lat);
    const phase = !state.isSimulating ? '대기 중'
      : state.simProgress < 0.02 ? '출항'
      : lat > 66 ? '북극 항해 중'
      : state.simProgress > 0.95 ? '입항 접근'
      : '항해 중';

    // 속도: 시뮬레이션 중이면 계산, 아니면 수동 속도 또는 0
    let speedText = '0.0 kn';
    let throttleText = '정지';
    if (state.isSimulating && !state.manualMode) {
      const wps = ROUTES[state.currentRouteKey] || ROUTES.NSR;
      const distKm = calculateRouteDistanceKM(wps);
      const speedKmH = (distKm / TOTAL_SECONDS) * state.multiplier * 3600;
      const kn = (speedKmH / 1.852).toFixed(1);
      speedText = kn + ' kn';
      throttleText = '자동 ×' + Math.round(state.multiplier / 20);
    } else if (state.manualMode) {
      speedText = (state.manualSpeed || 0).toFixed(1) + ' kn';
      throttleText = (state.manualThrottle || 0) + '%';
    }

    // RFI 지수: 해빙농도 기반 위험 지수 (0~10)
    const rfiVal = sicVal < 0.15 ? 0 : sicVal < 0.4 ? sicVal * 5 : sicVal < 0.7 ? 3 + (sicVal - 0.4) * 10 : 6 + (sicVal - 0.7) * 13.3;

    // Roll/Pitch: ThreeOverlay motionState에서 읽기
    const motion = threeRef.current?.motionState;
    const rollDeg = motion ? (motion.shipRoll * 180 / Math.PI) : 0;
    const pitchDeg = motion ? (motion.shipPitch * 180 / Math.PI) : 0;

    // 빙산 경보: 가까운 빙산 거리 기반
    const nearestIce = motion?.nearestIceDist ?? Infinity;
    const bergAlertVisible = nearestIce < 500 && lat >= 60;
    const bergAlert = nearestIce < 200 ? `빙산 충돌 위험! 거리 ${Math.round(nearestIce)}m`
      : nearestIce < 500 ? `전방 빙산 접근 중 — ${Math.round(nearestIce)}m` : '';

    dispatch({
      type: 'UPDATE_HUD',
      payload: {
        speed: speedText,
        throttle: throttleText,
        progress: (state.simProgress * 100).toFixed(1) + '%',
        position: lat.toFixed(2) + '°N, ' + lon.toFixed(2) + '°E',
        iceState: sicVal > 0.5 ? '결빙 수역' : sicVal > 0.15 ? '해빙 경계' : '개방 수역',
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
  }, [state.shipState, state.shipSpecs.iceClass, state.isSimulating, state.manualMode,
      state.manualSpeed, state.manualThrottle, state.multiplier, state.simProgress,
      state.currentRouteKey, dispatch]);
  useEffect(() => { currentModeRef.current = state.currentMode; }, [state.currentMode]);
  useEffect(() => { multiplierRef.current = state.multiplier; }, [state.multiplier]);
  useEffect(() => { manualModeRef.current = state.manualMode; }, [state.manualMode]);
  useEffect(() => { currentRouteKeyRef.current = state.currentRouteKey; }, [state.currentRouteKey]);
  useEffect(() => { shipSpecsRef.current = state.shipSpecs; }, [state.shipSpecs]);

  // ── 타임드 웨이포인트 (항로 변경 시 재계산) ────────────────────
  const timedWaypoints = useMemo(() => {
    const wps = ROUTES[state.currentRouteKey] || ROUTES.NSR;
    return buildTimings(wps);
  }, [state.currentRouteKey]);
  const timedWpRef = useRef(timedWaypoints);
  useEffect(() => { timedWpRef.current = timedWaypoints; }, [timedWaypoints]);

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
        const progress = Math.min(simElapsedRef.current / TOTAL_SECONDS, 1);

        const routeKey = currentRouteKeyRef.current;
        const wps = ROUTES[routeKey] || ROUTES.NSR;
        const TWP = timedWpRef.current;

        const pos = routePos(progress, TWP, wps);
        const hdg = routeHeading(progress, TWP, wps);
        const hdgDeg = ((hdg * 180 / Math.PI) + 360) % 360;

        // 상태 업데이트
        dispatch({ type: 'SET_PROGRESS', payload: progress });
        dispatch({ type: 'SET_ELAPSED', payload: simElapsedRef.current });
        dispatch({
          type: 'SET_SHIP_STATE',
          payload: { lat: pos.lat, lon: pos.lon, heading: hdgDeg },
        });

        // 타임라인 일수 동기화
        const dayValue = Math.min(14, Math.floor(progress * 14));
        dispatch({ type: 'SET_TIMELINE', payload: dayValue });

        // HUD 업데이트 (10프레임마다, 성능 최적화)
        lastHudUpdate++;
        if (lastHudUpdate >= 10) {
          lastHudUpdate = 0;
          const distKm = calculateRouteDistanceKM(wps);
          const speedKmH = (distKm / TOTAL_SECONDS) * mult * 3600;
          const speedKnots = (speedKmH / 1.852).toFixed(1);
          const sea = getSeaState(pos.lat);

          // 해빙 농도 추정 (위도 기반)
          const sicVal = pos.lat < 60 ? 0
            : pos.lat < 68 ? ((pos.lat - 60) / 8) * 0.3
            : pos.lat < 75 ? 0.3 + ((pos.lat - 68) / 7) * 0.4
            : pos.lat < 82 ? 0.7 + ((pos.lat - 75) / 7) * 0.25
            : 0.95;

          // 위험도 라벨
          let dangerLabel, dangerCls;
          if (sicVal < 0.15) { dangerLabel = '낮음 🟢'; dangerCls = 'safe'; }
          else if (sicVal < 0.40) { dangerLabel = '보통 🟡'; dangerCls = 'moderate'; }
          else if (sicVal < 0.70) { dangerLabel = '높음 🟠'; dangerCls = 'warning'; }
          else { dangerLabel = '극심 🔴'; dangerCls = 'critical'; }

          // 현재 단계 판별
          let phase;
          if (progress < 0.02) phase = '출항';
          else if (pos.lat > 66) phase = '북극 항해 중';
          else if (progress > 0.95) phase = '입항 접근';
          else phase = '항해 중';

          // 수온 추정 (위도 기반)
          const tempEst = pos.lat > 80 ? -1.8 : pos.lat > 70 ? -0.5 : pos.lat > 60 ? 2.1 : 8.5;

          dispatch({
            type: 'UPDATE_HUD',
            payload: {
              speed: speedKnots + ' kn',
              throttle: '자동 ×' + Math.round(mult / 20),
              progress: (progress * 100).toFixed(1) + '%',
              position: pos.lat.toFixed(2) + '°N, ' + pos.lon.toFixed(2) + '°E',
              iceState: sicVal > 0.5 ? '결빙 수역' : sicVal > 0.15 ? '해빙 경계' : '개방 수역',
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

        // Cesium 카메라 추적 (SATELLITE/WIDE 모드) - 사용자 드래그 중엔 스킵
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed() && !userCameraInteracting.current) {
          try {
            viewer.camera.setView({
              destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 50000),
              orientation: {
                heading: Cesium.Math.toRadians(hdgDeg),
                pitch: Cesium.Math.toRadians(-45),
                roll: 0,
              },
            });
          } catch (e) { /* ignore */ }
        }

        // 항해 완료
        if (progress >= 1) {
          dispatch({ type: 'SET_SIMULATING', payload: false });
        }

        // BRIDGE / FOLLOW 모드: Three.js 선박 시각 이동
        const curMode = currentModeRef.current;
        if (curMode === 'BRIDGE' || curMode === 'FOLLOW') {
          const three = threeRef.current;
          if (three?.shipPivot) {
            const hdgRad = hdgDeg * Math.PI / 180;
            // 시각적 이동 속도 (mult에 비례하되 최대 40 units/sec)
            const visualSpeed = Math.min(mult * 2, 40);
            three.shipPivot.position.x += Math.sin(hdgRad) * visualSpeed * dt;
            three.shipPivot.position.z -= Math.cos(hdgRad) * visualSpeed * dt;
            // 선박 흔들림 (roll/pitch/heave)
            if (three.updateShipMotion) three.updateShipMotion(dt, pos.lat);
          }
          // 실제 빙산 위치 5초마다 갱신 (선박 이동에 따라 50km 내 빙산 재계산)
          if (realBergsRef.current.length > 0 && now - lastBergsUpdateRef.current > 5000) {
            threeRef.current?.updateRealBergs(realBergsRef.current, pos.lat, pos.lon);
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
          three.shipPivot.position.x +=
            Math.sin(manualHeading) * manualSpeed * dt * moveScale;
          three.shipPivot.position.z -=
            Math.cos(manualHeading) * manualSpeed * dt * moveScale;

          // 카메라는 ThreeOverlay 렌더 루프에서 처리 (BRIDGE/FOLLOW)
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
            const latF = Math.floor(lat), lonF = Math.floor(lon);
            const tLat = lat - latF, tLon = lon - lonF;
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
            return c00 * (1 - tLat) * (1 - tLon)
                 + c10 * tLat * (1 - tLon)
                 + c01 * (1 - tLat) * tLon
                 + c11 * tLat * tLon;
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
    nsidcConc: true,
    copThick: false,
    nsidcEdge: false,
    esaSar: false,
    gebcoBathy: false,
    s2True: false,
    s2Ndsi: false,
  });
  const [gebcoOpacity, setGebcoOpacity] = useState(75);

  // 라우팅 평가 결과
  const [evaluationResult, setEvaluationResult] = useState(null);

  // Cesium viewer 준비되면 LIVE 빙산 데이터 로딩 + 카메라 상호작용 감지
  useEffect(() => {
    if (!cesiumViewerState) return;
    const handler = new Cesium.ScreenSpaceEventHandler(cesiumViewerState.scene.canvas);
    handler.setInputAction(() => { userCameraInteracting.current = true; }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    handler.setInputAction(() => { userCameraInteracting.current = false; }, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(() => { userCameraInteracting.current = false; }, Cesium.ScreenSpaceEventType.MIDDLE_UP);
    handler.setInputAction(() => { userCameraInteracting.current = false; }, Cesium.ScreenSpaceEventType.RIGHT_UP);
    handleMonthChange('live');
    return () => { handler.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cesiumViewerState]);

  // Cesium 뷰어 준비 완료
  const handleViewerReady = useCallback((viewer) => {
    viewerRef.current = viewer;
    setCesiumViewerState(viewer);
    console.log('[App] Cesium viewer ready');
  }, []);

  // 시뮬레이션 제어
  const handleStart = useCallback(() => {
    if (!state.isSimulating) {
      // 시작 시 simElapsed를 현재 progress 기반으로 복원
      simElapsedRef.current = state.simProgress * TOTAL_SECONDS;
      dispatch({ type: 'SET_ELAPSED', payload: simElapsedRef.current });
    }
    dispatch({ type: 'SET_SIMULATING', payload: !state.isSimulating });
  }, [state.isSimulating, state.simProgress, dispatch]);

  const handleReset = useCallback(() => {
    simElapsedRef.current = 0;
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  // 카메라 모드
  const handleModeChange = useCallback(
    (mode) => {
      dispatch({ type: 'SET_MODE', payload: mode });
      dispatch({ type: 'SET_BRIDGE_VISIBLE', payload: mode === 'BRIDGE' || mode === 'FOLLOW' });

      // SATELLITE/WIDE 전환 시 Three.js 바다 색상 리셋
      if (mode === 'SATELLITE' || mode === 'WIDE') {
        const { lon, lat } = state.shipState;
        threeRef.current?.updateOceanOverlay('none', lon, lat, null);
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
      const day = Number(value);
      dispatch({ type: 'SET_TIMELINE', payload: day });
      // 타임라인 슬라이더를 드래그하면 시뮬레이션 위치도 이동
      const newProgress = Math.min(1, day / 14);
      const newElapsed = newProgress * TOTAL_SECONDS;
      simElapsedRef.current = newElapsed;
      dispatch({ type: 'SET_PROGRESS', payload: newProgress });
      dispatch({ type: 'SET_ELAPSED', payload: newElapsed });
      // 선박 위치 즉시 업데이트
      const wps = ROUTES[state.currentRouteKey] || ROUTES.NSR;
      const TWP = timedWaypoints;
      const pos = routePos(newProgress, TWP, wps);
      const hdg = routeHeading(newProgress, TWP, wps);
      dispatch({
        type: 'SET_SHIP_STATE',
        payload: { lat: pos.lat, lon: pos.lon, heading: ((hdg * 180 / Math.PI) + 360) % 360 },
      });
    },
    [dispatch, state.currentRouteKey, timedWaypoints],
  );

  // 항로/선박 제원
  const handleRouteChange = useCallback(
    (routeKey) => {
      dispatch({ type: 'SET_ROUTE', payload: routeKey });
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

  // 제원 적용 버튼
  const handleApplySpecs = useCallback(() => {
    showToast(`제원 적용 완료 — ${state.shipSpecs.iceClass}, ${state.shipSpecs.displacement}t, 흘수 ${state.shipSpecs.draft || 8.5}m`);
  }, [state.shipSpecs, showToast]);

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

        const isLive = (month === 'live');

        // ── A. 빙산 Cesium 엔티티 갱신 (최신: NIC 실데이터 / 아카이브: 고농도 셀 파생) ──
        const viewer = viewerRef.current;
        if (viewer && !viewer.isDestroyed()) {
          for (const ent of bergCesiumEntitiesRef.current) viewer.entities.remove(ent);
          bergCesiumEntitiesRef.current = [];

          let bergList = [];
          if (isLive) {
            try {
              const bergData = await fetchIcebergs();
              bergList = (bergData?.bergs || []).map((b) => ({
                id: b.id, lon: b.lon, lat: b.lat,
                length_m: b.length_m || 5000, width_m: b.width_m || 2000,
              }));
            } catch (e) { console.warn('[BergData] fetch 실패:', e.message); }
          } else {
            // 아카이브: 해당 월 고농도 셀(≥0.8) → 빙산 위치로 활용
            const BERG_MAX = 300;
            const highConc = icePoints.filter((c) => c.lat > 60 && c.weight >= 0.8);
            const step = highConc.length > BERG_MAX ? Math.floor(highConc.length / BERG_MAX) : 1;
            bergList = highConc
              .filter((_, i) => i % step === 0).slice(0, BERG_MAX)
              .map((c) => ({
                id: null, lon: c.lon, lat: c.lat,
                length_m: 10000 + c.weight * 20000,
                width_m:   5000 + c.weight * 10000,
              }));
          }

          for (const b of bergList) {
            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(b.lon, b.lat, 0),
              point: {
                pixelSize: 10, color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.ORANGERED, outlineWidth: 2,
              },
              ...(b.id ? { label: {
                text: b.id, font: '11px sans-serif',
                fillColor: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -14),
              }} : {}),
            });
            bergCesiumEntitiesRef.current.push(ent);
          }

          // ThreeOverlay용: 항상 북극(lat>60) 고농도(≥0.8) 셀 사용 (NIC 데이터는 남반구라 불가)
          const BERG_MAX_THREE = 300;
          const highConcCells = icePoints.filter((c) => c.lat > 60 && c.weight >= 0.8);
          const threeStep = highConcCells.length > BERG_MAX_THREE ? Math.floor(highConcCells.length / BERG_MAX_THREE) : 1;
          realBergsRef.current = highConcCells
            .filter((_, i) => i % threeStep === 0).slice(0, BERG_MAX_THREE)
            .map((c) => ({ lon: c.lon, lat: c.lat, size: 8000 + c.weight * 15000 }));
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
        const source =
          month === 'live'
            ? `실시간 (${iceData?.date || ''})`
            : `아카이브 ${month}`;
        dispatch({
          type: 'SET_ICE_DATA',
          payload: { data: iceData, key: month, source },
        });

        const cellCount = iceData?.cell_count || icePoints.length;
        showToast(`${source} 로드 완료 — ${cellCount.toLocaleString()}개 셀, WMS 위성영상 갱신됨`);
      } catch (err) {
        console.warn('[IceData] fetch 실패, 절차적 폴백 유지:', err.message);
        dispatch({
          type: 'SET_ICE_DATA',
          payload: { data: null, key: month, source: '절차적 폴백' },
        });
        showToast(`해빙 데이터 로드 실패: ${err.message} — 절차적 폴백 사용 중`);
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

  const handleLayerToggle = useCallback((layerKey, checked) => {
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
    const cesiumLayer = viewer._apiLayers[layerMap[layerKey]];
    if (cesiumLayer) {
      cesiumLayer.show = checked;
      if (checked) {
        try { viewer.imageryLayers.raiseToTop(cesiumLayer); } catch (_) {}
      }
    }

    // WMS 레이어 토글 → BRIDGE/FOLLOW 바다 색상 모드 결정
    const oceanLayers = { nsidcConc: 'ice', copThick: 'thickness', nsidcEdge: 'edge', gebcoBathy: 'depth' };
    if (layerKey in oceanLayers) {
      if (layerKey === 'nsidcConc') nsidcActiveRef.current = checked;

      let overlayMode;
      if (checked) {
        // 켠 레이어를 즉시 적용
        overlayMode = oceanLayers[layerKey];
      } else {
        // 끈 경우 → 남아있는 활성 레이어 중 하나 선택
        const newStates = { ...layerStates, [layerKey]: false };
        overlayMode = 'none';
        for (const [key, mode] of Object.entries(oceanLayers)) {
          if (newStates[key]) { overlayMode = mode; break; }
        }
      }
      oceanOverlayModeRef.current = overlayMode;

      const mode = currentModeRef.current;
      if (mode === 'BRIDGE' || mode === 'FOLLOW') {
        const { lat, lon } = state.shipState;
        threeRef.current?.updateOceanOverlay(overlayMode, lon, lat, sampleIceFn);
      }
    }
  }, [state.shipState, sampleIceFn, layerStates]);

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
  const handleEvaluate = useCallback((formData) => {
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
            const v2 = grid.get(`${Math.round(_lat) + dl},${Math.round(_lon) + dn}`);
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
    const currentWps = ROUTES[state.currentRouteKey] || ROUTES.NSR;
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
      draft: formData.draft || state.shipSpecs.draft || 8.5,
      beam: state.shipSpecs.width || 30,
      maxRescueDays: formData.rescueDays || 7,
      isTempBelowMinus10: formData.isColdRoute || false,
      designTempMargin: formData.tempMargin || 12,
      hasWinterization: formData.hasWinter !== false,
      hasZeroDischarge: formData.hasZeroDis !== false,
      hasPolarComms: formData.hasComms !== false,
      hasIceNavigator: formData.hasNavigator !== false,
      iceClass: state.shipSpecs.iceClass || 'PC2',
      iceConditions,
    });

    // 항로 거리 계산
    const suezWps = ROUTES.SUEZ;
    const currentDist = Math.round(calculateRouteDistanceKM(currentWps));
    const suezDist = Math.round(calculateRouteDistanceKM(suezWps));

    setEvaluationResult({
      status: result.status,
      rioScore: result.rioScore,
      reason: result.reason + ` (최악 구간: ${worstLat.toFixed(1)}°N, SIC ${Math.round(worstConc * 100)}%)`,
      distances: {
        current: currentDist,
        suez: suezDist,
      },
    });

    showToast(`POLARIS 평가 완료: ${result.status} (최악 SIC ${Math.round(worstConc * 100)}%)`);
  }, [state.shipState, state.shipSpecs, state.currentRouteKey, showToast]);

  // 텔레포트
  const handleTeleport = useCallback(
    (lat, lon) => {
      dispatch({ type: 'SET_SHIP_STATE', payload: { lat, lon } });
      setTeleportOpen(false);

      // Cesium 카메라 이동
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        try {
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, 50000),
            duration: 1.5,
          });
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
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, 50000),
        duration: 1.0,
      });
    }
  }, [state.shipState]);

  const waypoints = ROUTES[state.currentRouteKey] || ROUTES.NSR;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 3D 엔진 레이어 */}
      {/* Cesium 항상 전체 화면 — 모든 모드에서 WMS 레이어 표시 */}
      <CesiumGlobe
        ref={cesiumRef}
        currentRouteKey={state.currentRouteKey}
        onViewerReady={handleViewerReady}
      />

      <ThreeOverlay
        ref={threeRef}
        visible={
          state.currentMode === 'BRIDGE' || state.currentMode === 'FOLLOW'
        }
        shipState={state.shipState}
        mode={state.currentMode}
      />

      <DeckOverlay
        ref={deckRef}
        visible={
          state.currentMode === 'SATELLITE' || state.currentMode === 'WIDE'
        }
        cesiumViewer={cesiumViewerState}
      />

      <div id="fade"></div>

      {/* 브릿지 오버레이 */}
      <BridgeOverlay
        visible={state.bridgeVisible}
        heading={state.shipState.heading}
        speed={state.hud.speed}
        rollAngle={parseFloat(state.hud.roll) || 0}
        mode={state.currentMode}
      />

      {/* 쌍안경 */}
      <BinocularsMask
        visible={state.binocularsActive}
        label="x 8.0 BINOCULARS"
      />

      {/* HUD 패널: 왼쪽 선박정보 */}
      <DraggablePanel defaultX={12} defaultY={12}>
        <HudLeft
          speed={state.hud.speed}
          throttle={state.hud.throttle}
          progress={state.hud.progress}
          position={state.hud.position}
          iceState={state.hud.iceState}
          phase={state.hud.phase}
        />
      </DraggablePanel>

      {/* 해빙위험도 */}
      <DraggablePanel defaultX={window.innerWidth - 260} defaultY={12}>
        <HudRight
          danger={state.hud.danger}
          dangerClass={state.hud.dangerClass}
          iceClass={state.hud.iceClass}
          sic={state.hud.sic}
          temp={state.hud.temp}
          rfi={state.hud.rfi}
          hs={state.hud.hs}
          roll={state.hud.roll}
          pitch={state.hud.pitch}
          seaLabel={state.hud.seaLabel}
          dataSource={state.iceDataSource}
          bergAlert={state.hud.bergAlert}
          bergAlertVisible={state.hud.bergAlertVisible}
          onMonthChange={handleMonthChange}
        />
      </DraggablePanel>

      {/* 선박 제원 설정 */}
      <DraggablePanel defaultX={window.innerWidth - 280} defaultY={420}>
        <ShipSpecsPanel
          specs={state.shipSpecs}
          onSpecChange={handleSpecChange}
          onPresetLoad={handlePresetLoad}
          onRouteChange={handleRouteChange}
          currentRoute={state.currentRouteKey}
          onApply={handleApplySpecs}
        />
      </DraggablePanel>

      {/* NSR 항로 평가 */}
      <DraggablePanel defaultX={window.innerWidth - 340} defaultY={750}>
        <RoutingEvaluationPanel
          onEvaluate={handleEvaluate}
          evaluationResult={evaluationResult}
          currentRoute={state.currentRouteKey}
        />
      </DraggablePanel>

      {/* 카메라 전환 */}
      <DraggablePanel defaultX={Math.round(window.innerWidth / 2 - 120)} defaultY={12}>
        <CameraPanel
          currentMode={state.currentMode}
          onModeChange={handleModeChange}
          onManualToggle={handleManualToggle}
          zoomBar={state.zoomBar}
          zoomDist={state.zoomDist}
          fov={state.fov}
          onFovChange={handleFovChange}
        />
      </DraggablePanel>

      {/* 수동 조종 계기 */}
      {state.manualMode && (
        <DraggablePanel defaultX={window.innerWidth - 250} defaultY={window.innerHeight - 250}>
          <ManualControl
            throttle={state.manualThrottle}
            speed={state.manualSpeed}
            heading={state.manualHeading}
            turnRate={state.manualYawRate}
            fov={state.fov}
            visible={true}
          />
        </DraggablePanel>
      )}

      {/* API 레이어 토글 */}
      <DraggablePanel defaultX={232} defaultY={12}>
        <ApiLayersControl
          layerStates={layerStates}
          onLayerToggle={handleLayerToggle}
          gebcoOpacity={gebcoOpacity}
          onGebcoOpacityChange={handleGebcoOpacityChange}
          satVisible={satVisible}
          onSatToggle={handleSatToggle}
        />
      </DraggablePanel>

      {/* 범례 패널들 */}
      <LegendContainer
        gebcoVisible={layerStates.gebcoBathy}
        nsidcVisible={layerStates.nsidcConc}
        copVisible={layerStates.copThick}
      />

      {/* 하단 컨트롤 */}
      <DraggablePanel defaultX={Math.round(window.innerWidth / 2 - 220)} defaultY={window.innerHeight - 80}>
        <BottomControl
          isSimulating={state.isSimulating}
          onStart={handleStart}
          onReset={handleReset}
          multiplier={state.multiplier}
          onMultiplierChange={handleMultiplierChange}
          timelineDay={state.timelineDay}
          onTimelineChange={handleTimelineChange}
        />
      </DraggablePanel>

      {/* 미니맵 */}
      <DraggablePanel defaultX={12} defaultY={window.innerHeight - 320}>
        <Minimap
          shipPos={state.shipState}
          progress={state.simProgress}
          waypoints={waypoints}
          onOpenTeleport={() => setTeleportOpen(true)}
        />
      </DraggablePanel>

      {/* 텔레포트 오버레이 */}
      <TeleportOverlay
        visible={teleportOpen}
        waypoints={waypoints}
        shipPos={state.shipState}
        heading={state.shipState.heading}
        onTeleport={handleTeleport}
        onClose={() => setTeleportOpen(false)}
      />

      {/* AI 배치 분석 */}
      <DraggablePanel defaultX={window.innerWidth - 340} defaultY={380}>
        <AiAnalysisPanel />
      </DraggablePanel>

      {/* 리센터 버튼 */}
      <RecenterButton onClick={handleRecenter} />

      {/* 상태 인디케이터 */}
      <div
        id="manual-indicator"
        style={{ display: state.manualMode ? 'block' : 'none' }}
      >
        ⚑ 수동 조종 모드
      </div>
      <div id="hud-hint"></div>
      <div id="polar-night-ind">🌑 극야 구간</div>
      <div id="banner">부산 → 북극항로 → 로테르담 | 14일 운항</div>
      <div
        id="toast"
        style={{
          display: toastMsg ? 'block' : 'none',
          position: 'fixed',
          bottom: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0, 8, 20, 0.92)',
          color: '#93c5fd',
          border: '1px solid #1e40af',
          borderRadius: '8px',
          padding: '10px 20px',
          fontSize: '13px',
          fontFamily: "'Courier New', monospace",
          zIndex: 999,
          backdropFilter: 'blur(6px)',
          boxShadow: '0 0 20px rgba(0, 30, 100, 0.6)',
          maxWidth: '500px',
          textAlign: 'center',
        }}
      >
        {toastMsg}
      </div>
      <div id="gebco-depth-popup"></div>
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
