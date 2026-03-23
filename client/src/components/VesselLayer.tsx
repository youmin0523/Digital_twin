import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import { useAppContext } from '../context/AppContext';
import { MOCK_VESSELS } from '../data/vesselTypes';
import { ARCTIC_ROUTES } from '../data/arcticRoutes';
import { sampleConcentration } from '../data/mockIceData';
import { findArcticPath, isPathAheadBlocked } from '../services/arcticPathfinder';
import { Alert, FeasibilityRating, Vessel } from '../types';

// ─── 선박 아이콘 생성 ────────────────────────────────────────────────────────

function createVesselIcon(colorHex: string, size = 32): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;

  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = colorHex + 'aa';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(r, r, r - 6, 0, Math.PI * 2);
  ctx.fillStyle = colorHex;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(r, r, r - 2, 0, Math.PI * 2);
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL();
}

// ─── 대권항로(Geodesic) 보간 ─────────────────────────────────────────────────

/**
 * 두 지점 사이를 구면 대권(Great Circle) 경로로 보간.
 * 평면 위경도 선형보간 대신 Cesium.EllipsoidGeodesic 사용.
 */
function interpolateGeodesic(
  from: [number, number],
  to: [number, number],
  t: number
): [number, number] {
  const geodesic = new Cesium.EllipsoidGeodesic(
    Cesium.Cartographic.fromDegrees(from[0], from[1]),
    Cesium.Cartographic.fromDegrees(to[0], to[1])
  );
  const interp = geodesic.interpolateUsingFraction(Math.min(Math.max(t, 0), 1));
  return [
    Cesium.Math.toDegrees(interp.longitude),
    Cesium.Math.toDegrees(interp.latitude),
  ];
}

