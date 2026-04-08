/**
 * smoothPathGenerator.js
 *
 * Catmull-Rom 스플라인 기반 부드러운 우회 경로 생성기.
 * RL 에이전트 또는 A*가 생성한 거친 웨이포인트를 부드러운 곡선으로 변환하고,
 * 기존 경로와 자연스럽게 연결합니다.
 */

import { slerpLonLat, buildTimings, routePos } from './shipSimulator';

const DEG_TO_KM = 111.32;

/**
 * 두 지점 간 대략적인 거리 (km)
 */
function approxDistKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const dLon = (lon2 - lon1) * DEG_TO_KM * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * Catmull-Rom 스플라인 보간.
 * 4개의 제어점 (P0, P1, P2, P3)과 파라미터 t (0~1)로
 * P1-P2 구간의 보간 위치를 계산합니다.
 *
 * @param {number} p0 - 이전 제어점
 * @param {number} p1 - 구간 시작점
 * @param {number} p2 - 구간 끝점
 * @param {number} p3 - 다음 제어점
 * @param {number} t  - 파라미터 (0~1)
 * @param {number} tension - 텐션 (0=균일, 0.5=centripetal, 1.0=chordal)
 * @returns {number} 보간된 값
 */
function catmullRom1D(p0, p1, p2, p3, t, tension = 0.5) {
  const t2 = t * t;
  const t3 = t2 * t;
  // Catmull-Rom 행렬 (tension 적용)
  const a = -tension * p0 + (2 - tension) * p1 + (tension - 2) * p2 + tension * p3;
  const b = 2 * tension * p0 + (tension - 3) * p1 + (3 - 2 * tension) * p2 - tension * p3;
  const c = -tension * p0 + tension * p2;
  const d = p1;
  return a * t3 + b * t2 + c * t + d;
}

/**
 * Catmull-Rom 스플라인으로 웨이포인트 시퀀스를 부드럽게 보간합니다.
 *
 * @param {Array<{lon: number, lat: number}>} points - 제어점 배열 (최소 2개)
 * @param {number} segmentSamples - 각 구간당 샘플 수 (기본 10)
 * @param {number} tension - 텐션 (기본 0.5 = centripetal, 자연스러운 곡선)
 * @returns {Array<{lon: number, lat: number, label: string}>} 보간된 웨이포인트 배열
 */
export function catmullRomSpline(points, segmentSamples = 10, tension = 0.5) {
  if (!points || points.length < 2) return points || [];
  if (points.length === 2) {
    // 2개면 중간점만 추가
    const mid = slerpLonLat(points[0], points[1], 0.5);
    return [
      { ...points[0], label: points[0].label || '우회 시작' },
      { lon: mid.lon, lat: mid.lat, label: '우회 중간' },
      { ...points[1], label: points[1].label || '우회 끝' },
    ];
  }

  const result = [];

  for (let i = 0; i < points.length - 1; i++) {
    // 4개의 제어점: P0, P1, P2, P3
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    for (let s = 0; s < segmentSamples; s++) {
      const t = s / segmentSamples;
      const lon = catmullRom1D(p0.lon, p1.lon, p2.lon, p3.lon, t, tension);
      const lat = catmullRom1D(p0.lat, p1.lat, p2.lat, p3.lat, t, tension);
      result.push({ lon, lat, label: `우회 ${result.length + 1}` });
    }
  }

  // 마지막 점 추가
  const last = points[points.length - 1];
  result.push({ lon: last.lon, lat: last.lat, label: last.label || `우회 ${result.length + 1}` });

  return result;
}

/**
 * 일정 거리 간격으로 경로를 리샘플링합니다.
 *
 * @param {Array<{lon: number, lat: number}>} points - 입력 경로
 * @param {number} intervalKm - 리샘플링 간격 (km, 기본 2)
 * @returns {Array<{lon: number, lat: number, label: string}>} 리샘플링된 경로
 */
export function resampleByDistance(points, intervalKm = 2) {
  if (!points || points.length < 2) return points || [];

  const result = [{ ...points[0], label: points[0].label || '우회 1' }];
  let accumulated = 0;
  let idx = 1;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const segDist = approxDistKm(prev.lat, prev.lon, curr.lat, curr.lon);

    if (segDist < 0.001) continue;

    let remaining = segDist;
    let fromPoint = prev;
    let startOffset = accumulated;

    while (accumulated + remaining >= intervalKm) {
      const fraction = (intervalKm - accumulated) / segDist;
      const t = (segDist - remaining + (intervalKm - accumulated)) / segDist;
      const interp = slerpLonLat(prev, curr, Math.min(1, Math.max(0, t)));
      result.push({ lon: interp.lon, lat: interp.lat, label: `우회 ${++idx}` });
      remaining -= (intervalKm - accumulated);
      accumulated = 0;
    }
    accumulated += remaining;
  }

  // 마지막 점 추가 (중복 방지)
  const last = points[points.length - 1];
  const prevResult = result[result.length - 1];
  if (approxDistKm(prevResult.lat, prevResult.lon, last.lat, last.lon) > 0.1) {
    result.push({ lon: last.lon, lat: last.lat, label: `우회 ${++idx}` });
  }

  return result;
}

