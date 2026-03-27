import React, {
  useEffect,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import * as CesiumLib from 'cesium';
import { Deck } from '@deck.gl/core';
import { ScatterplotLayer, PathLayer, GeoJsonLayer } from '@deck.gl/layers';

// ---------------------------------------------------------------------------
// Procedural data generators -- mirrors arctic-hybrid.html lines 1792-1840
// ---------------------------------------------------------------------------

function generateIceData() {
  const pts = [];
  const rng = (a, b) => a + Math.random() * (b - a);

  // NSR / Arctic Ocean ice-dense grid (eastern sector)
  for (let la = 65; la <= 85; la += 1.5) {
    for (let lo = 30; lo <= 180; lo += 3) {
      const conc = Math.max(
        0,
        Math.min(1, 0.9 - (la - 85) ** 2 / 600 + rng(-0.12, 0.12)),
      );
      if (conc > 0.05) pts.push({ lon: lo, lat: la, weight: conc });
    }
  }

  // Western sector (Beaufort / Chukchi)
  for (let la = 65; la <= 82; la += 1.5) {
    for (let lo = -180; lo <= -90; lo += 3) {
      const conc = Math.max(
        0,
        Math.min(1, 0.85 - (la - 82) ** 2 / 500 + rng(-0.12, 0.12)),
      );
      if (conc > 0.05) pts.push({ lon: lo, lat: la, weight: conc });
    }
  }

  return pts;
}

function generateBergData() {
  const bergs = [];
  const rng = (a, b) => a + Math.random() * (b - a);
  const regions = [
    { latR: [70, 82], lonR: [30, 100], n: 40 },
    { latR: [68, 78], lonR: [100, 180], n: 35 },
    { latR: [70, 80], lonR: [-180, -100], n: 30 },
    { latR: [65, 75], lonR: [-80, -40], n: 25 },
  ];

  for (const r of regions) {
    for (let i = 0; i < r.n; i++) {
      bergs.push({
        lon: rng(r.lonR[0], r.lonR[1]),
        lat: rng(r.latR[0], r.latR[1]),
        size: rng(2000, 12000),
      });
    }
  }
  return bergs;
}

// Danger zone polygon coordinates [lon, lat]
const DANGER_ZONE_COORDS = [
  [
    [90, 77],
    [110, 77],
    [110, 79],
    [90, 79],
    [90, 77],
  ],
  [
    [140, 74],
    [160, 74],
    [160, 76],
    [140, 76],
    [140, 74],
  ],
  [
    [-170, 68],
    [-155, 68],
    [-155, 71],
    [-170, 71],
    [-170, 68],
  ],
];

// Convert danger zone coords to a GeoJSON FeatureCollection
function buildDangerZonesGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: DANGER_ZONE_COORDS.map((ring, i) => ({
      type: 'Feature',
      properties: { id: i, name: `Danger Zone ${i + 1}` },
      geometry: {
        type: 'Polygon',
        coordinates: [ring], // ring is already [lon, lat] pairs
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// Layer builders -- mirrors buildDeckLayers() from arctic-hybrid.html
// ---------------------------------------------------------------------------

function buildLayers(iceData, bergData, dangerGeoJSON, realBergData) {
  return [
    // 1. Ice concentration scatter (replaces HeatmapLayer with identical
    //    ScatterplotLayer used in the original source)
    new ScatterplotLayer({
      id: 'ice-scatter',
      data: iceData,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 28000,
      radiusUnits: 'meters',
      radiusMinPixels: 2,
      getFillColor: (d) => {
        const w = d.weight;
        if (w > 0.8) return [255, 255, 255, 210];
        if (w > 0.6) return [200, 230, 255, 190];
        if (w > 0.4) return [100, 180, 255, 150];
        if (w > 0.2) return [0, 120, 220, 110];
        return [0, 80, 180, 60];
      },
      pickable: false,
    }),

    // 2. Iceberg scatter (white/cyan dots with per-feature size) - procedural
    new ScatterplotLayer({
      id: 'bergs',
      data: bergData,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.size,
      getFillColor: [200, 240, 255, 180],
      getLineColor: [100, 180, 255, 220],
      stroked: true,
      lineWidthMinPixels: 1,
      radiusUnits: 'meters',
      radiusMinPixels: 2,
      pickable: false,
    }),

    // 2b. Real iceberg data - yellow to distinguish from procedural
    new ScatterplotLayer({
      id: 'real-bergs',
      data: realBergData || [],
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8,
      getFillColor: [255, 200, 0, 230],
      getLineColor: [255, 140, 0, 255],
      stroked: true,
      lineWidthMinPixels: 1,
      radiusUnits: 'pixels',
      pickable: false,
    }),

    // 3. Danger zones -- GeoJsonLayer (red fill + polygon outlines)
    new GeoJsonLayer({
      id: 'danger-zones',
      data: dangerGeoJSON,
      filled: true,
      stroked: true,
      getFillColor: [255, 50, 50, 80],
      getLineColor: [255, 50, 50, 200],
      getLineWidth: 25000,
      lineWidthUnits: 'meters',
      lineWidthMinPixels: 2,
      pickable: false,
    }),
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DeckOverlay = forwardRef(function DeckOverlay(
  { visible, cesiumViewer },
  ref,
) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const deckRef = useRef(null);
  const iceDataRef = useRef(null);
  const bergDataRef = useRef(null);
  const dangerGeoRef = useRef(null);
  const realBergDataRef = useRef(null);
  const postRenderListenerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(visible);

  // Keep isVisible in sync with the visible prop
  useEffect(() => {
    setIsVisible(visible);
  }, [visible]);

  // ----- Generate static data once -----
  useEffect(() => {
    iceDataRef.current = generateIceData();
    bergDataRef.current = generateBergData();
    dangerGeoRef.current = buildDangerZonesGeoJSON();
  }, []);

  // ----- Sync deck.gl viewState with Cesium camera -----
  const syncDeckView = useCallback(() => {
    const deckInstance = deckRef.current;
    const viewer = cesiumViewer;
    if (!deckInstance || !viewer) return;

    const cam = viewer.camera;
    const carto = CesiumLib.Cartographic.fromCartesian(cam.position);
    const lon = CesiumLib.Math.toDegrees(carto.longitude);
    const lat = CesiumLib.Math.toDegrees(carto.latitude);
    const alt = carto.height;
    const zoom = Math.log2(40000000 / Math.max(alt, 1));
    const heading = CesiumLib.Math.toDegrees(cam.heading);
    const pitchDeg = CesiumLib.Math.toDegrees(cam.pitch);

    deckInstance.setProps({
      viewState: {
        longitude: lon,
        latitude: lat,
        zoom: Math.max(0, Math.min(22, zoom)),
        bearing: heading,
        pitch: Math.max(0, Math.min(85, 90 + pitchDeg)),
      },
      layers: buildLayers(
        iceDataRef.current,
        bergDataRef.current,
        dangerGeoRef.current,
        realBergDataRef.current,
      ),
    });
  }, [cesiumViewer]);

  // ----- Initialise deck.gl instance -----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size the canvas to fill the container
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (deckRef.current) deckRef.current.redraw(true);
    };
    window.addEventListener('resize', handleResize);

    const deckInstance = new Deck({
      canvas,
      controller: false,
      _customRender: () => {},
      useDevicePixels: true,
      _animate: false,
      glOptions: { alpha: true, premultipliedAlpha: true },
      getCursor: () => 'default',
      initialViewState: {
        longitude: 100,
        latitude: 75,
        zoom: 3,
        bearing: 0,
        pitch: 0,
      },
      layers: [],
    });

    deckRef.current = deckInstance;

    // Hook into Cesium postRender for continuous sync
    if (cesiumViewer) {
      postRenderListenerRef.current = syncDeckView;
      cesiumViewer.scene.postRender.addEventListener(syncDeckView);
    }

    return () => {
      // Cleanup
      window.removeEventListener('resize', handleResize);

      if (cesiumViewer && postRenderListenerRef.current) {
        try {
          cesiumViewer.scene.postRender.removeEventListener(
            postRenderListenerRef.current,
          );
        } catch (_) {
          /* viewer may already be destroyed */
        }
      }

      if (deckRef.current) {
        deckRef.current.finalize();
        deckRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cesiumViewer]);

  // ----- Show / hide based on isVisible -----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.style.display = isVisible ? 'block' : 'none';

    if (!isVisible && deckRef.current) {
      deckRef.current.setProps({ layers: [] });
    } else if (isVisible && deckRef.current) {
      // Restore layers when becoming visible
      deckRef.current.setProps({
        layers: buildLayers(
          iceDataRef.current,
          bergDataRef.current,
          dangerGeoRef.current,
          realBergDataRef.current,
        ),
      });
    }
  }, [isVisible]);

  // ----- Imperative handle for parent usage -----
  useImperativeHandle(
    ref,
    () => ({
      /** Show or hide the deck.gl overlay */
      setVisible(v) {
        setIsVisible(v);
      },

      /**
       * Manually sync deck.gl viewState from external Cesium camera.
       * Typically called by parent on each animation frame.
       * @param {{ longitude: number, latitude: number, height: number, heading: number, pitch: number }} camPos
       */
      syncView(camPos) {
        const deckInstance = deckRef.current;
        if (!deckInstance) return;

        if (camPos) {
          const { longitude, latitude, height, heading, pitch } = camPos;
          const zoom = Math.log2(40000000 / Math.max(height, 1));
          deckInstance.setProps({
            viewState: {
              longitude,
              latitude,
              zoom: Math.max(0, Math.min(22, zoom)),
              bearing: heading,
              pitch: Math.max(0, Math.min(85, 90 + pitch)),
            },
            layers: buildLayers(
              iceDataRef.current,
              bergDataRef.current,
              dangerGeoRef.current,
              realBergDataRef.current,
            ),
          });
        } else {
          // No explicit camera -- fall back to Cesium-based sync
          syncDeckView();
        }
      },

      /**
       * Replace layer data on the fly (e.g. after loading real ice data).
       * @param {{ iceData?: Array, bergData?: Array, dangerGeoJSON?: object }} nextData
       */
      updateLayers(nextData = {}) {
        if (nextData.iceData) iceDataRef.current = nextData.iceData;
        if (nextData.bergData) bergDataRef.current = nextData.bergData;
        if (nextData.dangerGeoJSON)
          dangerGeoRef.current = nextData.dangerGeoJSON;
        if (nextData.realBergData !== undefined)
          realBergDataRef.current = nextData.realBergData;

        if (deckRef.current && isVisible) {
          deckRef.current.setProps({
            layers: buildLayers(
              iceDataRef.current,
              bergDataRef.current,
              dangerGeoRef.current,
              realBergDataRef.current,
            ),
          });
        }
      },
    }),
    [isVisible, syncDeckView],
  );

  return (
    <div
      ref={containerRef}
      id="deck-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 3,
        pointerEvents: 'none',
        display: visible ? 'block' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: visible ? 'block' : 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});

export default DeckOverlay;
