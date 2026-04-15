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
import RLProgressOverlay from './components/hud/RLProgressOverlay';
import TrendReportProgressOverlay from './components/hud/TrendReportProgressOverlay';
import TrendReportPanel from './components/hud/TrendReportPanel';
import WhatIfPanel from './components/hud/WhatIfPanel';
import SarTrainingPanel from './components/hud/SarTrainingPanel';
import FuelAnalysisPanel from './components/hud/FuelAnalysisPanel';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import TimelineBar from './components/layout/TimelineBar';
import BottomPanel from './components/layout/BottomPanel';
import ShipSpecsSummaryModal from './components/layout/ShipSpecsSummaryModal';
import RouteChangeAlert from './components/layout/RouteChangeAlert';
import {
  ROUTES,
  TOTAL_SECONDS,
  getTotalSeconds,
  ROUTE_DAYS,
} from './data/arcticRoutes';
import { PORTS } from './data/ports';
import { SHIP_PRESETS } from './data/vesselPresets';
import useManualControl from './hooks/useManualControl';
import {
  fetchIceConcentration,
  fetchIcebergs,
  fetchWeather,
} from './services/api';
import {
  buildTimings,
  routePos,
  routeHeading,
  calculateRouteDistanceKM,
  getSeaState,
} from './services/shipSimulator';

// //* [Modified Code] 위도 기반 가시거리 추정 (고위도·극야·해무 반영)
function estimateVisibility(lat) {
  if (lat > 80) return 2.0;   // 극고위도: 해무·극야 → 시정 극히 제한
  if (lat > 74) return 5.0;   // 고위도 북극: 해무 빈번
  if (lat > 68) return 8.0;   // 북극권 진입: 간헐적 해무
  if (lat > 55) return 12.0;  // 아북극 외양
  return 15.0;                // 연안·온대 해역
}
import { evaluateRouting, deriveIceConditions } from './services/polarisRIO';
import { generateRoute, isSameRegion } from './services/routeGenerator';
import {
  checkRouteAhead,
  rerouteAroundIceberg,
} from './services/icebergAvoidance';
import { createRLAvoidanceController } from './services/rlAvoidanceController';
import useVoyagePlayback from './hooks/useVoyagePlayback';
import VoyagePlaybackLayer from './components/VoyagePlayback/VoyagePlaybackLayer';
import VoyageHUD from './components/VoyagePlayback/VoyageHUD';
import VoyageControls from './components/VoyagePlayback/VoyageControls';
import VoyageEventToast from './components/VoyagePlayback/VoyageEventToast';
import AraonLiveMarker from './components/VoyagePlayback/AraonLiveMarker';
import VoyageAutoCam from './components/VoyagePlayback/VoyageAutoCam';
import ForwardPreviewHUD from './components/hud/ForwardPreviewHUD';
import VoyageInfoPanel from './components/hud/VoyageInfoPanel';
import { sampleShipAt, sampleIcebreakersAt } from './services/voyageTrace';
import {
  deriveSpeedKn as deriveVoySpeedKn,
  deriveHeadingDeg as deriveVoyHeadingDeg,
  nearestWaveAt,
} from './services/derivedMetrics';
import './components/VoyagePlayback/voyagePlayback.css';