/**
 * RL 또는 A* 우회 경로를 기존 경로에 부드럽게 병합합니다.
 *
 * 핵심 기능:
 * 1. 우회 경로를 Catmull-Rom 스플라인으로 부드럽게 변환
 * 2. 기존 경로와의 연결부를 자연스럽게 블렌딩
 * 3. 일정 거리 간격으로 리샘플링
 * 4. Progress 재매핑하여 선박 위치 점프 방지
 *
 * @param {Array} originalWps - 원래 경로 웨이포인트
 * @param {Array} detourWps - 우회 경로 웨이포인트 [{lon, lat}, ...]
 * @param {number} currentProgress - 현재 시뮬레이션 진행률 (0~1)
 * @param {number} insertStartIdx - 원래 경로에서 우회가 시작되는 인덱스
 * @param {number} insertEndIdx - 원래 경로에서 우회가 끝나는 인덱스
 * @param {Object} options - 옵션
 * @returns {{ newWaypoints: Array, newProgress: number }}
 */
export function mergeDetourSmooth(
  originalWps,
  detourWps,
  currentProgress,
  insertStartIdx,
  insertEndIdx,
  options = {},
) {
  const {
    splineSamples = 8,
    resampleKm = 2,
    tension = 0.5,
  } = options;

  // 1. 원래 경로의 연결점을 제어점으로 포함 (C1 연속성)
  const beforeIdx = Math.max(0, insertStartIdx - 1);
  const afterIdx = Math.min(originalWps.length - 1, insertEndIdx + 1);

  const controlPoints = [
    originalWps[beforeIdx],             // 이전 제어점
    originalWps[insertStartIdx],        // 시작 연결점
    ...detourWps,                        // 우회 경로
    originalWps[insertEndIdx],          // 끝 연결점
    originalWps[afterIdx],              // 다음 제어점
  ];

  // 2. Catmull-Rom 스플라인 보간
  const smoothDetour = catmullRomSpline(controlPoints, splineSamples, tension);

  // 3. 거리 기반 리샘플링
  const resampled = resampleByDistance(smoothDetour, resampleKm);

  // 4. 기존 경로와 병합
  const before = originalWps.slice(0, insertStartIdx);
  const after = originalWps.slice(insertEndIdx + 1);
  const newWaypoints = [...before, ...resampled, ...after];

  // 5. Progress 재매핑 (선박 위치 점프 방지)
  const oldTimings = buildTimings(originalWps);
  const newTimings = buildTimings(newWaypoints);
  const currentPos = routePos(currentProgress, oldTimings, originalWps);

  let bestNewProgress = currentProgress;
  let bestDist = Infinity;

  for (let i = 0; i < newTimings.length; i++) {
    const d = approxDistKm(currentPos.lat, currentPos.lon, newTimings[i].lat, newTimings[i].lon);
    if (d < bestDist) {
      bestDist = d;
      bestNewProgress = newTimings[i].t;
    }
  }

  return { newWaypoints, newProgress: bestNewProgress };
}

/**
 * RL 에이전트의 미래 위치 예측을 웨이포인트 시퀀스로 변환합니다.
 *
 * @param {Array<[number, number]>} projectedPositions - [(lon, lat), ...] RL 예측 위치
 * @param {Object} startWp - 시작 웨이포인트 {lon, lat}
 * @param {Object} endWp - 끝 웨이포인트 {lon, lat}
 * @returns {Array<{lon: number, lat: number, label: string}>} 우회 웨이포인트
 */
export function rlPositionsToWaypoints(projectedPositions, startWp, endWp) {
  const points = [
    { lon: startWp.lon, lat: startWp.lat },
    ...projectedPositions.map(([lon, lat]) => ({ lon, lat })),
    { lon: endWp.lon, lat: endWp.lat },
  ];

  // 방향 변화 기반 단순화 (12° 이상 변화만 유지)
  const simplified = simplifyByAngle(points, 12);

  return simplified.map((p, i) => ({
    lon: p.lon,
    lat: p.lat,
    label: `RL우회 ${i + 1}`,
  }));
}

/**
 * 방향 변화 기반 경로 단순화.
 */
function simplifyByAngle(points, angleDegThreshold) {
  if (points.length <= 2) return points;

  const result = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const a1 = Math.atan2(curr.lat - prev.lat, curr.lon - prev.lon);
    const a2 = Math.atan2(next.lat - curr.lat, next.lon - curr.lon);
    let diff = Math.abs((a2 - a1) * 180 / Math.PI);
    if (diff > 180) diff = 360 - diff;

    if (diff > angleDegThreshold) result.push(curr);
  }

  result.push(points[points.length - 1]);
  return result;
}
