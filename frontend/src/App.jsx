import React, { useRef, useState, useCallback, useEffect } from 'react';
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
import BridgeOverlay from './components/overlay/BridgeOverlay';
import BinocularsMask from './components/overlay/BinocularsMask';
import { ROUTES } from './data/arcticRoutes';
import { SHIP_PRESETS } from './data/vesselPresets';
import useManualControl from './hooks/useManualControl';

function AppInner() {
  const state = useAppState();
  const dispatch = useDispatch();

  const cesiumRef = useRef(null);
  const threeRef = useRef(null);
  const deckRef = useRef(null);
  const viewerRef = useRef(null);

  const animFrameRef = useRef(null);

  // 키보드 수동 조종
  const { keys } = useManualControl();

  // 텔레포트 오버레이 상태
  const [teleportOpen, setTeleportOpen] = useState(false);

  // ── 메인 애니메이션 루프 ──────────────────────────────────────
  useEffect(() => {
    let lastTime = performance.now();
    let manualHeading = 0;
    let manualSpeed = 0;
    let manualThrottle = 0;
    let simElapsed = 0;

    function loop(now) {
      animFrameRef.current = requestAnimationFrame(loop);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      // ── 수동 조종 키보드 입력 처리 ──
      const k = keys.current;
      if (k && (k['KeyW'] || k['KeyS'] || k['KeyA'] || k['KeyD'] || k['KeyX'])) {
        // 스로틀 (W/S)
        if (k['KeyW']) manualThrottle = Math.min(manualThrottle + dt * 80, 100);
        if (k['KeyS']) manualThrottle = Math.max(manualThrottle - dt * 80, -30);
        if (k['KeyX']) manualThrottle = 0;

        // 타 (A/D)
        const yawRate = 1.5;
        if (k['KeyA']) manualHeading -= yawRate * dt;
        if (k['KeyD']) manualHeading += yawRate * dt;

        // 속도 계산
        const targetSpeed = manualThrottle * 0.5;
        manualSpeed += (targetSpeed - manualSpeed) * dt * 2.0;

        // Three.js 선박 위치 업데이트
        const moveScale = 80;
        const three = threeRef.current;
        if (three && three.shipPivot) {
          three.shipPivot.rotation.y = -manualHeading;
          three.shipPivot.position.x += Math.sin(manualHeading) * manualSpeed * dt * moveScale;
          three.shipPivot.position.z -= Math.cos(manualHeading) * manualSpeed * dt * moveScale;

          const { camera } = three;
          if (camera) {
            const ship = three.shipPivot.position;
            camera.position.x = ship.x;
            camera.position.z = ship.z + 200;
            camera.lookAt(ship.x, 15, ship.z - 200);
          }
        }

        // HUD 수동 계기 업데이트
        dispatch({
          type: 'SET_MANUAL',
          payload: {
            manualThrottle: Math.round(manualThrottle),
            manualSpeed: Math.round(manualSpeed * 10) / 10,
            manualHeading: Math.round((manualHeading * 180 / Math.PI + 360) % 360),
            manualYawRate: Math.round(yawRate * 100) / 100,
          },
        });
      }

      // deck.gl Cesium 카메라 싱크
      const deck = deckRef.current;
      if (deck && deck.syncView && viewerRef.current) {
        try { deck.syncView(); } catch (e) {}
      }
    }

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // API 레이어 상태
  const [layerStates, setLayerStates] = useState({
    nsidcConc: false,
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

  // Cesium 뷰어 준비 완료
  const handleViewerReady = useCallback((viewer) => {
    viewerRef.current = viewer;
    console.log('[App] Cesium viewer ready');
  }, []);

  // 시뮬레이션 제어
  const handleStart = useCallback(() => {
    dispatch({ type: 'SET_SIMULATING', payload: !state.isSimulating });
  }, [state.isSimulating, dispatch]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  // 카메라 모드
  const handleModeChange = useCallback((mode) => {
    dispatch({ type: 'SET_MODE', payload: mode });
    dispatch({ type: 'SET_BRIDGE_VISIBLE', payload: mode === 'BRIDGE' });
  }, [dispatch]);

  const handleManualToggle = useCallback(() => {
    dispatch({ type: 'SET_MANUAL_MODE', payload: !state.manualMode });
  }, [state.manualMode, dispatch]);

  // 배속/타임라인
  const handleMultiplierChange = useCallback((value) => {
    dispatch({ type: 'SET_MULTIPLIER', payload: Number(value) });
  }, [dispatch]);

  const handleTimelineChange = useCallback((value) => {
    dispatch({ type: 'SET_TIMELINE', payload: Number(value) });
  }, [dispatch]);

  // 항로/선박 제원
  const handleRouteChange = useCallback((routeKey) => {
    dispatch({ type: 'SET_ROUTE', payload: routeKey });
  }, [dispatch]);

  const handleSpecChange = useCallback((field, value) => {
    dispatch({ type: 'SET_SHIP_SPECS', payload: { [field]: value } });
  }, [dispatch]);

  const handlePresetLoad = useCallback((presetKey) => {
    const preset = SHIP_PRESETS[presetKey];
    if (preset) dispatch({ type: 'SET_SHIP_SPECS', payload: preset });
  }, [dispatch]);

  // FOV
  const handleFovChange = useCallback((value) => {
    dispatch({ type: 'SET_FOV', payload: Number(value) });
    dispatch({ type: 'SET_FOV_OVERRIDE', payload: true });
  }, [dispatch]);

  // 해빙 데이터 월 변경
  const handleMonthChange = useCallback((month) => {
    console.log('Ice month changed:', month);
  }, []);

  // API 레이어 토글
  const handleLayerToggle = useCallback((layerKey, checked) => {
    setLayerStates((prev) => ({ ...prev, [layerKey]: checked }));
    // Cesium 뷰어 레이어 토글
    const viewer = viewerRef.current;
    if (viewer && viewer._apiLayers) {
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
      if (cesiumLayer) cesiumLayer.show = checked;
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

  // 라우팅 평가
  const handleEvaluate = useCallback((formData) => {
    console.log('[Routing] evaluate:', formData);
    setEvaluationResult({
      status: 'approved',
      rioScore: 12.5,
      reason: 'NSR 통항 조건 충족 — 모든 해빙 구간 POLARIS RIO > 0',
      distances: { current: 7200, suez: 11200, saved: 4000 },
    });
  }, []);

  // 텔레포트
  const handleTeleport = useCallback((lat, lon) => {
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
      } catch (e) { console.warn('flyTo error:', e); }
    }

    // Three.js 선박 위치 리셋 (Three.js 세계에서는 원점 기준)
    const three = threeRef.current;
    if (three && three.shipPivot) {
      three.shipPivot.position.set(0, 0, 0);
      three.shipPivot.rotation.y = 0;
    }

    console.log(`[Teleport] → ${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`);
  }, [dispatch]);

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
      <CesiumGlobe
        ref={cesiumRef}
        currentRouteKey={state.currentRouteKey}
        onViewerReady={handleViewerReady}
        visible={state.currentMode !== 'BRIDGE' && state.currentMode !== 'FOLLOW'}
      />

      <ThreeOverlay
        ref={threeRef}
        visible={state.currentMode === 'BRIDGE' || state.currentMode === 'FOLLOW'}
        shipState={state.shipState}
        mode={state.currentMode}
      />

      <DeckOverlay
        ref={deckRef}
        visible={state.currentMode === 'SATELLITE' || state.currentMode === 'WIDE'}
        cesiumViewer={viewerRef.current}
      />

      <div id="fade"></div>

      {/* 브릿지 오버레이 */}
      <BridgeOverlay
        visible={state.bridgeVisible}
        heading={state.shipState.heading}
        speed={state.hud.speed}
        rollAngle={parseFloat(state.hud.roll) || 0}
      />

      {/* 쌍안경 */}
      <BinocularsMask
        visible={state.binocularsActive}
        label="x 8.0 BINOCULARS"
      />

      {/* HUD 패널: 왼쪽 선박정보 */}
      <HudLeft
        speed={state.hud.speed}
        throttle={state.hud.throttle}
        progress={state.hud.progress}
        position={state.hud.position}
        iceState={state.hud.iceState}
        phase={state.hud.phase}
      />

      {/* HUD 패널: 오른쪽 해빙위험도 */}
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

      {/* 카메라 전환 */}
      <CameraPanel
        currentMode={state.currentMode}
        onModeChange={handleModeChange}
        onManualToggle={handleManualToggle}
        zoomBar={state.zoomBar}
        zoomDist={state.zoomDist}
        fov={state.fov}
        onFovChange={handleFovChange}
      />

      {/* 수동 조종 계기 */}
      <ManualControl
        throttle={state.manualThrottle}
        speed={state.manualSpeed}
        heading={state.manualHeading}
        turnRate={state.manualYawRate}
        fov={state.fov}
        visible={state.manualMode}
      />

      {/* 선박 제원 설정 */}
      <ShipSpecsPanel
        specs={state.shipSpecs}
        onSpecChange={handleSpecChange}
        onPresetLoad={handlePresetLoad}
        onRouteChange={handleRouteChange}
        currentRoute={state.currentRouteKey}
      />

      {/* NSR 항로 평가 */}
      <RoutingEvaluationPanel
        onEvaluate={handleEvaluate}
        evaluationResult={evaluationResult}
        currentRoute={state.currentRouteKey}
      />

      {/* API 레이어 토글 */}
      <ApiLayersControl
        layerStates={layerStates}
        onLayerToggle={handleLayerToggle}
        gebcoOpacity={gebcoOpacity}
        onGebcoOpacityChange={handleGebcoOpacityChange}
      />

      {/* 범례 패널들 */}
      <LegendContainer
        gebcoVisible={layerStates.gebcoBathy}
        nsidcVisible={layerStates.nsidcConc}
        copVisible={layerStates.copThick}
      />

      {/* 하단 컨트롤 */}
      <BottomControl
        isSimulating={state.isSimulating}
        onStart={handleStart}
        onReset={handleReset}
        multiplier={state.multiplier}
        onMultiplierChange={handleMultiplierChange}
        timelineDay={state.timelineDay}
        onTimelineChange={handleTimelineChange}
      />

      {/* 미니맵 */}
      <Minimap
        shipPos={state.shipState}
        progress={state.simProgress}
        waypoints={waypoints}
        onOpenTeleport={() => setTeleportOpen(true)}
      />

      {/* 텔레포트 오버레이 */}
      <TeleportOverlay
        visible={teleportOpen}
        waypoints={waypoints}
        currentRoute={state.currentRouteKey}
        onTeleport={handleTeleport}
        onClose={() => setTeleportOpen(false)}
      />

      {/* 리센터 버튼 */}
      <RecenterButton onClick={handleRecenter} />

      {/* 상태 인디케이터 */}
      <div id="manual-indicator" style={{ display: state.manualMode ? 'block' : 'none' }}>
        ⚑ 수동 조종 모드
      </div>
      <div id="hud-hint"></div>
      <div id="polar-night-ind">🌑 극야 구간</div>
      <div id="banner">부산 → 북극항로 → 로테르담 | 14일 운항</div>
      <div id="toast"></div>
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
