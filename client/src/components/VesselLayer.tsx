import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';
import { MOCK_VESSELS } from '../data/vesselTypes';
import { ARCTIC_ROUTES } from '../data/arcticRoutes';
import { getIceDataset, sampleConcentration } from '../data/mockIceData';
import { Alert, FeasibilityRating, Vessel } from '../types';

// Generate a colored circle PNG as a data URI using an offscreen canvas
function createVesselIcon(colorHex: string, size = 32): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;

  // Outer glow
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = colorHex + 'aa';
  ctx.fill();

  // Core circle
  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();

  // White border
  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL();
}

// Interpolate between two waypoints
function interpolate(
  from: [number, number],
  to: [number, number],
  t: number
): [number, number] {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

function segmentRating(concentration: number, maxSafe: number): FeasibilityRating {
  const margin = maxSafe - concentration;
  if (margin >= 0.2) return 'safe';
  if (margin >= 0) return 'caution';
  if (margin >= -0.15) return 'dangerous';
  return 'impossible';
}

function ratingColor(rating: FeasibilityRating): Cesium.Color {
  switch (rating) {
    case 'safe': return Cesium.Color.LIME.withAlpha(0.85);
    case 'caution': return Cesium.Color.YELLOW.withAlpha(0.85);
    case 'dangerous': return Cesium.Color.ORANGE.withAlpha(0.85);
    case 'impossible': return Cesium.Color.RED.withAlpha(0.85);
  }
}

export default function VesselLayer() {
  const { state, dispatch, viewerRef } = useAppContext();
  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const routeSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const vesselsRef = useRef<Vessel[]>(MOCK_VESSELS.map((v) => ({ ...v })));
  const iconCacheRef = useRef<Record<string, string>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertCooldownRef = useRef<Record<string, number>>({});

  // Initialize data sources
  useEffect(() => {
    const checkViewer = setInterval(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      clearInterval(checkViewer);
      const viewer = viewerRef.current;

      const ds = new Cesium.CustomDataSource('vessels');
      const rs = new Cesium.CustomDataSource('routes');
      viewer.dataSources.add(ds);
      viewer.dataSources.add(rs);
      dataSourceRef.current = ds;
      routeSourceRef.current = rs;

      // Click handler for vessel selection
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(click.position);
        if (Cesium.defined(picked) && picked.id) {
          const entity = picked.id as Cesium.Entity;
          if (entity.name?.startsWith('vessel:')) {
            const id = entity.name.split(':')[1];
            dispatch({ type: 'SELECT_VESSEL', id });
          } else {
            dispatch({ type: 'SELECT_VESSEL', id: null });
          }
        } else {
          dispatch({ type: 'SELECT_VESSEL', id: null });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }, 300);

    return () => {
      clearInterval(checkViewer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        if (dataSourceRef.current) viewer.dataSources.remove(dataSourceRef.current, true);
        if (routeSourceRef.current) viewer.dataSources.remove(routeSourceRef.current, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render active route lines
  useEffect(() => {
    const rs = routeSourceRef.current;
    if (!rs) return;
    rs.entities.removeAll();

    if (!state.layerVisibility.routes || !state.activeRoute) return;

    const route = ARCTIC_ROUTES.find((r) => r.id === state.activeRoute);
    if (!route) return;

    const dataset = getIceDataset(state.currentMonth);

    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const from = route.waypoints[i];
      const to = route.waypoints[i + 1];
      const midLon = (from.lon + to.lon) / 2;
      const midLat = (from.lat + to.lat) / 2;
      const conc = sampleConcentration(dataset, midLon, midLat);
      const maxSafe = state.vesselProfile.maxSafeConcentration;
      const rating = segmentRating(conc, maxSafe);

      rs.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            from.lon, from.lat,
            to.lon,   to.lat,
          ]),
          width: 4,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: ratingColor(rating),
          }),
          clampToGround: false,
        },
      });
    }

    // Waypoint labels
    for (const wp of route.waypoints) {
      if (!wp.label) continue;
      rs.entities.add({
        position: Cesium.Cartesian3.fromDegrees(wp.lon, wp.lat, 50000),
        label: {
          text: wp.label,
          font: '11px sans-serif',
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -15),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          scaleByDistance: new Cesium.NearFarScalar(1e5, 1.0, 3e6, 0.4),
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeRoute, state.currentMonth, state.layerVisibility.routes, state.vesselProfile.maxSafeConcentration]);

  // Vessel animation loop
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const TICK_MS = 600;
    const SPEED_FACTOR = 0.003 * state.animationSpeed;

    intervalRef.current = setInterval(() => {
      const ds = dataSourceRef.current;
      if (!ds || !viewerRef.current || viewerRef.current.isDestroyed()) return;
      if (!state.layerVisibility.vessels) {
        ds.entities.removeAll();
        return;
      }

      const dataset = getIceDataset(state.currentMonth);
      ds.entities.removeAll();

      const vessels = vesselsRef.current;
      for (const vessel of vessels) {
        if (vessel.speedKnots === 0) {
          // Stationary vessel — just render at fixed position
        } else {
          // Move toward next waypoint
          const nextIdx = Math.min(vessel.currentWaypointIndex + 1, vessel.waypoints.length - 1);
          const [cLon, cLat] = vessel.position;
          const [tLon, tLat] = vessel.waypoints[nextIdx];

          const dLon = tLon - cLon;
          const dLat = tLat - cLat;
          const dist = Math.sqrt(dLon * dLon + dLat * dLat);

          if (dist < 0.1) {
            // Reached waypoint — advance
            vessel.currentWaypointIndex = (nextIdx + 1) % vessel.waypoints.length;
          } else {
            const step = SPEED_FACTOR;
            const [nLon, nLat] = interpolate(vessel.position, vessel.waypoints[nextIdx], Math.min(step / dist, 1));
            vessel.position = [nLon, nLat];
            vessel.heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
          }
        }

        // Ice safety check — alert if concentration exceeds vessel capability
        const conc = sampleConcentration(dataset, vessel.position[0], vessel.position[1]);
        const now = Date.now();
        const lastAlert = alertCooldownRef.current[vessel.id] ?? 0;

        if (conc > vessel.maxSafeConcentration && now - lastAlert > 15000) {
          alertCooldownRef.current[vessel.id] = now;
          const severity = conc > vessel.maxSafeConcentration + 0.15 ? 'critical' : 'warning';
          const alert: Alert = {
            id: `${vessel.id}-${now}`,
            vesselId: vessel.id,
            vesselName: vessel.name,
            message: `해빙 농도 ${(conc * 100).toFixed(0)}% — 허용 한계(${(vessel.maxSafeConcentration * 100).toFixed(0)}%) 초과`,
            severity,
            timestamp: now,
            dismissed: false,
          };
          dispatch({ type: 'ADD_ALERT', alert });
        }

        // Get or create icon
        if (!iconCacheRef.current[vessel.colorHex]) {
          iconCacheRef.current[vessel.colorHex] = createVesselIcon(vessel.colorHex);
        }

        const isSelected = state.selectedVesselId === vessel.id;

        ds.entities.add({
          name: `vessel:${vessel.id}`,
          position: Cesium.Cartesian3.fromDegrees(vessel.position[0], vessel.position[1], 10000),
          billboard: {
            image: iconCacheRef.current[vessel.colorHex],
            width: isSelected ? 40 : 28,
            height: isSelected ? 40 : 28,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1e5, 1.5, 5e6, 0.6),
          },
          label: {
            text: vessel.name,
            font: isSelected ? 'bold 13px sans-serif' : '11px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -28),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1e5, 1.0, 4e6, 0.3),
          },
        });
      }
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.layerVisibility.vessels, state.currentMonth, state.animationSpeed, state.selectedVesselId]);

  return null;
}