// ─── 경로 세그먼트 평가 ──────────────────────────────────────────────────────

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

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function VesselLayer() {
  const { state, dispatch, viewerRef, iceDataRef } = useAppContext();
  const dataSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const routeSourceRef = useRef<Cesium.CustomDataSource | null>(null);
  const pathSourceRef = useRef<Cesium.CustomDataSource | null>(null); // A* 계산 경로 표시용
  const vesselsRef = useRef<Vessel[]>(MOCK_VESSELS.map((v) => ({ ...v })));
  const iconCacheRef = useRef<Record<string, string>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const alertCooldownRef = useRef<Record<string, number>>({});
  const tickCountRef = useRef<Record<string, number>>({}); // 선박별 틱 카운터

  // ── Viewer 초기화 및 데이터 소스 등록
  useEffect(() => {
    const checkViewer = setInterval(() => {
      if (!viewerRef.current || viewerRef.current.isDestroyed()) return;
      clearInterval(checkViewer);
      const viewer = viewerRef.current;

      const ds = new Cesium.CustomDataSource('vessels');
      const rs = new Cesium.CustomDataSource('routes');
      const ps = new Cesium.CustomDataSource('computed-paths');
      viewer.dataSources.add(ds);
      viewer.dataSources.add(rs);
      viewer.dataSources.add(ps);
      dataSourceRef.current = ds;
      routeSourceRef.current = rs;
      pathSourceRef.current = ps;

      // 선박 클릭 선택
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const picked = viewer.scene.pick(click.position);
        if (Cesium.defined(picked) && picked.id) {
          const entity = picked.id as Cesium.Entity;
          if (entity.name?.startsWith('vessel:')) {
            dispatch({ type: 'SELECT_VESSEL', id: entity.name.split(':')[1] });
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
        if (pathSourceRef.current) viewer.dataSources.remove(pathSourceRef.current, true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 활성 경로(정적) 렌더링 — 대권항로(GEODESIC) 표시
  useEffect(() => {
    const rs = routeSourceRef.current;
    if (!rs) return;
    rs.entities.removeAll();

    if (!state.layerVisibility.routes || !state.activeRoute) return;

    const route = ARCTIC_ROUTES.find((r) => r.id === state.activeRoute);
    if (!route) return;

    const dataset = iceDataRef.current[state.currentMonth];
    if (!dataset) return;

    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const from = route.waypoints[i];
      const to = route.waypoints[i + 1];
      const midLon = (from.lon + to.lon) / 2;
      const midLat = (from.lat + to.lat) / 2;
      const conc = sampleConcentration(dataset, midLon, midLat);
      const rating = segmentRating(conc, state.vesselProfile.maxSafeConcentration);

      rs.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            from.lon, from.lat,
            to.lon,   to.lat,
          ]),
          width: 4,
          arcType: Cesium.ArcType.GEODESIC, // 지구본 위에서 대권 곡선으로 표시
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: ratingColor(rating),
          }),
          clampToGround: false,
        },
      });
    }

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

  // ── 월 변경 시 모든 선박 경로 재계산 트리거 (빙하 조건 변경)
  useEffect(() => {
    for (const vessel of vesselsRef.current) {
      if (vessel.speedKnots > 0) {
        vessel.routeNeedsRecalc = true;
        vessel.computedWaypoints = null;
        vessel.currentWaypointIndex = 0;
        // staticWaypointTargetIndex는 유지 — 현재 향하던 방향 그대로 계속
      }
    }
    // A* 계산 경로 초기화
    if (pathSourceRef.current) pathSourceRef.current.entities.removeAll();
  }, [state.currentMonth]);

  // ── 선박 애니메이션 루프 + A* 동적 경로 회피
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const TICK_MS = 600;
    const SPEED_FACTOR = 0.003 * state.animationSpeed;
    const REROUTE_CHECK_EVERY = 10; // 10틱(6초)마다 장애물 탐지

    intervalRef.current = setInterval(() => {
      const ds = dataSourceRef.current;
      const ps = pathSourceRef.current;
      if (!ds || !viewerRef.current || viewerRef.current.isDestroyed()) return;
      if (!state.layerVisibility.vessels) {
        ds.entities.removeAll();
        return;
      }

      const dataset = iceDataRef.current[state.currentMonth];
      if (!dataset) return;

      ds.entities.removeAll();
      if (ps) ps.entities.removeAll();

      const vessels = vesselsRef.current;

      for (const vessel of vessels) {
        // ── 1. 이동 처리
        if (vessel.speedKnots > 0) {
          // 틱 카운터 증가
          tickCountRef.current[vessel.id] = (tickCountRef.current[vessel.id] ?? 0) + 1;

          // ── 2. A* 경로 재계산 판단 (매 REROUTE_CHECK_EVERY 틱 또는 재계산 요청 시)
          const shouldCheck =
            vessel.routeNeedsRecalc ||
            tickCountRef.current[vessel.id] % REROUTE_CHECK_EVERY === 0;

          if (shouldCheck) {
            // ── 순차 웨이포인트: 마지막이 아닌 현재 순서의 목표 웨이포인트
            const targetGoal = vessel.waypoints[vessel.staticWaypointTargetIndex];

            // 전방 장애물 감지 또는 강제 재계산 플래그
            const blocked = vessel.routeNeedsRecalc || isPathAheadBlocked(vessel, dataset);

            if (blocked) {
              const newPath = findArcticPath(
                vessel.position[0], vessel.position[1],
                targetGoal[0], targetGoal[1],  // ← A* 목표: 현재 순서의 웨이포인트
                dataset,
                vessel.maxSafeConcentration
              );

              if (newPath && newPath.length > 1) {
                vessel.computedWaypoints = newPath;
                vessel.currentWaypointIndex = 0;
              } else if (!newPath) {
                // 경로 없음 — 경고 알림 (쿨다운 적용)
                const now = Date.now();
                const lastAlert = alertCooldownRef.current[`npath-${vessel.id}`] ?? 0;
                if (now - lastAlert > 30000) {
                  alertCooldownRef.current[`npath-${vessel.id}`] = now;
                  const alert: Alert = {
                    id: `${vessel.id}-npath-${now}`,
                    vesselId: vessel.id,
                    vesselName: vessel.name,
                    message: `경로 없음 — 현재 해빙 조건에서 목적지 도달 불가`,
                    severity: 'critical',
                    timestamp: now,
                    dismissed: false,
                  };
                  dispatch({ type: 'ADD_ALERT', alert });
                }
              }

              vessel.routeNeedsRecalc = false;
              vessel.lastRouteCalcMonth = dataset.month;
            }
          }

          // ── 3. 웨이포인트 이동 — computedWaypoints 우선, 없으면 정적 waypoints
          const activeWaypoints = vessel.computedWaypoints ?? vessel.waypoints;
          const nextIdx = Math.min(vessel.currentWaypointIndex + 1, activeWaypoints.length - 1);
          const [cLon, cLat] = vessel.position;
          const [tLon, tLat] = activeWaypoints[nextIdx];

          const dLon = tLon - cLon;
          const dLat = tLat - cLat;
          const dist = Math.sqrt(dLon * dLon + dLat * dLat);

          if (dist < 0.5) {
            // ── A* 계산 경로의 마지막 포인트(= 현재 정적 웨이포인트 목표) 도달
            if (nextIdx >= activeWaypoints.length - 1) {
              // 다음 정적 웨이포인트로 순환 이동
              vessel.staticWaypointTargetIndex =
                (vessel.staticWaypointTargetIndex + 1) % vessel.waypoints.length;
              vessel.computedWaypoints = null;
              vessel.currentWaypointIndex = 0;
              vessel.routeNeedsRecalc = true; // 다음 목표로 A* 재계산 요청
            } else {
              vessel.currentWaypointIndex = nextIdx + 1;
            }
          } else {
            // 대권항로(Geodesic) 보간으로 이동
            const [nLon, nLat] = interpolateGeodesic(
              vessel.position,
              activeWaypoints[nextIdx],
              Math.min(SPEED_FACTOR / dist, 1)
            );
            vessel.position = [nLon, nLat];
            vessel.heading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
          }
        }

        // ── 4. 해빙 안전 경고
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

        // ── 5. A* 계산 경로 시각화 (대권 곡선)
        if (ps && vessel.computedWaypoints && vessel.computedWaypoints.length > 1) {
          const pathPositions = vessel.computedWaypoints.flatMap(([lon, lat]) => [lon, lat]);
          ps.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(pathPositions),
              width: 2,
              arcType: Cesium.ArcType.GEODESIC,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.15,
                color: Cesium.Color.fromCssColorString(vessel.colorHex).withAlpha(0.7),
              }),
              clampToGround: false,
            },
          });
        }

        // ── 6. 선박 렌더링
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
