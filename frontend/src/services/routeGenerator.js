/**
 * routeGenerator.js
 *
 * 동적 경로 생성 서비스
 * - 기본(부산→로테르담): 하드코딩된 검증 경로 사용
 * - 역방향(로테르담→부산): reverseRoute() 적용
 * - 기타 항구 조합: 방향 감지 후 스마트 회랑 스플라이스
 * - 북극 구간: A* 격자 최적화 (해빙 회피)
 */

import { ROUTES, ROUTE_CORRIDOR } from '../data/arcticRoutes';
import { findArcticPath, initLandMask } from './arcticPathfinder';

// ── 포트 분류 ──────────────────────────────────────────────────────────
const EUROPEAN_PORTS = new Set(['ROTTERDAM', 'HAMBURG', 'LONDON', 'MURMANSK']);
const ASIAN_PORTS    = new Set(['BUSAN', 'INCHEON', 'SHANGHAI', 'TOKYO', 'VLADIVOSTOK']);

function isDefaultRoute(depId, arrId) {
  return depId === 'BUSAN' && arrId === 'ROTTERDAM';
}

function isExactReverse(depId, arrId) {
  return depId === 'ROTTERDAM' && arrId === 'BUSAN';
}

/**
 * 유럽→아시아 방향인지 감지 (역방향 스플라이스가 필요한 경우)
 */
function isReverseDirection(depId, arrId) {
  return EUROPEAN_PORTS.has(depId) && ASIAN_PORTS.has(arrId);
}

function isSameRegion(depId, arrId) {
  return (ASIAN_PORTS.has(depId) && ASIAN_PORTS.has(arrId)) ||
         (EUROPEAN_PORTS.has(depId) && EUROPEAN_PORTS.has(arrId));
}

// ── 랜드마스크 초기화 ─────────────────────────────────────────────────
let landMaskInitialized = false;

async function ensureLandMask() {
  if (!landMaskInitialized) {
    await initLandMask();
    landMaskInitialized = true;
  }
}

/**
 * 공통 회랑만 추출하여 새 출발/도착항으로 연결.
 * 항구 비특이적 구간(소야해협~북해 입구 등)만 유지하고
 * 양 끝은 Cesium GEODESIC 호로 자연스럽게 연결됨.
 */
function spliceRouteForPorts(baseWaypoints, depPort, arrPort, startIdx, endIdx) {
  const departure = { lon: depPort.lon, lat: depPort.lat, label: depPort.name };
  const arrival   = { lon: arrPort.lon, lat: arrPort.lat, label: arrPort.name };
  const corridor  = baseWaypoints.slice(startIdx, endIdx + 1);
  return [departure, ...corridor, arrival];
}

/**
 * 메인 경로 생성 함수.
 *
 * @param {Object} depPort - 출발항 { id, lon, lat, name }
 * @param {Object} arrPort - 도착항 { id, lon, lat, name }
 * @param {string} routeType - 'NSR' | 'NWP' | 'TSR' | 'SUEZ' | 'CAPE'
 * @param {Object|null} iceData - 해빙 농도 데이터 { cells: [...] }
 * @param {Array} icebergs - 빙산 위치 배열 [{ lat, lon, length_m }]
 * @param {number} maxSafeConcentration - 선박 등급별 최대 통과 가능 농도
 * @returns {Promise<Array>} 웨이포인트 배열 [{lon, lat, label}, ...]
 */
