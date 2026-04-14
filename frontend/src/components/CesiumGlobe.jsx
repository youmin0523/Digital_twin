// ═══════════════════════════════════════════════════════════════
// CesiumGlobe.jsx — Cesium 3D globe viewer React component
// ═══════════════════════════════════════════════════════════════
import React, {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { ROUTES } from '../data/arcticRoutes';

Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MTJlMTZiNS02MzQ1LTRmZGMtOWM0Ni1kZWJkMzQxZTJhMTEiLCJpZCI6NDA2NTU5LCJpYXQiOjE3NzM5OTY1Mjl9.lpSbE0Dchaf-IEx0J8MkS6FoisyRwd4nfSZ0GyFciLI';

const ROUTE_COLORS = {
  NSR: '#00f2fe',
  NWP: '#f43f5e',
  TSR: '#a855f7',
  SUEZ: '#facc15',
  CAPE: '#fb923c',
  ETC: '#9ca3af',
};

// ── Canvas 기반 선박 아이콘 생성 ──────────────────────────────
const shipIconCache = {};

function createShipIcon(type = 'icebreaker') {
  if (shipIconCache[type]) return shipIconCache[type];

  const W = 128,
    H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // 공통: 선박은 위가 선수(bow), 아래가 선미(stern)
  ctx.clearRect(0, 0, W, H);

  if (type === 'icebreaker') {
    // ── 쇄빙선: 짧고 넓은 선체, 붉은 선체, 넓은 뱃머리 ──
    const cx = W / 2;
    // 선체 (빨간색)
    ctx.beginPath();
    ctx.moveTo(cx, 18); // 선수 꼭짓점
    ctx.lineTo(cx + 38, 60); // 우현 어깨
    ctx.lineTo(cx + 36, 200); // 우현 선미
    ctx.quadraticCurveTo(cx + 34, 228, cx + 20, 232); // 선미 라운드
    ctx.lineTo(cx - 20, 232);
    ctx.quadraticCurveTo(cx - 34, 228, cx - 36, 200);
    ctx.lineTo(cx - 38, 60);
    ctx.closePath();
    ctx.fillStyle = '#c0392b';
    ctx.fill();
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 쇄빙 보강대 (선수 흰색 삼각)
    ctx.beginPath();
    ctx.moveTo(cx, 14);
    ctx.lineTo(cx + 22, 55);
    ctx.lineTo(cx - 22, 55);
    ctx.closePath();
    ctx.fillStyle = '#ecf0f1';
    ctx.fill();

    // 브릿지 (흰색 사각)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 18, 140, 36, 30);
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 18, 140, 36, 30);

    // 브릿지 창문
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(cx - 14, 145, 28, 8);

    // 굴뚝
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(cx - 6, 175, 12, 18);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(cx - 6, 175, 12, 5);

    // 헬리패드 원형
    ctx.beginPath();
    ctx.arc(cx, 210, 10, 0, Math.PI * 2);
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(241,196,15,0.15)';
    ctx.fill();
  } else if (type === 'lng') {
    // ── LNG 운반선: 길고 파란 선체, 구형 탱크 4개 ──
    const cx = W / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 12);
    ctx.lineTo(cx + 30, 50);
    ctx.lineTo(cx + 28, 215);
    ctx.quadraticCurveTo(cx + 26, 238, cx + 14, 242);
    ctx.lineTo(cx - 14, 242);
    ctx.quadraticCurveTo(cx - 26, 238, cx - 28, 215);
    ctx.lineTo(cx - 30, 50);
    ctx.closePath();
    ctx.fillStyle = '#1a5276';
    ctx.fill();
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 2;
    ctx.stroke();

    // LNG 구형 탱크 4개
    const tankY = [65, 105, 145, 185];
    tankY.forEach((y) => {
      ctx.beginPath();
      ctx.arc(cx, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(200, 220, 240, 0.7)';
      ctx.fill();
      ctx.strokeStyle = '#85c1e9';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // 탱크 하이라이트
      ctx.beginPath();
      ctx.arc(cx - 4, y - 5, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
    });

    // 브릿지 (선미 쪽)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 16, 210, 32, 24);
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(cx - 12, 214, 24, 7);

    // 굴뚝
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(cx - 5, 234, 10, 8);
  } else {
    // ── 컨테이너선: 길고 어두운 선체, 컨테이너 격자 ──
    const cx = W / 2;
    ctx.beginPath();
    ctx.moveTo(cx, 10);
    ctx.lineTo(cx + 32, 48);
    ctx.lineTo(cx + 30, 218);
    ctx.quadraticCurveTo(cx + 28, 240, cx + 16, 244);
    ctx.lineTo(cx - 16, 244);
    ctx.quadraticCurveTo(cx - 28, 240, cx - 30, 218);
    ctx.lineTo(cx - 32, 48);
    ctx.closePath();
    ctx.fillStyle = '#1c2833';
    ctx.fill();
    ctx.strokeStyle = '#566573';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 컨테이너 격자 (색 다양하게)
    const colors = [
      '#e74c3c',
      '#3498db',
      '#27ae60',
      '#f39c12',
      '#8e44ad',
      '#e67e22',
      '#1abc9c',
      '#c0392b',
    ];
    const rows = 8,
      cols = 3;
    const cw = 16,
      ch = 16;
    const startX = cx - (cols * cw) / 2;
    const startY = 55;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = colors[(r * cols + c) % colors.length];
        ctx.fillRect(startX + c * (cw + 1), startY + r * (ch + 1), cw, ch);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(startX + c * (cw + 1), startY + r * (ch + 1), cw, ch);
      }
    }

    // 브릿지 (선미 쪽)
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(cx - 14, 200, 28, 22);
    ctx.fillStyle = '#2980b9';
    ctx.fillRect(cx - 10, 204, 20, 6);

    // 굴뚝
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(cx - 5, 222, 10, 14);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(cx - 5, 222, 10, 4);
  }

  const dataUrl = canvas.toDataURL('image/png');
  shipIconCache[type] = dataUrl;
  return dataUrl;
}

