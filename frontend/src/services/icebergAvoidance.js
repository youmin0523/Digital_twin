/**
 * icebergAvoidance.js
 *
 * 실시간 빙산 회피 서비스.
 * 시뮬레이션 중 전방 경로를 모니터링하여 빙산과의 충돌 위험을 감지하고,
 * A* 경로탐색기를 통해 국소 우회 경로를 자동 계산합니다.
 */

import { findArcticPath, initLandMask } from './arcticPathfinder';

const DEG_TO_KM = 111.32; // 위도 1도 ≈ 111.32km

/**
 * 두 지점 간 대략적인 거리 (km) — Equirectangular 근사
 */
function approxDistKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const dLon = (lon2 - lon1) * DEG_TO_KM * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * 전방 경로에서 빙산과의 충돌 위험을 검사.
 *
 * @param {Array} waypoints - 현재 경로 웨이포인트 [{lon, lat, label}, ...]
 * @param {number} currentSegIdx - 현재 구간 인덱스 (routePos에서 반환된 seg)
 * @param {Array} icebergPositions - 빙산 위치 배열 [{lat, lon, length_m}]
 * @param {number} safetyRadiusKm - 안전 반경 (km, 기본 10km)
 * @param {number} lookAheadCount - 전방 확인 웨이포인트 수 (기본 10)
 * @returns {{ blocked: boolean, dangerIdx: number, dangerBerg: Object|null }}
 */
export function checkRouteAhead(
  waypoints,
  currentSegIdx,
  icebergPositions,
  safetyRadiusKm = 10,
  lookAheadCount = 10
) {
  if (!icebergPositions || icebergPositions.length === 0) {
    return { blocked: false, dangerIdx: -1, dangerBerg: null };
  }

  const startIdx = Math.max(0, currentSegIdx);
  const endIdx = Math.min(waypoints.length, startIdx + lookAheadCount);

  for (let i = startIdx; i < endIdx; i++) {
    const wp = waypoints[i];
    for (const berg of icebergPositions) {
      const dist = approxDistKm(wp.lat, wp.lon, berg.lat, berg.lon);
      if (dist < safetyRadiusKm) {
        return { blocked: true, dangerIdx: i, dangerBerg: berg };
      }
    }
  }

  return { blocked: false, dangerIdx: -1, dangerBerg: null };
}

/**
 * 빙산 충돌 위험 감지 시 국소 우회 경로를 계산.
 * 위험 구간의 앞뒤 웨이포인트 사이에서 A*를 실행하여 우회 경로를 생성.
 *
 * @param {Array} waypoints - 현재 경로 웨이포인트
 * @param {number} dangerIdx - 위험 웨이포인트 인덱스
 * @param {Object} iceData - 해빙 농도 데이터
 * @param {Array} icebergPositions - 빙산 위치 배열
 * @param {number} maxSafeConcentration - 선박 등급별 최대 통과 가능 농도
 * @returns {Promise<{rerouted: boolean, newWaypoints: Array}>}
 */
export async function rerouteAroundIceberg(
  waypoints,
  dangerIdx,
  iceData,
  icebergPositions,
  maxSafeConcentration = 0.7
) {
  // 우회 구간 설정: 위험 지점 전후 5개 웨이포인트
  const margin = 5;
  const startIdx = Math.max(0, dangerIdx - margin);
  const endIdx = Math.min(waypoints.length - 1, dangerIdx + margin);

  const startWp = waypoints[startIdx];
  const endWp = waypoints[endIdx];

  // 북극 구간(65°N 이상)이 아니면 우회 불가
  if (startWp.lat < 65 && endWp.lat < 65) {
    return { rerouted: false, newWaypoints: waypoints };
  }

  // A* 경로 탐색 (빙산을 장애물로 포함)
  const detour = findArcticPath(
    startWp.lon, startWp.lat,
    endWp.lon, endWp.lat,
    iceData,
    maxSafeConcentration,
    icebergPositions
  );

  if (!detour) {
    console.warn('[icebergAvoidance] 우회 경로 탐색 실패');
    return { rerouted: false, newWaypoints: waypoints };
  }

  // A* 결과를 웨이포인트 형식으로 변환
  const detourWaypoints = detour.map((p, i) => ({
    lon: p[0],
    lat: p[1],
    label: `우회 ${i + 1}`,
  }));

  // 기존 경로에 우회 구간 splice
  const before = waypoints.slice(0, startIdx);
  const after = waypoints.slice(endIdx + 1);
  const newWaypoints = [...before, ...detourWaypoints, ...after];

  console.log(`[icebergAvoidance] 우회 경로 생성 완료: ${detourWaypoints.length}개 웨이포인트`);

  return { rerouted: true, newWaypoints };
}