export async function generateRoute(
  depPort,
  arrPort,
  routeType,
  iceData = null,
  icebergs = [],
  maxSafeConcentration = 0.7
) {
  const baseRoute = ROUTES[routeType] || ROUTES.NSR;
  const corridor  = ROUTE_CORRIDOR[routeType] || ROUTE_CORRIDOR.NSR;
  const n = baseRoute.length;

  // 1. 기본 경로 (부산→로테르담) — 검증된 하드코딩 경로 사용
  if (isDefaultRoute(depPort.id, arrPort.id)) {
    if (icebergs.length > 0 && iceData) {
      return optimizeArcticSegment(baseRoute, iceData, icebergs, maxSafeConcentration);
    }
    return baseRoute;
  }

  // 2. 정확한 역방향 (로테르담→부산) — 전체 경로 역전
  if (isExactReverse(depPort.id, arrPort.id)) {
    const reversed = reverseRoute(baseRoute);
    if (icebergs.length > 0 && iceData) {
      return optimizeArcticSegment(reversed, iceData, icebergs, maxSafeConcentration);
    }
    return reversed;
  }

  // 2.5. 동일 지역 항구 (아시아↔아시아, 유럽↔유럽) — 직항 geodesic 경로
  if (isSameRegion(depPort.id, arrPort.id)) {
    return [
      { lon: depPort.lon, lat: depPort.lat, label: depPort.name },
      { lon: arrPort.lon, lat: arrPort.lat, label: arrPort.name },
    ];
  }

  // 3. 기타 항구 조합 — 방향 감지 후 스마트 회랑 스플라이스
  const useReverse = isReverseDirection(depPort.id, arrPort.id);
  const directedRoute = useReverse ? reverseRoute(baseRoute) : baseRoute;

  // 역방향의 경우 회랑 인덱스도 역전
  const startIdx = useReverse ? (n - 1 - corridor.endIdx)   : corridor.startIdx;
  const endIdx   = useReverse ? (n - 1 - corridor.startIdx) : corridor.endIdx;

  let waypoints = spliceRouteForPorts(directedRoute, depPort, arrPort, startIdx, endIdx);

  // 4. 북극 경로 A* 최적화
  if (['NSR', 'NWP', 'TSR'].includes(routeType) && iceData) {
    waypoints = await optimizeArcticSegment(waypoints, iceData, icebergs, maxSafeConcentration);
  }

  return waypoints;
}

/**
 * 북극 구간(lat >= 65)에 대해 A* 경로탐색으로 최적화.
 * 해빙 농도 + 빙산 장애물을 고려한 최적 경로를 계산.
 */
async function optimizeArcticSegment(waypoints, iceData, icebergs, maxSafeConcentration) {
  await ensureLandMask();

  const { entryIdx, exitIdx } = extractArcticSegment(waypoints);
  if (entryIdx === -1 || exitIdx === -1 || entryIdx >= exitIdx) {
    return waypoints;
  }

  const entryWp = waypoints[entryIdx];
  const exitWp  = waypoints[exitIdx];

  const arcticPath = findArcticPath(
    entryWp.lon, entryWp.lat,
    exitWp.lon,  exitWp.lat,
    iceData,
    maxSafeConcentration,
    icebergs
  );

  if (!arcticPath) {
    console.warn('[routeGenerator] A* 경로 탐색 실패 — 기존 경로 유지');
    return waypoints;
  }

  const arcticWaypoints = arcticPath.map((p, i) => ({
    lon: p[0],
    lat: p[1],
    label: i === 0 ? '북극 진입' : i === arcticPath.length - 1 ? '북극 이탈' : `북극 경유 ${i}`,
  }));

  const before = waypoints.slice(0, entryIdx);
  const after  = waypoints.slice(exitIdx + 1);
  return [...before, ...arcticWaypoints, ...after];
}

/**
 * 기존 경로에서 북극 구간(lat >= 65)의 진입/이탈 인덱스를 추출.
 */
function extractArcticSegment(waypoints) {
  const ARCTIC_LAT = 65;
  let entryIdx = -1;
  let exitIdx  = -1;

  for (let i = 0; i < waypoints.length; i++) {
    if (waypoints[i].lat >= ARCTIC_LAT && entryIdx === -1) {
      entryIdx = Math.max(0, i - 1);
    }
    if (entryIdx !== -1 && waypoints[i].lat >= ARCTIC_LAT) {
      exitIdx = Math.min(waypoints.length - 1, i + 1);
    }
  }

  return { entryIdx, exitIdx };
}

/**
 * 경로를 역방향으로 변환 (예: 로테르담 → 부산).
 */
export function reverseRoute(waypoints) {
  return waypoints.slice().reverse().map((wp) => ({ ...wp }));
}