// ═══════════════════════════════════════════════════════════════

// ── RL 학습 선박 색상 (route × ship_type) ────────────────────
const RL_ROUTE_COLOR = { NSR: '#00f2fe', NWP: '#fb923c', TSR: '#a855f7' };
const RL_SHIP_COLOR  = { bulk: '#60a5fa', tanker: '#fbbf24', container: '#34d399', lng: '#c084fc' };

// 작은 원형 점 아이콘 (RL 학습 선박용)
const rlIconCache = {};
function createRLShipIcon(routeKey, shipType) {
  const cacheKey = `${routeKey}_${shipType}`;
  if (rlIconCache[cacheKey]) return rlIconCache[cacheKey];
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size / 2 - 2;
  // 외곽 원 (route 색)
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = RL_ROUTE_COLOR[routeKey] || '#94a3b8';
  ctx.fill();
  // 내부 원 (ship 색)
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = RL_SHIP_COLOR[shipType] || '#fff';
  ctx.fill();
  // 선수 방향 삼각형
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * 0.85);
  ctx.lineTo(cx + r * 0.35, cy + r * 0.4);
  ctx.lineTo(cx - r * 0.35, cy + r * 0.4);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  const url = canvas.toDataURL('image/png');
  rlIconCache[cacheKey] = url;
  return url;
}

