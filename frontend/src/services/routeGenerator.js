/**
 * routeGenerator.js
 *
 * 동적 경로 생성 서비스 — 3단계 하이브리드 아키텍처
 * Tier 1: Searoute.js (전 구간 해양 기본 경로)
 * Tier 2: A* 격자 최적화 (북극 구간 해빙 회피)
 * Tier 3: 빙산 장애물 회피 (icebergAvoidance.js에서 처리)
 */

import { ROUTES } from '../data/arcticRoutes';
import { findArcticPath, initLandMask } from './arcticPathfinder';

// Searoute는 CommonJS 모듈이므로 동적 import 사용
let searouteModule = null;

async function getSearoute() {
  if (!searouteModule) {
    try {
      const mod = await import('searoute-js');
      searouteModule = mod.default || mod;
    } catch (e) {
      console.warn('[routeGenerator] searoute-js 로드 실패:', e);
      searouteModule = null;
    }
  }
  return searouteModule;
}

// 랜드마스크 초기화 상태
let landMaskInitialized = false;

async function ensureLandMask() {
  if (!landMaskInitialized) {
    await initLandMask();
    landMaskInitialized = true;
  }
}

/**
 * 두 항구가 기존 하드코딩된 부산-로테르담 경로와 동일한지 확인
 */
function isDefaultRoute(departureId, arrivalId) {
  return departureId === 'BUSAN' && arrivalId === 'ROTTERDAM';
}

/**
 * Searoute를 사용하여 기본 해양 경로를 생성.
 * GeoJSON 결과를 [{lon, lat, label}, ...] 형식으로 변환.
 */
async function generateBaseRoute(depPort, arrPort) {
  const searoute = await getSearoute();
  if (!searoute) return null;

  try {
    const origin = [depPort.lon, depPort.lat];
    const destination = [arrPort.lon, arrPort.lat];
    const route = searoute(origin, destination);

    if (!route || !route.geometry || !route.geometry.coordinates) {
      console.warn('[routeGenerator] Searoute 경로 생성 실패');
      return null;
    }

    const coords = route.geometry.coordinates;
    return coords.map((coord, i) => ({
      lon: coord[0],
      lat: coord[1],
      label: i === 0 ? depPort.name
           : i === coords.length - 1 ? arrPort.name
           : `경유점 ${i}`,
    }));
  } catch (e) {
    console.warn('[routeGenerator] Searoute 오류:', e);
    return null;
  }
}

/**
 * 기존 하드코딩된 경로에서 북극 구간(lat >= 65)의 진입/이탈 지점을 추출.
 * 이를 통해 A* 최적화를 적용할 구간을 식별.
 */
function extractArcticSegment(waypoints) {
  const ARCTIC_LAT = 65;
  let entryIdx = -1;
  let exitIdx = -1;

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
 * 기존 경로의 출발/도착 구간을 새 항구로 교체.
 * 기존 5개 경로(NSR/NWP/TSR/SUEZ/CAPE)를 corridor로 활용.
 */
function spliceRouteForPorts(baseWaypoints, depPort, arrPort) {
  if (!baseWaypoints || baseWaypoints.length < 2) return baseWaypoints;

  const result = [...baseWaypoints];

  // 출발점을 새 항구로 교체
  result[0] = { lon: depPort.lon, lat: depPort.lat, label: depPort.name };

  // 도착점을 새 항구로 교체
  result[result.length - 1] = { lon: arrPort.lon, lat: arrPort.lat, label: arrPort.name };

  return result;
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
  // 1. 기본 경로가 부산-로테르담이면 기존 하드코딩 경로 사용 (검증된 폴백)
  if (isDefaultRoute(depPort.id, arrPort.id)) {
    const defaultRoute = ROUTES[routeType] || ROUTES.NSR;
    // 북극 구간에 빙산이 있다면 A*로 최적화 시도
    if (icebergs.length > 0 && iceData) {
      return await optimizeArcticSegment(defaultRoute, iceData, icebergs, maxSafeConcentration);
    }
    return defaultRoute;
  }

  // 2. 새 항구 쌍: 기존 경로를 corridor로 활용하여 출발/도착만 교체
  const corridorRoute = ROUTES[routeType] || ROUTES.NSR;
  let waypoints = spliceRouteForPorts(corridorRoute, depPort, arrPort);

  // 3. Searoute로 전체 경로 생성 시도
  const searouteWps = await generateBaseRoute(depPort, arrPort);
  if (searouteWps && searouteWps.length > 2) {
    // Searoute 결과가 있으면 사용, 없으면 corridor 사용
    waypoints = searouteWps;
  }

  // 4. 북극 경로(NSR/NWP/TSR)이면 A* 최적화 적용
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
    return waypoints; // 북극 구간 없음
  }

  const entryWp = waypoints[entryIdx];
  const exitWp = waypoints[exitIdx];

  // A* 경로 탐색
  const arcticPath = findArcticPath(
    entryWp.lon, entryWp.lat,
    exitWp.lon, exitWp.lat,
    iceData,
    maxSafeConcentration,
    icebergs
  );

  if (!arcticPath) {
    console.warn('[routeGenerator] A* 경로 탐색 실패 — 기존 경로 유지');
    return waypoints;
  }

  // A* 결과를 웨이포인트 형식으로 변환
  const arcticWaypoints = arcticPath.map((p, i) => ({
    lon: p[0],
    lat: p[1],
    label: i === 0 ? '북극 진입' : i === arcticPath.length - 1 ? '북극 이탈' : `북극 경유 ${i}`,
  }));

  // 기존 경로의 비-북극 구간 + A* 최적화된 북극 구간을 결합
  const before = waypoints.slice(0, entryIdx);
  const after = waypoints.slice(exitIdx + 1);

  return [...before, ...arcticWaypoints, ...after];
}

/**
 * 경로를 역방향으로 변환 (예: 로테르담 → 부산).
 */
export function reverseRoute(waypoints) {
  return waypoints.slice().reverse().map((wp, i, arr) => ({
    ...wp,
    label: i === 0 ? wp.label
         : i === arr.length - 1 ? wp.label
         : wp.label,
  }));
}