function AppInner() {
  const state = useAppState();
  const dispatch = useDispatch();

  const cesiumRef = useRef(null);
  const threeRef = useRef(null);
  const deckRef = useRef(null);
  const viewerRef = useRef(null);
  const [cesiumViewerState, setCesiumViewerState] = useState(null);

  // Voyage Playback 모드 (쇄빙선 에스코트 시뮬 재생)
  const [appMode, setAppMode] = useState('live'); // 'live' | 'voyage'
  const voyage = useVoyagePlayback();
  const voyageActive = appMode === 'voyage';

  // VoyageInfoPanel / VoyageHUD 표시 여부 (X 버튼으로 닫기/다시 열기)
  const [infoPanelVisible, setInfoPanelVisible] = useState(true);
  const [voyageHudVisible, setVoyageHudVisible] = useState(true);
  // 모드 전환 시 패널 자동으로 다시 열기
  useEffect(() => {
    setInfoPanelVisible(true);
    setVoyageHudVisible(true);
  }, [appMode]);
  const currentRio = voyage.trace
    ? (sampleShipAt(voyage.trace, voyage.tHours) || {}).rio
    : 0;

  // 아라온 HUD 정보 — voyage 모드면 trace 에서 보간, 아니면 Wrangel 정적값
  const ARAON_STATUS_KO = {
    idle: '대기',
    dispatched: '출동',
    rendezvous: '랑데부',
    escorting: '동행',
    released: '복귀',
  };
  // 컴팩트 좌표 (한 줄에 들어가도록)
  const formatLatLonShort = (p) => {
    if (!p) return '—';
    const lat = `${p.lat.toFixed(1)}${p.lat >= 0 ? 'N' : 'S'}`;
    const lon = `${p.lon.toFixed(1)}${p.lon >= 0 ? 'E' : 'W'}`;
    return `${lat} ${lon}`;
  };
  let araonInfo = {
    position: '71.0N 179.5E',
    statusKo: '대기',
  };
  if (voyageActive && voyage.trace) {
    const ibs = sampleIcebreakersAt(voyage.trace, voyage.tHours);
    const araon = ibs.find((x) => x.id === 'ib-araon');
    if (araon) {
      araonInfo = {
        position: formatLatLonShort(araon.position),
        statusKo: ARAON_STATUS_KO[araon.status] || araon.status,
      };
    }
  }

  // ── Voyage Playback pitch/roll 거동 주입 + 아라온 3D 위치 ──────────────
  // 매 tHours 변경마다 선박/아라온 상태를 읽어 ThreeOverlay 에 주입.
  useEffect(() => {
    const three = threeRef.current;
    if (!three || !three.setVoyageMotionBias) return;
    if (!voyageActive || !voyage.trace) {
      three.setVoyageMotionBias(null);
      if (three.setVoyageIceContext) three.setVoyageIceContext(null);
      if (three.setAraonState) three.setAraonState(null);
      return;
    }
    const ship = sampleShipAt(voyage.trace, voyage.tHours);
    if (!ship) {
      three.setVoyageMotionBias(null);
      if (three.setVoyageIceContext) three.setVoyageIceContext(null);
      if (three.setAraonState) three.setAraonState(null);
      return;
    }

    // 선박 거동 bias — 얼음 두께 기반 현실 쇄빙 모델은 렌더 루프에서 처리.
    // 여기선 RIO 기반 지속 roll 편향만 setVoyageMotionBias 로 주입.
    const speedKn = deriveVoySpeedKn(voyage.trace, voyage.tHours);
    const h = ship.effective_thickness_m || 0;
    const rawH = ship.thickness_m || 0;
    const rio = ship.rio || 0;
    const rollBias = rio < -3 ? -0.04 : rio < 0 ? -0.02 : 0;
    three.setVoyageMotionBias({
      rollRad: rollBias,
      pitchRad: 0, // pitch 는 렌더 루프 ice motion 이 전담
      heaveM: 0,
    });
    // 얼음 컨텍스트 주입 (렌더 루프가 비선형 커브 + 램 사이클 계산)
    if (three.setVoyageIceContext) {
      three.setVoyageIceContext({
        thicknessM: h,
        speedKn,
        // 유효 두께가 원본보다 눈에 띄게 낮으면 호위 받은 것으로 간주
        isEscorted: rawH > 0 && h < rawH * 0.7,
      });
    }

    // ── Three.js 본선 위치 동기화 (매 voyage tick) ──
    // Voyage 모드에선 auto-sim 루프가 shipPivot 을 업데이트 안 하니 여기서 직접.
    // position 은 직접 set (lerp 없음). rotation 은 state.shipState.heading 로 dispatch
    // 해서 ThreeOverlay 렌더 루프의 heading lerp 가 자연스럽게 따라오도록.
    const voyHeading = deriveVoyHeadingDeg(voyage.trace, voyage.tHours);
    if (three.shipPivot) {
      const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
      const M_PER_LAT = 111132.954;
      const M_PER_LON =
        111319.491 * Math.cos((ship.position.lat * Math.PI) / 180);
      three.shipPivot.position.x =
        ((ship.position.lon - depPort.lon) * M_PER_LON) / 1.5;
      three.shipPivot.position.z =
        -((ship.position.lat - depPort.lat) * M_PER_LAT) / 1.5;
    }
    // heading 을 state.shipState 에 dispatch → 렌더 루프 lerp 가 부드럽게 회전
    dispatch({
      type: 'SET_SHIP_STATE',
      payload: {
        lat: ship.position.lat,
        lon: ship.position.lon,
        heading: voyHeading || 0,
      },
    });

    // 아라온 3D 위치 주입
    if (three.setAraonState) {
      const ibs = sampleIcebreakersAt(voyage.trace, voyage.tHours);
      const araon = ibs.find((x) => x.id === 'ib-araon');
      if (!araon) {
        three.setAraonState(null);
      } else {
        const isEscorting =
          araon.status === 'escorting' || araon.status === 'rendezvous';

        if (isEscorting) {
          // 호위/랑데부 중 — trace 좌표 무시하고 본선 앞에 강제 배치
          // forwardM: 본선 뱃머리 앞 거리 (Three.js 유닛, 3D 모델 크기 고려)
          three.setAraonState({
            visible: true,
            escortOverride: {
              forwardM: 600,   // 본선 전방 ~600 유닛 (살짝 왼쪽으로 offset 가능)
              sideM: -80,      // 본선 좌측으로 살짝 비켜서 뱃머리 시야 확보
            },
          });
        } else {
          // 그 외 상태 — trace 좌표 사용, 20km 이내만 씬 렌더
          const dLat = araon.position.lat - ship.position.lat;
          const dLon = araon.position.lon - ship.position.lon;
          const mPerLat = 111132.954;
          const mPerLon =
            111319.491 * Math.cos((ship.position.lat * Math.PI) / 180);
          const distM = Math.sqrt(
            (dLat * mPerLat) ** 2 + (dLon * mPerLon) ** 2,
          );
          const visible = distM < 20000;
          const headingDeg =
            deriveVoyHeadingDeg(voyage.trace, voyage.tHours) || 0;
          three.setAraonState({
            visible,
            deltaLatDeg: dLat,
            deltaLonDeg: dLon,
            refLat: ship.position.lat,
            headingDeg,
            status: araon.status,
          });
        }
      }
    }
  }, [voyageActive, voyage.trace, voyage.tHours]);

  const animFrameRef = useRef(null);

  // 키보드 수동 조종
  const { keys } = useManualControl();

  // 텔레포트 오버레이 상태
  const [teleportOpen, setTeleportOpen] = useState(false);

  // 상단바 메뉴에서 제어하는 활성 패널
  // 'rl_curriculum' | 'trend_learning' | 'whatif' | 'sar' | 'trend_report' | 'fuel' | null
  const [activePanel, setActivePanel] = useState(null);
  const handleSelectPanel = useCallback((id) => {
    setActivePanel(prev => (prev === id ? null : id));
  }, []);
  const trendReportOpen = activePanel === 'trend_report';
  const fuelAnalysisOpen = activePanel === 'fuel';
  const toggleTrendReport = useCallback(() => handleSelectPanel('trend_report'), [handleSelectPanel]);
  const toggleFuelAnalysis = useCallback(() => handleSelectPanel('fuel'), [handleSelectPanel]);

  // 토스트 알림 상태
  const [toastMsg, setToastMsg] = useState('');
  const toastTimerRef = useRef(null);

  // ── RL 학습 중 멀티 선박 시각화 ──────────────────────────────
  const [rlShips, setRlShips] = useState([]);
  const rlShipProgressRef = useRef({}); // id → progress(0~1), 시간 기반 자동 전진

  useEffect(() => {
    let alive = true;
    async function pollMultiStatus() {
      try {
        const [r1, r2] = await Promise.allSettled([
          fetch('/api/rl/multi/status'),
          fetch('/api/report/rl/multi/status'),
        ]);
        const ships = [];

        // route별 TWP 캐시
        const twpCache = {};
        function getTWP(routeKey) {
          if (!twpCache[routeKey]) {
            const wps = ROUTES[routeKey] || ROUTES.NSR;
            twpCache[routeKey] = buildTimings(wps);
          }
          return twpCache[routeKey];
        }

        // rl-pipeline (NSR/NWP/TSR × 빙급 × 선종)
        if (r1.status === 'fulfilled' && r1.value.ok) {
          const data = await r1.value.json();
          const models = data.models ?? {};
          Object.entries(models).forEach(([key, m]) => {
            if (!m.is_running) return;
            // key: NSR_PC7_bulk 형식
            const parts = key.split('_');
            const route = parts[0]; // NSR/NWP/TSR
            const shipType = parts[parts.length - 1];
            if (!rlShipProgressRef.current[key]) rlShipProgressRef.current[key] = Math.random();
            const routeWps = ROUTES[route] || ROUTES.NSR;
            const twp = getTWP(route);
            const prog = rlShipProgressRef.current[key];
            const pos = routePos(prog, twp, routeWps);
            const hdg = routeHeading(prog, twp, routeWps);
            ships.push({
              id: `rl_${key}`,
              route, shipType,
              lat: pos.lat, lon: pos.lon, heading: hdg,
              label: `${route} #${m.current_iteration}`,
              iteration: m.current_iteration,
            });
          });
        }

        // report-service (빙급 × 선종)
        if (r2.status === 'fulfilled' && r2.value.ok) {
          const data = await r2.value.json();
          const models = data.models ?? {};
          Object.entries(models).forEach(([key, m]) => {
            if (!m.is_running) return;
            const parts = key.split('_');
            const shipType = parts[parts.length - 1];
            const routeWps = ROUTES.NSR;
            const twp = getTWP('NSR');
            if (!rlShipProgressRef.current[`dep_${key}`]) {
              rlShipProgressRef.current[`dep_${key}`] = 0.3 + Math.random() * 0.4;
            }
            const prog = rlShipProgressRef.current[`dep_${key}`];
            const pos = routePos(prog, twp, routeWps);
            const hdg = routeHeading(prog, twp, routeWps);
            ships.push({
              id: `dep_${key}`,
              route: 'NSR', shipType,
              lat: pos.lat, lon: pos.lon, heading: hdg,
              label: `출항 #${m.current_iteration}`,
              iteration: m.current_iteration,
            });
          });
        }

        // 진행률 자동 전진 (poll마다 += 0.0024 → 약 21분에 경로 한 바퀴)
        Object.keys(rlShipProgressRef.current).forEach(k => {
          rlShipProgressRef.current[k] = (rlShipProgressRef.current[k] + 0.0024) % 1.0;
        });

        if (alive) setRlShips(ships);
      } catch {}
    }

    pollMultiStatus();
    const id = setInterval(pollMultiStatus, 3000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // RL 선박 진행률 시간 기반 자동 증가 (3초 poll마다 += 0.0024, ~21분 1바퀴)
  // pollMultiStatus 내에서 진행률 갱신하므로 별도 interval 불필요
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
  const cameraInteractTimer = useRef(null); // 조작 후 추적 재개 딜레이
  const [mouseGlobePos, setMouseGlobePos] = useState(null); // 마우스 위치 (출항 전 기상 조회용)
  const shipStateRef = useRef(state.shipState);
  const oceanOverlayModeRef = useRef('none'); // 모든 WMS 레이어 기본 OFF
  const cesiumIceLayerRef = useRef(null); // Cesium 캔버스 해빙 레이어 (gibsIce)
  const nsidcConcCanvasRef = useRef(null); // Cesium 캔버스 해빙 농도 레이어 (nsidcConc)
  // //* [Modified Code] 수동 조종 변수를 Ref로 관리하여 텔레포트 및 모드 전환 시 동기화 가능하게 함
  const manualHeadingRef = useRef(0);
  const manualSpeedRef = useRef(0);
  const manualThrottleRef = useRef(0);
  const manualTurnRateRef = useRef(0);

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
      // 선박 물리 속도는 시뮬 배율과 무관 (배율은 시간 압축일 뿐)
      const speedKmH = distKm / (totalSec / 3600);
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
        // //* [Modified Code] 가시거리 필드 추가 (위도 기반 추정)
        vis: estimateVisibility(lat).toFixed(1) + ' km',
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
        cesiumRef.current.updateShipEntity(
          { lat, lon },
          heading,
          state.shipSpecs,
        );
      }
    }
  }, [state.shipSpecs]);

  // ── 타임드 웨이포인트 (항로/항구 변경 시 재계산) ─────────────────
  const activeWaypoints = useMemo(() => {
    return (
      state.generatedWaypoints || ROUTES[state.currentRouteKey] || ROUTES.NSR
    );
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
          depPort,
          arrPort,
          state.currentRouteKey,
          state.cachedIceData,
          realBergsRef.current,
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

    return () => {
      cancelled = true;
    };
  }, [state.departurePort, state.arrivalPort, state.currentRouteKey]);

  // ── RL 기반 빙산 회피 컨트롤러 (2초 간격) ──────────────────────
  const rlControllerRef = useRef(null);

  useEffect(() => {
    if (!state.isSimulating || state.manualMode) {
      if (rlControllerRef.current) {
        rlControllerRef.current.stop();
      }
      return;
    }

    // RL 회피 컨트롤러 생성 (기존 A* 폴백 포함)
    const controller = createRLAvoidanceController({
      getShipState: () => state.shipState,
      getIcebergs: () => realBergsRef.current,
      getActiveWps: () => activeWpRef.current,
      getProgress: () => state.simProgress,
      getIceData: () => state.cachedIceData,
      getWeather: () => ({
        visibility_km: parseFloat(state.hud.vis) || 10,
        wave_height_m: parseFloat(state.hud.hs) || 1,
      }),
      getIceClass: () => state.shipSpecs?.iceClass || 'PC5',
      dispatch,
      showToast,
    });

    rlControllerRef.current = controller;
    controller.start();

    return () => controller.stop();
  }, [state.isSimulating, state.manualMode]);

  // ── 메인 애니메이션 루프 ──────────────────────────────────────
  useEffect(() => {
    let lastTime = performance.now();
    let lastHudUpdate = 0;
    let manualFrameCount = 0; // 수동 모드 HUD 업데이트 프레임 카운터

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
          // 선박 물리 속도는 시뮬 배율(mult)과 무관 — 시간 압축은 "보여지는 속도"를 키우면 안 됨.
          // speed (km/h) = 총 거리 / 총 시뮬 시간(h)
          const speedKmH = distKm / (routeTotalSec / 3600);
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
              // //* [Modified Code] 가시거리·RFI 필드 추가 (시뮬루프 HUD 갱신 누락 수정)
              vis: estimateVisibility(pos.lat).toFixed(1) + ' km',
              rfi: (sicVal < 0.15 ? 0 : sicVal < 0.4 ? sicVal * 5 : sicVal < 0.7 ? 3 + (sicVal - 0.4) * 10 : 6 + (sicVal - 0.7) * 13.3).toFixed(1),
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
          viewer &&
          !viewer.isDestroyed() &&
          !userCameraInteracting.current &&
          (curMode === 'SATELLITE' || curMode === 'WIDE')
        ) {
          try {
            const camPos = viewer.camera.positionCartographic;
            const currentAlt = camPos
              ? camPos.height
              : curMode === 'WIDE'
                ? 3000000
                : 120000;
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
            viewer.camera.lookAt(
              target,
              new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, range),
            );
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
        if (curMode === 'FOLLOW') {
          const three = threeRef.current;
          if (three?.shipPivot) {
            // Base Reference: 현재 위도 기준 mPerDegLon 사용 (고위도 경도 보정)
            const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
            const METERS_PER_DEGREE_LAT = 111132.954;
            const mPerDegLon =
              111319.491 * Math.cos((pos.lat * Math.PI) / 180);
            three.shipPivot.position.x =
              ((pos.lon - depPort.lon) * mPerDegLon) / 1.5;
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

      // ── 수동 조종 키보드 입력 처리 (manualMode일 때만) ──
      const k = keys.current;
      if (manualModeRef.current && k) {
        const hasInput = k['KeyW'] || k['KeyS'] || k['KeyA'] || k['KeyD'] || k['KeyX'];

        // 키 입력 시 스로틀/방향 갱신
        if (hasInput) {
          if (k['KeyW'])
            manualThrottleRef.current = Math.min(
              manualThrottleRef.current + dt * 30,
              100,
            );
          if (k['KeyS'])
            manualThrottleRef.current = Math.max(
              manualThrottleRef.current - dt * 30,
              -20,
            );
          if (k['KeyX']) manualThrottleRef.current *= 0.9;

          const maxTurnRate = 0.4;
          let targetTurn = 0;
          if (k['KeyA']) targetTurn = -maxTurnRate;
          if (k['KeyD']) targetTurn = maxTurnRate;
          manualTurnRateRef.current +=
            (targetTurn - manualTurnRateRef.current) * dt * 1.5;
          if (Math.abs(manualTurnRateRef.current) < 0.001)
            manualTurnRateRef.current = 0;
          manualHeadingRef.current += manualTurnRateRef.current * dt;
        } else {
          // 키 안 누를 때: 스로틀 서서히 감소 (관성 감속)
          manualThrottleRef.current *= (1 - dt * 2.0);
          if (Math.abs(manualThrottleRef.current) < 0.5) manualThrottleRef.current = 0;
        }

        // 속도 계산 (매 프레임, dispatch 없이 ref만 갱신)
        const targetSpeed = manualThrottleRef.current * 0.5;
        manualSpeedRef.current +=
          (targetSpeed - manualSpeedRef.current) * dt * 3.0;

        // Three.js 선박 위치 업데이트 (dispatch 없이 직접 3D 오브젝트만 이동)
        const moveScale = 200;
        const three = threeRef.current;
        if (three && three.shipPivot) {
          three.shipPivot.rotation.y = -manualHeadingRef.current;
          if (Math.abs(manualSpeedRef.current) > 0.01) {
            const dx = Math.sin(manualHeadingRef.current) * manualSpeedRef.current * dt * moveScale;
            const dz = Math.cos(manualHeadingRef.current) * manualSpeedRef.current * dt * moveScale;
            three.shipPivot.position.x += dx;
            three.shipPivot.position.z -= dz;
          }
        }

        // React state 동기화: 10프레임마다만 dispatch (무한 리렌더 방지)
        manualFrameCount++;
        if (manualFrameCount >= 10) {
          manualFrameCount = 0;
          const three = threeRef.current;
          if (three && three.shipPivot) {
            const depPortM = PORTS[state.departurePort] || PORTS.BUSAN;
            const METERS_PER_DEGREE_LAT = 111132.954;
            const newLat =
              depPortM.lat -
              (three.shipPivot.position.z * 1.5) / METERS_PER_DEGREE_LAT;
            const mPerDegLon =
              111319.491 * Math.cos((newLat * Math.PI) / 180);
            const newLon =
              depPortM.lon + (three.shipPivot.position.x * 1.5) / mPerDegLon;

            dispatch({
              type: 'SET_SHIP_STATE',
              payload: {
                lat: newLat,
                lon: newLon,
                heading: ((manualHeadingRef.current * 180) / Math.PI + 360) % 360,
              },
            });
          }
          dispatch({
            type: 'SET_MANUAL',
            payload: {
              manualThrottle: Math.round(manualThrottleRef.current),
              manualSpeed: Math.round(manualSpeedRef.current * 10) / 10,
              manualHeading: Math.round(
                ((manualHeadingRef.current * 180) / Math.PI + 360) % 360,
              ),
              manualYawRate: Math.round(manualTurnRateRef.current * 100) / 100,
            },
          });
        }

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
      if (curMode === 'FOLLOW') {
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
          routeKeys.map(async (key) => {
            if (isSameRegion(depPort.id, arrPort.id) && key !== 'ETC') {
              return { key, dist: '-' };
            }
            if (!isSameRegion(depPort.id, arrPort.id) && key === 'ETC') {
              return { key, dist: '-' };
            }
            const wps = await generateRoute(depPort, arrPort, key, null, []); // 해빙 데이터 없이 빠른 생성
            return { key, dist: calculateRouteDistanceKM(wps) };
          }),
        );
        if (!cancelled) {
          const distances = {};
          const paths = {};
          results.forEach((r) => {
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
    return () => {
      cancelled = true;
    };
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

  // ── Real wave 주입 ─────────────────────────────────────────────────
  // 실제 파고/파향/주기를 선박 현재 위치 기준 최근접 waypoint 에서 조회,
  // ThreeOverlay updateShipMotion 의 합성 sea state 를 override.
  // weatherData 없거나 근접 waypoint 없으면 null 전달 → lat 기반 fallback.
  useEffect(() => {
    const three = threeRef.current;
    if (!three || !three.setRealWaveInput) return;
    if (!weatherData) {
      three.setRealWaveInput(null);
      return;
    }
    let lat;
    let lon;
    let headingDeg;
    if (voyageActive && voyage.trace) {
      const ship = sampleShipAt(voyage.trace, voyage.tHours);
      if (!ship) {
        three.setRealWaveInput(null);
        return;
      }
      lat = ship.position.lat;
      lon = ship.position.lon;
      headingDeg = deriveVoyHeadingDeg(voyage.trace, voyage.tHours);
    } else if (state.shipState && typeof state.shipState.lat === 'number') {
      lat = state.shipState.lat;
      lon = state.shipState.lon;
      headingDeg = state.shipState.heading;
    } else {
      three.setRealWaveInput(null);
      return;
    }
    const wave = nearestWaveAt(weatherData, lat, lon);
    if (!wave || typeof wave.height !== 'number') {
      three.setRealWaveInput(null);
      return;
    }
    three.setRealWaveInput({
      Hs: wave.height,
      Tp: wave.period ?? 8,
      dirDeg: wave.direction,
      headingDeg,
    });
  }, [
    weatherData,
    voyageActive,
    voyage.trace,
    voyage.tHours,
    state.shipState,
  ]);

  // Cesium viewer 준비되면 LIVE 빙산 데이터 로딩 + 카메라 상호작용 감지
  useEffect(() => {
    if (!cesiumViewerState) return;
    const handler = new Cesium.ScreenSpaceEventHandler(
      cesiumViewerState.scene.canvas,
    );
    const startInteract = () => {
      userCameraInteracting.current = true;
      if (cameraInteractTimer.current)
        clearTimeout(cameraInteractTimer.current);
    };
    const endInteract = () => {
      if (cameraInteractTimer.current)
        clearTimeout(cameraInteractTimer.current);
      cameraInteractTimer.current = setTimeout(() => {
        userCameraInteracting.current = false;
      }, 3000);
    };
    handler.setInputAction(
      startInteract,
      Cesium.ScreenSpaceEventType.LEFT_DOWN,
    );
    handler.setInputAction(endInteract, Cesium.ScreenSpaceEventType.LEFT_UP);
    handler.setInputAction(
      startInteract,
      Cesium.ScreenSpaceEventType.MIDDLE_DOWN,
    );
    handler.setInputAction(endInteract, Cesium.ScreenSpaceEventType.MIDDLE_UP);
    handler.setInputAction(
      startInteract,
      Cesium.ScreenSpaceEventType.RIGHT_DOWN,
    );
    handler.setInputAction(endInteract, Cesium.ScreenSpaceEventType.RIGHT_UP);
    handler.setInputAction(() => {
      startInteract();
      endInteract();
    }, Cesium.ScreenSpaceEventType.WHEEL);

    // 마우스 위치 → 위경도 변환 (출항 전 기상 HUD용, 200ms 스로틀)
    let lastMouseUpdate = 0;
    handler.setInputAction((movement) => {
      if (isSimulatingRef.current) return;
      const now = Date.now();
      if (now - lastMouseUpdate < 200) return;
      lastMouseUpdate = now;
      const cart = cesiumViewerState.camera.pickEllipsoid(
        movement.endPosition,
        cesiumViewerState.scene.globe.ellipsoid,
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
        payload: mode === 'FOLLOW',
      });

      // FOLLOW 전환 시 선박 위치 동기화 + 빙산 즉시 갱신
      if (mode === 'FOLLOW') {
        const { lon, lat } = state.shipState;
        const three = threeRef.current;
        console.log('[ModeSwitch]', mode, 'shipState:', lat, lon,
          'realBergs:', realBergsRef.current.length,
          'threeRef:', !!three, 'shipPivot:', !!three?.shipPivot);
        if (three?.shipPivot) {
          const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
          const METERS_PER_DEGREE_LAT = 111132.954;
          const mPerDegLon =
            111319.491 * Math.cos((lat * Math.PI) / 180);
          three.shipPivot.position.x =
            ((lon - depPort.lon) * mPerDegLon) / 1.5;
          three.shipPivot.position.z =
            (-(lat - depPort.lat) * METERS_PER_DEGREE_LAT) / 1.5;
          console.log('[ModeSwitch] shipPivot set to:',
            three.shipPivot.position.x.toFixed(1),
            three.shipPivot.position.z.toFixed(1));
        }
        if (realBergsRef.current.length > 0) {
          three?.updateRealBergs(realBergsRef.current, lat, lon);
        } else {
          console.warn('[ModeSwitch] realBergsRef is EMPTY!');
        }
      }

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
          viewer.camera.flyToBoundingSphere(
            new Cesium.BoundingSphere(
              Cesium.Cartesian3.fromDegrees(lon, lat),
              0,
            ),
            {
              offset: new Cesium.HeadingPitchRange(0, pitchRad, range),
              duration: 1.0,
            },
          );
        }
      }
    },
    [dispatch, state.shipState, state.departurePort],
  );

  const handleManualToggle = useCallback(() => {
    const nextManual = !state.manualMode;
    if (nextManual) {
      manualHeadingRef.current = (state.shipState.heading * Math.PI) / 180;
      manualSpeedRef.current = 0;
      manualThrottleRef.current = 0;
      manualTurnRateRef.current = 0;
      // 수동 조종 시작 시 SATELLITE/WIDE 모드이면 자동으로 FOLLOW 전환
      // (Three.js shipPivot이 없으면 이동 불가)
      const curMode = state.currentMode;
      if (curMode !== 'FOLLOW') {
        dispatch({ type: 'SET_MODE', payload: 'FOLLOW' });
        dispatch({ type: 'SET_BRIDGE_VISIBLE', payload: true });
      }
    }
    dispatch({ type: 'SET_MANUAL_MODE', payload: nextManual });
  }, [state.manualMode, state.shipState, state.hud, state.currentMode, dispatch]);

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
        if (
          viewer &&
          !viewer.isDestroyed() &&
          !userCameraInteracting.current &&
          (curMode === 'SATELLITE' || curMode === 'WIDE')
        ) {
          try {
            const camPos = viewer.camera.positionCartographic;
            const currentAlt = camPos
              ? camPos.height
              : curMode === 'WIDE'
                ? 3000000
                : 120000;
            // //! [Original Code]
            //            viewer.camera.setView({
            //              destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, currentAlt),
            //              orientation: { heading: viewer.camera.heading, pitch: viewer.camera.pitch, roll: 0 },
            //            });
            // //* [Modified Code] 중앙 정렬된 lookAt 사용
            const target = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat);
            const pitch = viewer.camera.pitch;
            const range = currentAlt / Math.sin(Math.abs(pitch));
            viewer.camera.lookAt(
              target,
              new Cesium.HeadingPitchRange(viewer.camera.heading, pitch, range),
            );
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
          } catch (e) {}
        }

        if (
          (curMode === 'FOLLOW') &&
          threeRef.current &&
          threeRef.current.shipPivot
        ) {
          const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
          const METERS_PER_DEGREE_LAT = 111132.954;
          const mPerDegLon =
            111319.491 * Math.cos((depPort.lat * Math.PI) / 180);
          threeRef.current.shipPivot.position.x =
            ((pos.lon - depPort.lon) * mPerDegLon) / 1.5;
          threeRef.current.shipPivot.position.z =
            (-(pos.lat - depPort.lat) * METERS_PER_DEGREE_LAT) / 1.5;
          if (threeRef.current.updateShipMotion)
            threeRef.current.updateShipMotion(0, pos.lat);
          // 타임라인 변경 시 빙산 위치도 즉시 갱신
          if (realBergsRef.current.length > 0) {
            threeRef.current.updateRealBergs(
              realBergsRef.current,
              pos.lat,
              pos.lon,
            );
          }
        }
      }
    },
    [
      dispatch,
      state.currentRouteKey,
      timedWaypoints,
      activeWaypoints,
      state.departurePort,
    ],
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
            new Cesium.PointPrimitiveCollection(),
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
            const handler = new Cesium.ScreenSpaceEventHandler(
              viewer.scene.canvas,
            );
            handler.setInputAction((click) => {
              const picked = viewer.scene.pick(click.position);
              if (
                picked?.primitive instanceof Cesium.PointPrimitive &&
                picked.primitive.id
              ) {
                const b = picked.primitive.id;
                const isCop = (b.source || '').includes('Copernicus');
                const lines = [`🧊 ${b.id || 'Iceberg'}`];
                lines.push(`📍 ${b.lat?.toFixed(4)}°N, ${b.lon?.toFixed(4)}°E`);
                lines.push(`📡 ${b.source}`);
                if (b.period) lines.push(`📅 ${b.period}`);
                if (b.length_m)
                  lines.push(
                    `📏 ${(b.length_m / 1000).toFixed(1)}km × ${(b.width_m / 1000).toFixed(1)}km`,
                  );
                if (viewer._bergUpdatedAt)
                  lines.push(`🔄 Updated: ${viewer._bergUpdatedAt}`);
                alert(lines.join('\n'));
              }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
            viewer._bergClickHandler = handler;
          }

          // ThreeOverlay용: bergList(실측 빙산) + 고농도 해빙 셀(대리 빙산) 병합
          // — 실측 빙산은 주로 북대서양, 고농도 셀은 북극 전역을 커버
          const BERG_MAX_THREE = 300;
          const highConcCells = icePoints.filter(
            (c) => c.lat > 60 && c.weight >= 0.8,
          );
          const threeStep =
            highConcCells.length > BERG_MAX_THREE
              ? Math.floor(highConcCells.length / BERG_MAX_THREE)
              : 1;
          const surrogateIce = highConcCells
            .filter((_, i) => i % threeStep === 0)
            .slice(0, BERG_MAX_THREE)
            .map((c) => ({
              lon: c.lon,
              lat: c.lat,
              size: 8000 + c.weight * 15000,
            }));
          const trackedBergs = bergList.map((b) => ({
            lon: b.lon,
            lat: b.lat,
            size: b.length_m || 5000,
          }));
          // 실측 빙산 우선, 고농도 셀 보충 (중복 위치 제거)
          const seen = new Set(trackedBergs.map((b) => `${b.lat.toFixed(2)},${b.lon.toFixed(2)}`));
          const merged = [...trackedBergs];
          for (const s of surrogateIce) {
            const key = `${s.lat.toFixed(2)},${s.lon.toFixed(2)}`;
            if (!seen.has(key)) {
              merged.push(s);
              seen.add(key);
            }
          }
          realBergsRef.current = merged;

          // DeckOverlay 업데이트 — bergList를 realBergData로 전달
          deckRef.current?.updateLayers({ iceData: icePoints, realBergData: bergList });
        } else {
          // viewer 없어도 DeckOverlay는 업데이트
          deckRef.current?.updateLayers({ iceData: icePoints, realBergData: [] });
        }

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
        const fmtDate =
          rawDate.length === 8
            ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
            : rawDate;
        const source =
          month === 'live' ? `실시간 (${fmtDate})` : `아카이브 ${month}`;
        dispatch({
          type: 'SET_ICE_DATA',
          payload: { data: iceData, key: month, source },
        });

        const cellCount = iceData?.cell_count || icePoints.length;
        showToast(
          `${source} 로드 완료 — ${cellCount.toLocaleString()}개 셀, WMS 위성영상 갱신됨`,
        );
      } catch (err) {
        dispatch({
          type: 'SET_ICE_DATA',
          payload: { data: null, key: month, source: '절차적 폴백' },
        });
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

  // ── Live 모드 아라온 3D 모델 동적 배치 ──────────────────────────────
  // 개방 수역: Wrangel 정박
  // 얼음 농도 > 0.3: 자동 호위 override + 쇄빙 거동
  useEffect(() => {
    const three = threeRef.current;
    if (!three || !three.setAraonState) return;
    if (voyageActive) return; // voyage 전용 useEffect 가 처리
    const ship = state.shipState;
    if (!ship || typeof ship.lat !== 'number') {
      three.setAraonState(null);
      return;
    }

    const sic = sampleIceFn(ship.lon, ship.lat);
    const needsEscort = sic > 0.3;

    if (needsEscort) {
      three.setAraonState({
        visible: true,
        escortOverride: { forwardM: 600, sideM: -80 },
      });
      if (three.setVoyageIceContext) {
        const estThickness = 0.3 + sic * 2.0;
        three.setVoyageIceContext({
          thicknessM: estThickness,
          speedKn: parseFloat(state.manualSpeed) || 0,
          isEscorted: true,
        });
      }
    } else {
      const ARAON_LAT = 71.0;
      const ARAON_LON = 179.5;
      const dLat = ARAON_LAT - ship.lat;
      const dLon = ARAON_LON - ship.lon;
      const mPerLat = 111132.954;
      const mPerLon = 111319.491 * Math.cos((ship.lat * Math.PI) / 180);
      const distM = Math.sqrt((dLat * mPerLat) ** 2 + (dLon * mPerLon) ** 2);
      three.setAraonState({
        visible: distM < 30000,
        deltaLatDeg: dLat,
        deltaLonDeg: dLon,
        refLat: ship.lat,
        headingDeg: 0,
        status: 'idle',
      });
      if (three.setVoyageIceContext) three.setVoyageIceContext(null);
    }
  }, [voyageActive, state.shipState, state.manualSpeed, sampleIceFn]);

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
            try {
              viewer.imageryLayers.remove(nsidcConcCanvasRef.current);
            } catch (_) {}
            nsidcConcCanvasRef.current = null;
          }
          try {
            const provider = new Cesium.WebMapServiceImageryProvider({
              url: '/nsidc-proxy/',
              layers: 'AMSRU2_Sea_Ice_Concentration_25km',
              parameters: { transparent: 'true', format: 'image/png' },
              tileWidth: 256,
              tileHeight: 256,
              enablePickFeatures: false,
            });
            const ly = viewer.imageryLayers.addImageryProvider(provider);
            ly.alpha = 0.8;
            nsidcConcCanvasRef.current = ly;
            viewer.imageryLayers.raiseToTop(ly);
          } catch (e) {
            console.warn('[nsidcConc] 실패:', e);
          }
        } else {
          if (nsidcConcCanvasRef.current) {
            try {
              viewer.imageryLayers.remove(nsidcConcCanvasRef.current);
            } catch (_) {}
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
          viewer.scene.backgroundColor =
            Cesium.Color.fromCssColorString('#1a2535');

          // ── 기존 gibsIce 레이어 제거 ──
          if (cesiumIceLayerRef.current) {
            try {
              viewer.imageryLayers.remove(cesiumIceLayerRef.current);
            } catch (_) {}
            cesiumIceLayerRef.current = null;
          }

          // ── NASA GIBS MODIS 해빙 레이어 (흰색 스타일) ──
          const gibsDate = new Date(Date.now() - 3 * 86400000)
            .toISOString()
            .slice(0, 10);
          try {
            const iceProvider = new Cesium.WebMapServiceImageryProvider({
              url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
              layers: 'MODIS_Terra_Sea_Ice',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                TIME: gibsDate,
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
              credit: 'NASA GIBS',
            });
            const iceLayer =
              viewer.imageryLayers.addImageryProvider(iceProvider);
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
            try {
              viewer.imageryLayers.remove(cesiumIceLayerRef.current);
            } catch (_) {}
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
        if (mode === 'FOLLOW') {
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
        waveHeight:
          formData.waveHeight ??
          weatherData?.routes?.[state.currentRouteKey]?.route_summary
            ?.max_wave_height_m ??
          weatherData?.route_summary?.max_wave_height_m ??
          0.0,
        visibilityKm:
          formData.visibilityKm ??
          weatherData?.routes?.[state.currentRouteKey]?.route_summary
            ?.min_visibility_km ??
          weatherData?.route_summary?.min_visibility_km ??
          10.0,
        isTempBelowMinus10:
          formData.isColdRoute ??
          weatherData?.routes?.[state.currentRouteKey]?.route_summary
            ?.is_temp_below_minus_10 ??
          weatherData?.route_summary?.is_temp_below_minus_10 ??
          false,
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
    [
      state.shipState,
      state.shipSpecs,
      state.currentRouteKey,
      weatherData,
      showToast,
    ],
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

  // //* [Modified Code] 평가 결과 초기화 핸들러 추가
  const handleResetEvaluation = useCallback(() => {
    setEvaluationResult(null);
    setRouteAlert(null);
    showToast('평가 데이터가 초기화되었습니다.');
  }, [showToast]);

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
            new Cesium.BoundingSphere(
              Cesium.Cartesian3.fromDegrees(lon, lat),
              0,
            ),
            {
              offset: new Cesium.HeadingPitchRange(0, pitch, range),
              duration: 1.5,
            },
          );
        } catch (e) {
          console.warn('flyTo error:', e);
        }
      }

      // //! [Original Code] Three.js 선박 위치 리셋 (Three.js 세계에서는 원점 기준)
      //      const three = threeRef.current;
      //      if (three && three.shipPivot) {
      //        three.shipPivot.position.set(0, 0, 0);
      //        three.shipPivot.rotation.y = 0;
      //      }
      // //* [Modified Code] 텔레포트 시 Three.js pivot 위치를 목표 지리 좌표에 맞게 동기화 (수동 조종 시 위치 튀는 현상 방지)
      const three = threeRef.current;
      if (three && three.shipPivot) {
        const depPort = PORTS[state.departurePort] || PORTS.BUSAN;
        const METERS_PER_DEGREE_LAT = 111132.954;
        const mPerDegLon = 111319.491 * Math.cos((lat * Math.PI) / 180);

        three.shipPivot.position.x = ((lon - depPort.lon) * mPerDegLon) / 1.5;
        three.shipPivot.position.z =
          (-(lat - depPort.lat) * METERS_PER_DEGREE_LAT) / 1.5;

        // 수동 조종 목표 Heading도 현재 heading으로 초기화
        manualHeadingRef.current = (state.shipState.heading * Math.PI) / 180;
        three.shipPivot.rotation.y = -manualHeadingRef.current;

        // 텔레포트 후 빙산 위치 즉시 갱신
        if (realBergsRef.current.length > 0) {
          three.updateRealBergs?.(realBergsRef.current, lat, lon);
        }
      }

      console.log(`[Teleport] → ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`);
    },
    [dispatch, state.departurePort, state.shipState.heading],
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

  // 아라온 통합 위치 (Minimap + TeleportOverlay 공유)
  // Voyage 모드: trace 기반 / Live 모드: 얼음 농도 기반 호위 판정
  const araonStatusLabelKo = {
    idle: '대기 중',
    dispatched: '출동 중',
    rendezvous: '본선 접근',
    escorting: '호위 중',
    released: '호위 해제',
  };
  let araonDisplayPos = null;
  if (voyageActive && voyage.trace) {
    const ibs = sampleIcebreakersAt(voyage.trace, voyage.tHours);
    const a = ibs.find((x) => x.id === 'ib-araon');
    if (a) {
      araonDisplayPos = {
        lat: a.position.lat,
        lon: a.position.lon,
        status: a.status,
        label: araonStatusLabelKo[a.status] || a.status,
      };
    }
  } else if (state.shipState && typeof state.shipState.lat === 'number') {
    const sic = sampleIceFn(state.shipState.lon, state.shipState.lat);
    if (sic > 0.3) {
      araonDisplayPos = {
        lat: state.shipState.lat + 0.005,
        lon: state.shipState.lon,
        status: 'escorting',
        label: '호위 중',
      };
    } else {
      araonDisplayPos = {
        lat: 71.0,
        lon: 179.5,
        status: 'idle',
        label: 'Wrangel 정박',
      };
    }
  }

  return (
    <div className="dt-app">
      {/* ═══ Header ═══ */}
      <Header activePanel={activePanel} onSelectPanel={handleSelectPanel} />

      {/* ═══ Main Area (Sidebar + Viewport) ═══ */}
      <div className="dt-main">
        <Sidebar
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
          onDepartureChange={(v) =>
            dispatch({ type: 'SET_DEPARTURE_PORT', payload: v })
          }
          onArrivalChange={(v) =>
            dispatch({ type: 'SET_ARRIVAL_PORT', payload: v })
          }
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
            rlShips={rlShips}
          />
          <ThreeOverlay
            ref={threeRef}
            visible={
              state.currentMode === 'FOLLOW'
            }
            shipState={state.shipState}
            specs={state.shipSpecs}
            mode={state.currentMode}
            baseRef={PORTS[state.departurePort] || PORTS.BUSAN}
            manualMode={state.manualMode}
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
          />
          <BinocularsMask
            visible={state.binocularsActive}
            label="x 8.0 BINOCULARS"
          />

          <TimelineBar
            simProgress={state.simProgress}
            timelineDay={state.timelineDay}
            onTimelineChange={handleTimelineChange}
            currentRouteKey={state.currentRouteKey}
            departureName={(PORTS[state.departurePort] || PORTS.BUSAN).name}
            arrivalName={(PORTS[state.arrivalPort] || PORTS.ROTTERDAM).name}
            // //* [Modified Code] 동적 총 소요 일수를 렌더링에 반영 (totalDays prop 추가)
            totalDays={Math.max(
              1,
              Math.round(
                calculateRouteDistanceKM(activeWaypoints) / (15 * 1.852 * 24),
              ),
            )}
          />

          {/* WMS Legends (bottom-left overlay, above timeline) */}
          <LegendContainer
            gebcoVisible={layerStates.gebcoBathy}
            nsidcVisible={layerStates.nsidcConc}
            copVisible={layerStates.copThick}
          />

          {/* Live Simulation 모드에서도 아라온을 Wrangel Is. 정박 마커로 표시 */}
          <AraonLiveMarker cesiumRef={cesiumRef} visible={appMode === 'live'} />
          {voyageActive && (
            <>
              <VoyagePlaybackLayer
                cesiumRef={cesiumRef}
                trace={voyage.trace}
                tHours={voyage.tHours}
                active={voyageActive}
              />
              {voyageHudVisible && (
                <VoyageHUD
                  trace={voyage.trace}
                  tHours={voyage.tHours}
                  currentRio={currentRio}
                />
              )}
              <VoyageEventToast newEvents={voyage.newEvents} />
              <VoyageAutoCam
                active={voyageActive}
                newEvents={voyage.newEvents}
                currentMode={state.currentMode}
                dispatch={dispatch}
              />
              <ForwardPreviewHUD
                visible={state.currentMode === 'FOLLOW'}
                trace={voyage.trace}
                tHours={voyage.tHours}
              />
            </>
          )}
          {/* VoyageInfoPanel — Voyage/Live 이중 모드, 사용자가 X로 닫을 수 있음 */}
          {infoPanelVisible && (
            <VoyageInfoPanel
              trace={voyage.trace}
              tHours={voyage.tHours}
              active={voyageActive}
              shipSpecs={state.shipSpecs}
              liveShipState={state.shipState}
              liveHud={state.hud}
              liveManual={{
                manualMode: state.manualMode,
                manualSpeed: state.manualSpeed,
                manualHeading: state.manualHeading,
              }}
              sampleIceFn={sampleIceFn}
            />
          )}

          {/* Indicators */}
          {state.manualMode && (
            <div id="manual-indicator">⚑ 수동 조종 모드</div>
          )}
          <div id="hud-hint" />
          <div id="polar-night-ind">극야 구간</div>
          <div id="banner" />
          <div id="gebco-depth-popup" />

          {/* 상단바 메뉴에서 토글되는 패널들 */}
          {(activePanel === 'rl_curriculum' || activePanel === 'trend_learning') && (
            <div style={{ position: 'absolute', left: 10, top: 10, zIndex: 300, display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: 8, maxHeight: 'calc(100vh - 20px)' }}>
              {activePanel === 'rl_curriculum' && <RLProgressOverlay />}
              {activePanel === 'trend_learning' && <TrendReportProgressOverlay />}
            </div>
          )}
          <TrendReportPanel open={trendReportOpen} onToggle={toggleTrendReport} />
          <FuelAnalysisPanel
            open={fuelAnalysisOpen}
            onToggle={toggleFuelAnalysis}
            currentRoute={state.currentRouteKey}
            shipSpecs={state.shipSpecs}
          />
          {activePanel === 'whatif' && (
            <WhatIfPanel route={state.currentRouteKey} iceClass={state.shipSpecs?.iceClass || 'PC5'} />
          )}
          {activePanel === 'sar' && <SarTrainingPanel />}
        </div>

        {/* ═══ Right Sidebar — 좌측 Sidebar와 대칭 구조 (static flex item) ═══ */}
        <aside className="dt-sidebar dt-sidebar--right">
          {/* ── 1. Simulation Mode 토글 (같은 버튼 재클릭 → 해당 모드 패널 on/off) ── */}
          <section className="dt-sidebar__section">
            <span className="dt-sidebar__section-title">Simulation Mode</span>
            <div className="voyage-mode-toggle">
              <button
                type="button"
                className={
                  appMode === 'live' && infoPanelVisible ? 'active' : ''
                }
                onClick={() => {
                  if (appMode === 'live') {
                    // 이미 live 모드 — info 패널 on/off 토글
                    setInfoPanelVisible((v) => !v);
                  } else {
                    // 다른 모드에서 진입 — live 로 전환 + 패널 열기
                    setAppMode('live');
                    dispatch({ type: 'SET_MODE', payload: 'SATELLITE' });
                    setInfoPanelVisible(true);
                  }
                }}
                title={
                  appMode === 'live'
                    ? (infoPanelVisible
                        ? '다시 누르면 Live 패널 숨김'
                        : '다시 누르면 Live 패널 표시')
                    : 'Live 모드로 전환'
                }
              >
                Live Simulation
              </button>
              <button
                type="button"
                className={
                  appMode === 'voyage' && (infoPanelVisible || voyageHudVisible)
                    ? 'active'
                    : ''
                }
                onClick={async () => {
                  if (appMode === 'voyage') {
                    // 이미 voyage — 두 패널 같이 토글 (둘 중 하나라도 보이면 모두 닫기, 아니면 모두 열기)
                    const anyVisible = infoPanelVisible || voyageHudVisible;
                    setInfoPanelVisible(!anyVisible);
                    setVoyageHudVisible(!anyVisible);
                  } else {
                    // 다른 모드에서 진입 — voyage 로 전환 + 두 패널 모두 열기
                    if (state.isSimulating) {
                      handleReset();
                    }
                    dispatch({ type: 'SET_MODE', payload: 'VOYAGE_PLAYBACK' });
                    setAppMode('voyage');
                    setInfoPanelVisible(true);
                    setVoyageHudVisible(true);
                    if (!voyage.trace) {
                      try {
                        await voyage.loadIceClass('Arc4');
                      } catch (e) {
                        // 로드 실패는 콘솔에 이미 로깅됨
                      }
                    }
                  }
                }}
                title={
                  appMode === 'voyage'
                    ? (infoPanelVisible || voyageHudVisible
                        ? '다시 누르면 Voyage 패널 숨김'
                        : '다시 누르면 Voyage 패널 표시')
                    : 'Voyage 모드로 전환'
                }
              >
                Voyage Playback
              </button>
            </div>
          </section>

          {/* ── 2a. Voyage 모드: 재생 컨트롤 ── */}
          {voyageActive && (
            <section className="dt-sidebar__section">
              <span className="dt-sidebar__section-title">재생 컨트롤</span>
              <VoyageControls
                iceClass={voyage.iceClass}
                onLoadIceClass={voyage.loadIceClass}
                trace={voyage.trace}
                tHours={voyage.tHours}
                isPlaying={voyage.isPlaying}
                speed={voyage.speed}
                onPlay={voyage.play}
                onPause={voyage.pause}
                onSeek={voyage.seek}
                onSetSpeed={voyage.setSpeed}
              />
            </section>
          )}

          {/* ── 2b. Live 모드: 자동 항해 컨트롤 ── */}
          {!voyageActive && (
            <section className="dt-sidebar__section">
              <span className="dt-sidebar__section-title">자동 항해</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* 현재 선택된 항로 표시 */}
                <div
                  style={{
                    padding: '6px 8px',
                    background: 'rgba(15,23,42,0.5)',
                    border: '1px solid rgba(34,211,238,0.25)',
                    borderRadius: 4,
                    fontSize: 10,
                    lineHeight: 1.5,
                    color: '#cbd5e1',
                  }}
                >
                  <div style={{ color: '#22d3ee', fontWeight: 700, marginBottom: 2 }}>
                    📍 항로: {state.currentRouteKey || 'NSR'}
                  </div>
                  <div style={{ color: '#94a3b8' }}>
                    {PORTS[state.departurePort]?.name || '부산'}
                    {' → '}
                    {PORTS[state.arrivalPort]?.name || '로테르담'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStart}
                  disabled={state.manualMode}
                  style={{
                    padding: '8px 12px',
                    border: state.isSimulating
                      ? '2px solid #ef4444'
                      : '2px solid #22d3ee',
                    borderRadius: 4,
                    background: state.isSimulating
                      ? 'rgba(239,68,68,0.15)'
                      : 'rgba(34,211,238,0.15)',
                    color: state.isSimulating ? '#ef4444' : '#22d3ee',
                    cursor: state.manualMode ? 'not-allowed' : 'pointer',
                    opacity: state.manualMode ? 0.4 : 1,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                  title={
                    state.manualMode
                      ? '수동 조종 중 — 먼저 해제하세요'
                      : state.isSimulating
                        ? '자동 항해 일시 정지'
                        : '선택된 항로의 waypoint 를 따라 자동 항해 시작'
                  }
                >
                  {state.isSimulating ? '⏸ 자동 항해 정지' : '▶ 자동 항해 시작'}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  style={{
                    padding: '6px 12px',
                    border: '1px solid #64748b',
                    borderRadius: 4,
                    background: 'transparent',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 11,
                  }}
                  title="출발항 위치로 리셋"
                >
                  ⟲ 리셋
                </button>
                {/* 시뮬 시간 배율 슬라이더 */}
                <div
                  style={{
                    marginTop: 2,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: '#94a3b8',
                    }}
                  >
                    <span>시뮬 배율</span>
                    <span style={{ color: '#22d3ee', fontWeight: 700 }}>
                      ×{Math.round(state.multiplier / 20)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="5000"
                    step="50"
                    value={state.multiplier}
                    onChange={(e) => handleMultiplierChange(e.target.value)}
                    disabled={state.manualMode}
                    style={{
                      width: '100%',
                      opacity: state.manualMode ? 0.4 : 1,
                      cursor: state.manualMode ? 'not-allowed' : 'pointer',
                    }}
                  />
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 10,
                    color: '#64748b',
                    lineHeight: 1.4,
                  }}
                >
                  {state.manualMode
                    ? '⚑ 수동 조종 중 — 자동 항해 비활성'
                    : state.isSimulating
                      ? `진행률 ${(state.simProgress * 100).toFixed(1)}%`
                      : '항로는 좌측 사이드바 Routes 에서 변경 가능'}
                </div>
              </div>
            </section>
          )}

          <section className="dt-sidebar__section">
            <WeatherHud
              shipPos={
                state.isSimulating || state.simProgress > 0
                  ? state.shipState
                  : mouseGlobePos || state.shipState
              }
              weatherData={weatherData}
              currentRouteKey={state.currentRouteKey}
              isMouseMode={
                !state.isSimulating && state.simProgress === 0 && !!mouseGlobePos
              }
            />
          </section>

          <section className="dt-sidebar__section">
            <Minimap
              shipPos={state.shipState}
              progress={state.simProgress}
              heading={state.shipState.heading}
              waypoints={waypoints}
              onOpenTeleport={() => setTeleportOpen(true)}
              departurePort={PORTS[state.departurePort] || PORTS.BUSAN}
              arrivalPort={PORTS[state.arrivalPort] || PORTS.ROTTERDAM}
              araonPos={araonDisplayPos}
            />
          </section>
        </aside>
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
        onRouteChange={handleRouteChange}
        onReset={handleResetEvaluation}
        araon={araonInfo}
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
        araonPos={
          araonDisplayPos
            ? {
                lat: araonDisplayPos.lat,
                lon: araonDisplayPos.lon,
                status: araonDisplayPos.label, // TeleportOverlay 는 한글 라벨 표시
              }
            : null
        }
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