const CesiumGlobe = forwardRef(function CesiumGlobe(
  {
    currentRouteKey = 'NSR',
    onViewerReady,
    activeWaypoints,
    routeVisibility,
    generatedRoutes,
    rlShips = [],   // [{ id, route, shipType, lat, lon, heading, label, iteration }]
  },
  ref,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const routeLineRef = useRef(null);
  const waypointEntitiesRef = useRef([]);
  const shipEntityRef = useRef(null);
  const lastShipType = useRef(null);
  const rlShipEntitiesRef = useRef({});  // id → entity

  const drawRoute = useCallback(
    (
      viewer,
      currentRouteKey,
      overrideWaypoints,
      visibilityStates,
      generatedRoutesObj,
    ) => {
      if (!viewer || viewer.isDestroyed()) return;

      if (!viewer._routeEntities) viewer._routeEntities = {};

      Object.keys(viewer._routeEntities).forEach((key) => {
        viewer._routeEntities[key].forEach((e) => viewer.entities.remove(e));
      });
      viewer._routeEntities = {};
      const renderedLabels = new Set();

      const renderRoute = (key, pathWps, isMain) => {
        if (!pathWps || pathWps.length === 0) return;

        const isVisible =
          visibilityStates && visibilityStates[key] !== undefined
            ? visibilityStates[key]
            : isMain;
        const cssColor = ROUTE_COLORS[key] || '#60a5fa';
        const entities = [];

        const line = viewer.entities.add({
          show: isVisible,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(
              pathWps.flatMap((w) => [w.lon, w.lat]),
            ),
            width: isMain ? 4.0 : 2.5,
            arcType: Cesium.ArcType.GEODESIC,
            material: isMain
              ? new Cesium.PolylineGlowMaterialProperty({
                  glowPower: 0.4,
                  color:
                    Cesium.Color.fromCssColorString(cssColor).withAlpha(0.9),
                })
              : new Cesium.ColorMaterialProperty(
                  Cesium.Color.fromCssColorString(cssColor).withAlpha(0.7),
                ),
          },
        });
        entities.push(line);

        for (const wp of pathWps) {
          const pt = viewer.entities.add({
            show: isVisible,
            position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 5000),
            point: {
              pixelSize: isMain ? 8 : 5,
              color: Cesium.Color.YELLOW,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: isMain ? 2 : 1,
            },
            // //! [Original Code] isMain인 경우에만 라벨 표시 (Comparison 항로는 명칭 안 뜸)
            //           label: isMain ? {
            //             text: wp.label, font: 'bold 13px sans-serif',
            //             fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK,
            //             outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -22),
            //             scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 8e6, 0.45),
            //           } : undefined,

            // //* [Modified Code] isVisible 상태이고 중복되지 않은 명칭인 경우에만 라벨 표시 (명칭이 겹치면 주 항로만 표시)
            label:
              isVisible && wp.label && !renderedLabels.has(wp.label)
                ? {
                    text: wp.label,
                    font: isMain
                      ? 'bold 13px sans-serif'
                      : 'bold 11px sans-serif',
                    fillColor: isMain
                      ? Cesium.Color.WHITE
                      : Cesium.Color.fromCssColorString('#cccccc'),
                    outlineColor: Cesium.Color.BLACK,
                    outlineWidth: 2,
                    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset: isMain
                      ? new Cesium.Cartesian2(0, -22)
                      : new Cesium.Cartesian2(0, -18),
                    scaleByDistance: new Cesium.NearFarScalar(
                      1e5,
                      1,
                      8e6,
                      0.45,
                    ),
                  }
                : undefined,
          });
          if (isVisible && wp.label) renderedLabels.add(wp.label);
          entities.push(pt);
        }
        viewer._routeEntities[key] = entities;
      };

      // 1. 메인 항로 먼저 렌더링 (레이블 표시 우선권 부여)
      renderRoute(
        currentRouteKey,
        overrideWaypoints || ROUTES[currentRouteKey] || ROUTES.NSR,
        true,
      );

      // 2. 나머지 비교 항로 렌더링 (중복 레이블 생략됨)
      Object.keys(ROUTES).forEach((key) => {
        if (key !== currentRouteKey) {
          const path =
            generatedRoutesObj && generatedRoutesObj[key]
              ? generatedRoutesObj[key]
              : ROUTES[key];
          renderRoute(key, path, false);
        }
      });
    },
    [],
  );

  const updateShipEntity = useCallback((pos, heading, shipSpecs = {}) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const type = shipSpecs.type || 'icebreaker';
    const position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0);
    // Billboard rotation: 캔버스에서 선수가 위(북)를 향해 그려짐
    // Cesium billboard rotation은 반시계 양수 → heading(시계 양수)이므로 부호 반전
    const rot = -Cesium.Math.toRadians(heading);

    // 아이콘 타입 변경 시 엔티티 재생성
    if (shipEntityRef.current && lastShipType.current !== type) {
      viewer.entities.remove(shipEntityRef.current);
      shipEntityRef.current = null;
    }

    const iconUrl = createShipIcon(type);

    if (!shipEntityRef.current) {
      lastShipType.current = type;
      shipEntityRef.current = viewer.entities.add({
        id: 'ship-vessel',
        position,
        billboard: {
          image: iconUrl,
          // //! [Original Code]
          //           width: 40,
          //           height: 80,
          // //* [Modified Code] 시인성 확보를 위해 크기 약 35% 증대 (40x80 -> 54x108)
          width: 54,
          height: 108,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          rotation: rot,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(5000, 1.8, 500000, 0.6),
        },
        label: {
          text:
            type === 'lng'
              ? 'LNG Carrier'
              : type === 'container'
                ? 'Container'
                : 'Icebreaker',
          font: 'bold 12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          // //! [Original Code]
          //           pixelOffset: new Cesium.Cartesian2(0, 45),
          // //* [Modified Code] 아이콘 크기 커짐에 따라 라벨이 겹치지 않도록 오프셋 하향 조정
          pixelOffset: new Cesium.Cartesian2(0, 60),
          scaleByDistance: new Cesium.NearFarScalar(5000, 1.0, 300000, 0.4),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
            0,
            500000,
          ),
        },
      });
    } else {
      shipEntityRef.current.position = position;
      shipEntityRef.current.billboard.rotation = rot;
    }
  }, []);

  // RL 학습 선박 엔티티 일괄 업데이트
  const updateRLShipEntities = useCallback((ships) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    const entities = rlShipEntitiesRef.current;

    // 사라진 id 제거
    const newIds = new Set(ships.map(s => s.id));
    Object.keys(entities).forEach(id => {
      if (!newIds.has(id)) {
        try { viewer.entities.remove(entities[id]); } catch {}
        delete entities[id];
      }
    });

    // 추가/업데이트
    ships.forEach(ship => {
      const pos = Cesium.Cartesian3.fromDegrees(ship.lon, ship.lat, 500);
      const rot = -Cesium.Math.toRadians(ship.heading || 0);
      const iconUrl = createRLShipIcon(ship.route, ship.shipType);

      if (entities[ship.id]) {
        entities[ship.id].position = pos;
        entities[ship.id].billboard.rotation = rot;
        if (entities[ship.id].label)
          entities[ship.id].label.text = new Cesium.ConstantProperty(ship.label || '');
      } else {
        entities[ship.id] = viewer.entities.add({
          id: `rl-ship-${ship.id}`,
          position: pos,
          billboard: {
            image: iconUrl,
            width: 22,
            height: 22,
            alignedAxis: Cesium.Cartesian3.UNIT_Z,
            rotation: rot,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(100000, 1.8, 8000000, 0.5),
          },
          label: {
            text: ship.label || '',
            font: 'bold 10px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 14),
            scaleByDistance: new Cesium.NearFarScalar(100000, 1.0, 5000000, 0.0),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
          },
        });
      }
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      viewer: viewerRef.current,
      updateShipEntity,
      updateRLShipEntities,
    }),
    [updateShipEntity, updateRLShipEntities],
  );

  useEffect(() => {
    let destroyed = false;
    async function init() {
      if (!containerRef.current) return;
      try {
        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: false,
          selectionIndicator: false,
          requestRenderMode: false,
          creditContainer: document.createElement('div'),
        });

        Cesium.createWorldTerrainAsync()
          .then((terrain) => {
            if (!destroyed && viewer && !viewer.isDestroyed())
              viewer.terrainProvider = terrain;
          })
          .catch((e) => console.warn('Terrain fail:', e));

        viewer.scene.globe.enableLighting = true;
        viewer.scene.atmosphere.show = true;
        viewer.scene.fog.enabled = true;
        const ctrl = viewer.scene.screenSpaceCameraController;
        ctrl.enableRotate =
          ctrl.enableZoom =
          ctrl.enableTranslate =
          ctrl.enableTilt =
          ctrl.enableLook =
            true;

        const layers = {};
        try {
          const gebco = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: 'https://ows.emodnet-bathymetry.eu/wms',
              layers: 'emodnet:mean_rainbowcolour',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                VERSION: '1.1.1',
                SRS: 'EPSG:4326',
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
            }),
          );
          gebco.show = false;
          layers.gebco = gebco;
          const nsidcConc = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
              layers: 'AMSR2_Sea_Ice_Concentration_12km_3Day',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                TIME: new Date(Date.now() - 4 * 86400000)
                  .toISOString()
                  .slice(0, 10),
              },
              tileWidth: 256,
              tileHeight: 256,
              enablePickFeatures: false,
              credit: 'NASA GIBS',
            }),
          );
          nsidcConc.show = false;
          layers.nsidcConc = nsidcConc;
        } catch (e) {
          console.warn('Layers error:', e);
        }

        const gibsDate = new Date(Date.now() - 3 * 86400000)
          .toISOString()
          .slice(0, 10);
        const gibsUrl =
          'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';
        const gibsOpts = (lyName) => ({
          url: gibsUrl,
          layers: lyName,
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

        // 위성 실사영상 (MODIS Terra + VIIRS SNPP) → viewer._satLayers
        try {
          const satLayers = [];
          const modis = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider(
              gibsOpts('MODIS_Terra_CorrectedReflectance_TrueColor'),
            ),
          );
          modis.show = false;
          satLayers.push(modis);
          const viirs = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider(
              gibsOpts('VIIRS_SNPP_CorrectedReflectance_TrueColor'),
            ),
          );
          viirs.show = false;
          satLayers.push(viirs);
          viewer._satLayers = satLayers;
        } catch (e) {
          console.warn('Satellite imagery layer error:', e);
        }

        // Copernicus 해빙 두께 (SITHICK) — /cop-proxy/ → wmts.marine.copernicus.eu
        try {
          const copThick = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: '/cop-proxy/',
              layers:
                'ARCTIC_ANALYSISFORECAST_PHY_ICE_002_011/cmems_mod_arc_phy_anfc_6km_detided_P1D-m',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                TIME: gibsDate,
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
            }),
          );
          copThick.alpha = 0.7;
          copThick.show = false;
          layers.copThick = copThick;
        } catch (e) {
          console.warn('Copernicus thick layer error:', e);
        }

        // NSIDC 해빙 경계선 (GIBS Sea_Ice_Brightness_Temp)
        try {
          const nsidcEdge = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
              layers: 'AMSRU2_Sea_Ice_Brightness_Temp_6km_89H',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                TIME: gibsDate,
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
              credit: 'NASA GIBS',
            }),
          );
          nsidcEdge.alpha = 0.7;
          nsidcEdge.show = false;
          layers.nsidcEdge = nsidcEdge;
        } catch (e) {
          console.warn('NSIDC edge layer error:', e);
        }

        // ESA Sentinel-1 SAR — /sentinel-proxy/ → Copernicus Data Space
        try {
          const esaSar = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: '/sentinel-proxy/',
              layers: 'SAR-URBAN',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                MAXCC: '40',
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
            }),
          );
          esaSar.alpha = 0.8;
          esaSar.show = false;
          layers.esaSar = esaSar;
        } catch (e) {
          console.warn('ESA SAR layer error:', e);
        }

        // Sentinel-2 자연색 (TRUE_COLOR) — /sentinel-proxy/
        try {
          const s2True = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: '/sentinel-proxy/',
              layers: 'TRUE-COLOR',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                MAXCC: '30',
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
            }),
          );
          s2True.alpha = 0.85;
          s2True.show = false;
          layers.s2True = s2True;
        } catch (e) {
          console.warn('S2 true color layer error:', e);
        }

        // Sentinel-2 NDSI 해빙 탐지 — /sentinel-proxy/
        try {
          const s2Ndsi = viewer.imageryLayers.addImageryProvider(
            new Cesium.WebMapServiceImageryProvider({
              url: '/sentinel-proxy/',
              layers: 'INDEX-NDSI',
              parameters: {
                transparent: 'true',
                format: 'image/png',
                MAXCC: '30',
              },
              tileWidth: 512,
              tileHeight: 512,
              enablePickFeatures: false,
            }),
          );
          s2Ndsi.alpha = 0.8;
          s2Ndsi.show = false;
          layers.s2Ndsi = s2Ndsi;
        } catch (e) {
          console.warn('S2 NDSI layer error:', e);
        }
        viewer._apiLayers = layers;

        drawRoute(viewer, currentRouteKey, activeWaypoints);

        const initWps =
          activeWaypoints || ROUTES[currentRouteKey] || ROUTES.NSR;
        const startPt = initWps[0] || { lon: 129.04, lat: 35.1 };
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            startPt.lon,
            startPt.lat,
            13000000,
          ),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-50),
            roll: 0,
          },
          duration: 2,
        });

        viewerRef.current = viewer;
        if (onViewerReady) onViewerReady(viewer);
      } catch (err) {
        console.warn('Cesium init fail:', err);
      }
    }
    init();
    return () => {
      destroyed = true;
      if (viewerRef.current) viewerRef.current.destroy();
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      drawRoute(
        viewerRef.current,
        currentRouteKey,
        activeWaypoints,
        routeVisibility,
        generatedRoutes,
      );
    }
  }, [
    currentRouteKey,
    activeWaypoints,
    routeVisibility,
    generatedRoutes,
    drawRoute,
  ]);

  // RL 선박 prop 변경 시 Cesium 엔티티 동기화
  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      updateRLShipEntities(rlShips);
    }
  }, [rlShips, updateRLShipEntities]);

  return <div id="cesium-wrap" ref={containerRef} />;
});

export default CesiumGlobe;
