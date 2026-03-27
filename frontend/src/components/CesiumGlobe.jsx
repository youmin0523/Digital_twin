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
  { currentRouteKey = 'NSR', onViewerReady, visible = true },
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

        // 2. NSIDC Sea Ice Concentration (NASA GIBS via proxy)
        const nsidcConc = viewer.imageryLayers.addImageryProvider(
          new Cesium.WebMapServiceImageryProvider({
            url: '/nsidc-proxy/',
            layers: 'AMSRU2_Sea_Ice_Concentration_25km',
            parameters: { transparent: 'true', format: 'image/png' },
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
          }),
        );
        nsidcConc.show = false;
        nsidcConc.alpha = 0.65;

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

        // 4. NSIDC Ice Edge (brightness temperature 89H via proxy)
        const nsidcEdge = viewer.imageryLayers.addImageryProvider(
          new Cesium.WebMapServiceImageryProvider({
            url: '/nsidc-proxy/',
            layers: 'AMSRU2_Sea_Ice_Brightness_Temp_6km_89H',
            parameters: { transparent: 'true', format: 'image/png' },
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
          }),
        );
        nsidcEdge.show = false;

        // 5. ESA Sentinel-1 SAR
        const esaSar = viewer.imageryLayers.addImageryProvider(
          new Cesium.WebMapServiceImageryProvider({
            url: 'https://sh.dataspace.copernicus.eu/ogc/wms/710b2915-4bc6-4fd8-b204-7ee69682da3f',
            layers: 'SENTINEL-1-GRD-EW',
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
            parameters: { transparent: 'true', format: 'image/png' },
          }),
        );
        esaSar.show = false;

        // 6. Sentinel-2 True Color
        const s2TrueColor = viewer.imageryLayers.addImageryProvider(
          new Cesium.WebMapServiceImageryProvider({
            url: 'https://sh.dataspace.copernicus.eu/ogc/wms/710b2915-4bc6-4fd8-b204-7ee69682da3f',
            layers: 'TRUE-COLOR',
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
            parameters: { transparent: 'true', format: 'image/png' },
          }),
        );
        s2TrueColor.show = false;
        s2TrueColor.alpha = 0.85;

        // 7. Sentinel-2 NDSI (ice detection index)
        const s2Ndsi = viewer.imageryLayers.addImageryProvider(
          new Cesium.WebMapServiceImageryProvider({
            url: 'https://sh.dataspace.copernicus.eu/ogc/wms/710b2915-4bc6-4fd8-b204-7ee69682da3f',
            layers: 'NDSI',
            tileWidth: 512,
            tileHeight: 512,
            enablePickFeatures: false,
            parameters: { transparent: 'true', format: 'image/png' },
          }),
        );
        s2Ndsi.show = false;
        s2Ndsi.alpha = 0.75;

        // Store layer references
        Object.assign(layers, { gebco, nsidcConc, copThick, nsidcEdge, esaSar, s2True: s2TrueColor, s2Ndsi });
        } catch (layerErr) {
          console.warn('WMS layer setup error (non-fatal):', layerErr);
        }
        viewer._apiLayers = layers;

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
      className={visible ? '' : 'hidden'}
    />
  );
});

export default CesiumGlobe;
