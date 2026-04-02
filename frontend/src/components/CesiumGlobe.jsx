// ═══════════════════════════════════════════════════════════════
// CesiumGlobe.jsx — Cesium 3D globe viewer React component
// Extracted from arctic-hybrid.html
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
// 테스트 주석
// ─── Cesium Ion access token ────────────────────────────────────
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI3MTJlMTZiNS02MzQ1LTRmZGMtOWM0Ni1kZWJkMzQxZTJhMTEiLCJpZCI6NDA2NTU5LCJpYXQiOjE3NzM5OTY1Mjl9.lpSbE0Dchaf-IEx0J8MkS6FoisyRwd4nfSZ0GyFciLI';

// ─── Route color mapping ────────────────────────────────────────
const ROUTE_COLORS = {
  NSR: '#60a5fa',   // blue  — Northeast Passage
  NWP: '#a78bfa',   // purple — Northwest Passage
  TSR: '#34d399',   // teal  — Transpolar Sea Route
  SUEZ: '#fbbf24',  // gold  — Suez Canal
  CAPE: '#f87171',  // red   — Cape of Good Hope
};

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════
const CesiumGlobe = forwardRef(function CesiumGlobe(
  { currentRouteKey = 'NSR', onViewerReady },
  ref,
) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);

  // Persistent entity refs so we can swap routes without leaking entities
  const routeLineRef = useRef(null);
  const waypointEntitiesRef = useRef([]);

  // Expose the raw Cesium.Viewer to parent via ref
  useImperativeHandle(ref, () => viewerRef.current, []);

  // ─── Draw / re-draw route on the globe ────────────────────────
  const drawRoute = useCallback((viewer, routeKey) => {
    if (!viewer || viewer.isDestroyed()) return;

    const waypoints = ROUTES[routeKey];
    if (!waypoints || waypoints.length === 0) return;

    // Remove previous route entities
    if (routeLineRef.current) {
      viewer.entities.remove(routeLineRef.current);
      routeLineRef.current = null;
    }
    waypointEntitiesRef.current.forEach((e) => viewer.entities.remove(e));
    waypointEntitiesRef.current = [];

    // Route line color
    const cssColor = ROUTE_COLORS[routeKey] || '#60a5fa';

    // Polyline entity (geodesic glow)
    routeLineRef.current = viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(
          waypoints.flatMap((w) => [w.lon, w.lat]),
        ),
        width: 2.5,
        arcType: Cesium.ArcType.GEODESIC,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.25,
          color: Cesium.Color.fromCssColorString(cssColor).withAlpha(0.9),
        }),
      },
    });

    // Waypoint label + point entities
    for (const wp of waypoints) {
      const ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 5000),
        point: {
          pixelSize: 5,
          color: Cesium.Color.YELLOW,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: wp.label,
          font: '10px Courier New',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1e5, 1, 6e6, 0.3),
        },
      });
      waypointEntitiesRef.current.push(ent);
    }
  }, []);

  // ─── Initialise Cesium Viewer (runs once on mount) ────────────
  useEffect(() => {
    let destroyed = false;

    async function init() {
      if (!containerRef.current) return;

      try {
        // Viewer 생성 (terrain은 비동기로 나중에 적용)
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
        });

        // Terrain을 비동기로 적용 (실패해도 viewer는 동작)
        Cesium.createWorldTerrainAsync()
          .then((terrain) => {
            if (!destroyed && viewer && !viewer.isDestroyed()) {
              viewer.terrainProvider = terrain;
            }
          })
          .catch((e) => console.warn('Terrain load failed (non-fatal):', e));

        // Scene settings (lighting, atmosphere, fog)
        viewer.scene.globe.enableLighting = true;
        viewer.scene.atmosphere.show = true;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.00015;

        // Tile loading optimisation
        viewer.scene.globe.tileCacheSize = 1000;
        viewer.scene.globe.maximumScreenSpaceError = 3;
        viewer.scene.globe.preloadAncestors = true;
        viewer.scene.globe.loadingDescendantLimit = 20;

        // Camera controls — all enabled
        const ctrl = viewer.scene.screenSpaceCameraController;
        ctrl.enableRotate = true;
        ctrl.enableZoom = true;
        ctrl.enableTranslate = true;
        ctrl.enableTilt = true;
        ctrl.enableLook = true;

        // ── WMS / WMTS imagery layers (각각 try-catch로 보호) ────
        const layers = {};
        try {

        // 1. GEBCO Bathymetry (EMODnet WMS)
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
        gebco.alpha = 0.75;

        // ── WMS 레이어 생성 헬퍼 (TIME 파라미터 포함) ────────
        // NASA GIBS WMS TIME 포맷: "YYYY-MM-DD"
        // Sentinel Hub WMS TIME 포맷: "YYYY-MM-DDT00:00:00Z/YYYY-MM-DDT23:59:59Z"
        function makeNsidcProvider(layerName, timeStr) {
          const params = { transparent: 'true', format: 'image/png' };
          if (timeStr) params.TIME = timeStr;
          return new Cesium.WebMapServiceImageryProvider({
            url: '/nsidc-proxy/',
            layers: layerName,
            parameters: params,
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
          });
        }

        function makeSentinelProvider(layerName, timeStr) {
          const params = { transparent: 'true', format: 'image/png' };
          if (timeStr) {
            params.TIME = timeStr;
          } else {
            // 기본: 최근 7일 범위 (Sentinel 데이터 가용성 확보)
            const end = new Date();
            const start = new Date(); start.setDate(start.getDate() - 7);
            params.TIME = start.toISOString().slice(0, 10) + '/' + end.toISOString().slice(0, 10);
          }
          return new Cesium.WebMapServiceImageryProvider({
            url: '/sentinel-proxy/',
            layers: layerName,
            parameters: params,
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
          });
        }

        // 2. NSIDC Sea Ice Concentration (NASA GIBS via proxy)
        const nsidcConc = viewer.imageryLayers.addImageryProvider(
          makeNsidcProvider('AMSRU2_Sea_Ice_Concentration_25km', null),
        );
        nsidcConc.show = true;
        nsidcConc.alpha = 1.0;

        // 3. Copernicus Ice Thickness (WMTS via proxy)
        const copThick = viewer.imageryLayers.addImageryProvider(
          new Cesium.WebMapTileServiceImageryProvider({
            url: '/cop-proxy/',
            layer:
              'ARCTIC_ANALYSISFORECAST_PHY_002_001/cmems_mod_arc_phy_anfc_6km_detided_P1D-m_202311/sithick',
            style: 'cmap:ice',
            format: 'image/png',
            tileMatrixSetID: 'EPSG:4326',
            tileWidth: 256,
            tileHeight: 256,
            tilingScheme: new Cesium.GeographicTilingScheme(),
          }),
        );
        copThick.show = false;
        copThick.alpha = 0.65;
        copThick.colorToAlpha = Cesium.Color.BLACK;
        copThick.colorToAlphaThreshold = 0.12;

        // 4. NSIDC Ice Edge (brightness temperature 89H via proxy)
        const nsidcEdge = viewer.imageryLayers.addImageryProvider(
          makeNsidcProvider('AMSRU2_Sea_Ice_Brightness_Temp_6km_89H', null),
        );
        nsidcEdge.show = false;

        // 5. ESA Sentinel-1 SAR
        const esaSar = viewer.imageryLayers.addImageryProvider(
          makeSentinelProvider('SENTINEL-1-GRD-EW', null),
        );
        esaSar.show = false;

        // 6. Sentinel-2 True Color
        const s2TrueColor = viewer.imageryLayers.addImageryProvider(
          makeSentinelProvider('TRUE-COLOR', null),
        );
        s2TrueColor.show = false;
        s2TrueColor.alpha = 0.85;

        // 7. Sentinel-2 NDSI (ice detection index)
        const s2Ndsi = viewer.imageryLayers.addImageryProvider(
          makeSentinelProvider('NDSI', null),
        );
        s2Ndsi.show = false;
        s2Ndsi.alpha = 0.75;

        // Store layer references
        Object.assign(layers, { gebco, nsidcConc, copThick, nsidcEdge, esaSar, s2True: s2TrueColor, s2Ndsi });
        } catch (layerErr) {
          console.warn('WMS layer setup error (non-fatal):', layerErr);
        }
        viewer._apiLayers = layers;

        // ── 위성영상 + NSIDC TIME 업데이트 함수 ─────────────────
        // GEBCO/Copernicus/Sentinel은 건드리지 않음 (TIME 불필요)
        viewer._satLayers = [];

        viewer._updateWmsTime = function(month) {
          if (!viewer || viewer.isDestroyed()) return;
          const al = viewer._apiLayers;
          if (!al) return;

          let gibsTime;
          if (month && month !== 'latest' && month !== 'live') {
            gibsTime = month + '-15';
          } else {
            const d = new Date(); d.setDate(d.getDate() - 2);
            gibsTime = d.toISOString().slice(0, 10);
          }

          try {
            // ── 1. 위성영상(MODIS/VIIRS)만 교체 (show 상태 보존) ──
            const satWasVisible = viewer._satLayers.length > 0
              ? viewer._satLayers[0].show
              : false; // 초기 기본값: OFF
            for (const lyr of viewer._satLayers) {
              try { viewer.imageryLayers.remove(lyr, true); } catch(_){}
            }
            viewer._satLayers = [];

            // NASA Blue Marble Next Generation — 월별 합성 (단일 레이어)
            const bmMonth = gibsTime.slice(0, 7);   // "YYYY-MM"
            const lyr = new Cesium.ImageryLayer(
              new Cesium.WebMapServiceImageryProvider({
                url: 'https://neo.gsfc.nasa.gov/wms/wms',
                layers: 'BlueMarbleNG-TB',
                parameters: { transparent: 'false', format: 'image/png', TIME: bmMonth },
                tileWidth: 512, tileHeight: 512, enablePickFeatures: false,
              }),
            );
            lyr.show = satWasVisible;
            lyr.alpha = 1.0;
            viewer.imageryLayers.add(lyr);
            viewer._satLayers.push(lyr);

            // ── 2. 모든 API 데이터 레이어를 위성영상 위로 올림 ──
            const allApiKeys = ['gebco', 'copThick', 'nsidcEdge', 'esaSar', 's2True', 's2Ndsi', 'nsidcConc'];
            for (const key of allApiKeys) {
              if (al[key]) try { viewer.imageryLayers.raiseToTop(al[key]); } catch(_){}
            }

            console.log('[CesiumGlobe] SAT+NSIDC updated:', gibsTime);
          } catch (e) {
            console.warn('[CesiumGlobe] WMS update error:', e);
          }
        };

        // ── Initial route ───────────────────────────────────────
        drawRoute(viewer, currentRouteKey);

        // ── Initial camera — Korea (129.04, 35.1) ───────────────
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(129.04, 35.1, 13000000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-50),
            roll: 0,
          },
          duration: 2,
        });

        // Persist ref
        viewerRef.current = viewer;

        // Notify parent
        if (typeof onViewerReady === 'function') {
          onViewerReady(viewer);
        }
      } catch (err) {
        console.warn('CesiumGlobe init error:', err);
      }
    }

    init();

    // Cleanup on unmount
    return () => {
      destroyed = true;
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only

  // ─── Re-draw route when currentRouteKey changes ───────────────
  useEffect(() => {
    if (viewerRef.current && !viewerRef.current.isDestroyed()) {
      drawRoute(viewerRef.current, currentRouteKey);
    }
  }, [currentRouteKey, drawRoute]);


  // ─── Render ───────────────────────────────────────────────────
  return (
    <div
      id="cesium-wrap"
      ref={containerRef}
    />
  );
});

export default CesiumGlobe;
