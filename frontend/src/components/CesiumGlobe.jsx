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
  NSR: '#60a5fa', NWP: '#a78bfa', TSR: '#34d399', SUEZ: '#fbbf24', CAPE: '#f87171',
};

const CesiumGlobe = forwardRef(function CesiumGlobe(
  { currentRouteKey = 'NSR', onViewerReady },
  ref,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const routeLineRef = useRef(null);
  const waypointEntitiesRef = useRef([]);
  const shipEntityRef = useRef(null);
  const superstructureRef = useRef(null); // 선실(Superstructure) 엔티티

  const drawRoute = useCallback((viewer, routeKey) => {
    if (!viewer || viewer.isDestroyed()) return;
    const waypoints = ROUTES[routeKey];
    if (!waypoints || waypoints.length === 0) return;

    if (routeLineRef.current) viewer.entities.remove(routeLineRef.current);
    waypointEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    waypointEntitiesRef.current = [];

    const cssColor = ROUTE_COLORS[routeKey] || '#60a5fa';
    routeLineRef.current = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(waypoints.flatMap((w) => [w.lon, w.lat])),
        width: 4.0,
        arcType: Cesium.ArcType.GEODESIC,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.4,
          color: Cesium.Color.fromCssColorString(cssColor).withAlpha(0.8),
        }),
      },
    });

    for (const wp of waypoints) {
      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 5000),
        point: { pixelSize: 8, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
        label: {
          text: wp.label, font: 'bold 13px sans-serif', fillColor: Cesium.Color.WHITE, outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3, style: Cesium.LabelStyle.FILL_AND_OUTLINE, pixelOffset: new Cesium.Cartesian2(0, -22),
          scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 8e6, 0.45),
        },
      });
      waypointEntitiesRef.current.push(ent);
    }
  }, []);

  const updateShipEntity = useCallback((pos, heading, shipSpecs = {}) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    const { type = 'icebreaker', len = 200, width = 40 } = shipSpecs;
    const position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 0);
    const hpr = new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(heading - 90), 0, 0);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(position, hpr);

    // 1. 메인 선체(Hull) 생성 및 업데이트
    if (!shipEntityRef.current) {
      shipEntityRef.current = viewer.entities.add({
        id: 'simulated-hull',
        position: position,
        orientation: orientation,
        label: {
          text: type.toUpperCase(), font: 'bold 18px sans-serif', style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 4, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -80),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
          scaleByDistance: new Cesium.NearFarScalar(1000, 1.3, 3000000, 0.8),
        },
      });
    } else {
      shipEntityRef.current.position = position;
      shipEntityRef.current.orientation = orientation;
    }

    // 2. 선실(Superstructure) 생성 및 업데이트 (입체감 부여)
    if (!superstructureRef.current) {
        superstructureRef.current = viewer.entities.add({
            id: 'simulated-superstructure',
            position: position,
            orientation: orientation,
        });
    } else {
        superstructureRef.current.position = position;
        superstructureRef.current.orientation = orientation;
    }

    const hull = shipEntityRef.current;
    const sup = superstructureRef.current;
    
    let hullColor = Cesium.Color.RED;
    if (type === 'lng') hullColor = Cesium.Color.ROYALBLUE;
    if (type === 'container') hullColor = Cesium.Color.DARKSLATEGRAY;

    // ★ 이동 중에도 선명하게 보이도록 minimumPixelSize 강화 ★
    hull.box = {
      dimensions: new Cesium.Cartesian3(len, width, 18),
      material: hullColor,
      outline: true,
      outlineColor: Cesium.Color.WHITE,
      minimumPixelSize: 60, // 위성 뷰에서도 확실한 배 모양 유지
      maximumScale: 100,
    };

    // 선실(Bridge) 표현 - 배의 뒤쪽에 위치시켜 전형적인 선박 실루엣 구현
    const supWidth = width * 0.8;
    const supLen = len * 0.2;
    sup.box = {
        dimensions: new Cesium.Cartesian3(supLen, supWidth, 25),
        material: Cesium.Color.WHITE,
        outline: true,
        outlineColor: Cesium.Color.GRAY,
        // 선체와 동일한 스케일링 정책
        minimumPixelSize: 20, 
    };
  }, []);

  useImperativeHandle(ref, () => ({
    viewer: viewerRef.current,
    updateShipEntity,
  }), [updateShipEntity]);

  useEffect(() => {
    let destroyed = false;
    async function init() {
      if (!containerRef.current) return;
      try {
        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
          homeButton: false, sceneModePicker: false, navigationHelpButton: false,
          fullscreenButton: false, infoBox: false, selectionIndicator: false,
          // ★ 중요: 실시간 시뮬레이션을 위해 렌더링 루프를 최적화 ★
          requestRenderMode: false,
          // //* [Modified Code] Cesium ION 로고(크레딧) 숨기기
          creditContainer: document.createElement('div'),
        });

        Cesium.createWorldTerrainAsync().then((terrain) => {
          if (!destroyed && viewer && !viewer.isDestroyed()) viewer.terrainProvider = terrain;
        }).catch(e => console.warn('Terrain fail:', e));

        viewer.scene.globe.enableLighting = true;
        viewer.scene.atmosphere.show = true;
        viewer.scene.fog.enabled = true;
        const ctrl = viewer.scene.screenSpaceCameraController;
        ctrl.enableRotate = ctrl.enableZoom = ctrl.enableTranslate = ctrl.enableTilt = ctrl.enableLook = true;

        const layers = {};
        try {
          const gebco = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({
            url: 'https://ows.emodnet-bathymetry.eu/wms', layers: 'emodnet:mean_rainbowcolour',
            parameters: { transparent: 'true', format: 'image/png', VERSION: '1.1.1', SRS: 'EPSG:4326' },
            tileWidth: 512, tileHeight: 512, enablePickFeatures: false,
          }));
          gebco.show = false;
          layers.gebco = gebco;
          layers.nsidcConc = viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({
            url: '/nsidc-proxy/', layers: 'AMSRU2_Sea_Ice_Concentration_25km', parameters: { transparent: 'true', format: 'image/png' },
            tileWidth: 512, tileHeight: 512, enablePickFeatures: false,
          }));
        } catch (e) { console.warn('Layers error:', e); }
        viewer._apiLayers = layers;

        drawRoute(viewer, currentRouteKey);
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(129.04, 35.1, 13000000),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 },
          duration: 2,
        });

        viewerRef.current = viewer;
        if (onViewerReady) onViewerReady(viewer);
      } catch (err) { console.warn('Cesium init fail:', err); }
    }
    init();
    return () => { destroyed = true; if (viewerRef.current) viewerRef.current.destroy(); };
  }, []);

  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) drawRoute(viewerRef.current, currentRouteKey);
  }, [currentRouteKey, drawRoute]);

  return <div id="cesium-wrap" ref={containerRef} />;
});

export default CesiumGlobe;
