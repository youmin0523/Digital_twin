/**
 * arcticPathfinder.js
 *
 * 북극 해역 A* 경로 탐색 서비스 (arcticPathfinder.ts에서 JS로 포팅).
 * - 해빙 농도 데이터를 0.5°×0.5° 격자로 변환
 * - 선박 등급(maxSafeConcentration)에 따라 통과 가능 여부 결정
 * - A* 알고리즘으로 출발지 → 목적지 최단 항로 계산
 * - 빙산 위치를 추가 장애물로 처리 가능
 * - 결과를 대권항로(Geodesic) 웨이포인트 배열로 반환
 */

// ─── 육지 마스크 ──────────────────────────────────────────────────────────────

let landMask = null;

export async function initLandMask() {
  try {
    const res = await fetch('/data/landMask.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    landMask = new Uint8Array(json.data);
    console.log('[arcticPathfinder] 육지 마스크 로드 완료 (육지 셀 수:', json.data.filter(v => v === 1).length, ')');
  } catch (e) {
    console.warn('[arcticPathfinder] 육지 마스크 로드 실패 — 육지 회피 비활성화:', e);
  }
}

// ─── 격자 상수 ────────────────────────────────────────────────────────────────

const GRID_LON_STEP = 0.5;
const GRID_LAT_STEP = 0.5;
const GRID_LON_MIN = -180;
const GRID_LAT_MIN = 65;   // 북극권 시작 위도
const GRID_LON_MAX = 180;
const GRID_LAT_MAX = 90;
const GRID_COLS = (GRID_LON_MAX - GRID_LON_MIN) / GRID_LON_STEP; // 720
const GRID_ROWS = (GRID_LAT_MAX - GRID_LAT_MIN) / GRID_LAT_STEP; // 50

// 8방향 이동 (상하좌우 + 대각선)
const DIRS = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],           [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

// ─── 좌표 변환 헬퍼 ──────────────────────────────────────────────────────────

function lonLatToCell(lon, lat) {
  const col = Math.floor((lon - GRID_LON_MIN) / GRID_LON_STEP);
  const row = Math.floor((lat - GRID_LAT_MIN) / GRID_LAT_STEP);
  return [
    Math.max(0, Math.min(GRID_COLS - 1, col)),
    Math.max(0, Math.min(GRID_ROWS - 1, row)),
  ];
}

function cellToLonLat(col, row) {
  return [
    GRID_LON_MIN + col * GRID_LON_STEP + GRID_LON_STEP / 2,
    GRID_LAT_MIN + row * GRID_LAT_STEP + GRID_LAT_STEP / 2,
  ];
}

// ─── 격자 생성 ────────────────────────────────────────────────────────────────

/**
 * 해빙 데이터 + 빙산 위치를 0.5°×0.5° Float32Array 격자로 변환.
 * 값: 각 셀의 해빙 농도(0.0–1.0), 육지 셀은 999(항상 통과 불가)
 *
 * @param {Object} dataset - { cells: [{ lon, lat, lonStep, latStep, concentration }] }
 * @param {Array} icebergs - [{ lat, lon, length_m }] 빙산 위치 배열 (선택)
 * @param {number} safetyRadiusDeg - 빙산 주변 안전 반경 (도 단위, 기본 0.15 ≈ 약 16km)
 */
function buildGrid(dataset, icebergs = [], safetyRadiusDeg = 0.15) {
  const grid = new Float32Array(GRID_ROWS * GRID_COLS).fill(0);

  // 1) 빙하 농도 채우기
  if (dataset && dataset.cells) {
    for (const cell of dataset.cells) {
      const colStart = Math.max(0, Math.floor((cell.lon - GRID_LON_MIN) / GRID_LON_STEP));
      const colEnd   = Math.min(GRID_COLS, Math.ceil((cell.lon + cell.lonStep - GRID_LON_MIN) / GRID_LON_STEP));
      const rowStart = Math.max(0, Math.floor((cell.lat - GRID_LAT_MIN) / GRID_LAT_STEP));
      const rowEnd   = Math.min(GRID_ROWS, Math.ceil((cell.lat + cell.latStep - GRID_LAT_MIN) / GRID_LAT_STEP));

      for (let r = rowStart; r < rowEnd; r++) {
        for (let c = colStart; c < colEnd; c++) {
          grid[r * GRID_COLS + c] = cell.concentration;
        }
      }
    }
  }

  // 2) 육지 마스크 적용: 육지 셀을 999로 표시 (항상 통과 불가)
  if (landMask) {
    for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) {
      if (landMask[i] === 1) grid[i] = 999;
    }
  }

  // 3) 빙산 장애물 주입: 빙산 주변 셀을 높은 비용으로 마킹
  for (const berg of icebergs) {
    if (berg.lat < GRID_LAT_MIN || berg.lat >= GRID_LAT_MAX) continue;
    const radius = Math.max(safetyRadiusDeg, (berg.length_m || 5000) / 111000 * 2);
    const cCenter = Math.floor((berg.lon - GRID_LON_MIN) / GRID_LON_STEP);
    const rCenter = Math.floor((berg.lat - GRID_LAT_MIN) / GRID_LAT_STEP);
    const cellRadius = Math.ceil(radius / GRID_LAT_STEP);

    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      for (let dc = -cellRadius; dc <= cellRadius; dc++) {
        const r = rCenter + dr;
        const c = (cCenter + dc + GRID_COLS) % GRID_COLS; // 경도 래핑
        if (r < 0 || r >= GRID_ROWS) continue;
        const dist = Math.sqrt(dr * dr + dc * dc);
        if (dist <= cellRadius) {
          const idx = r * GRID_COLS + c;
          if (grid[idx] < 999) {
            // 빙산 중심에 가까울수록 높은 비용 (최대 0.95)
            const penalty = Math.max(grid[idx], 0.95 * (1 - dist / (cellRadius + 1)));
            grid[idx] = penalty;
          }
        }
      }
    }
  }

  return grid;
}

/**
 * 목표 지점이 육지인 경우 BFS로 가장 가까운 해수 셀을 찾아 스냅.
 */
function snapToOcean(col, row, grid) {
  if (grid[row * GRID_COLS + col] < 999) return [col, row];

  const visited = new Uint8Array(GRID_ROWS * GRID_COLS);
  const queue = [[col, row]];
  visited[row * GRID_COLS + col] = 1;

  while (queue.length > 0) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;
      const ni = nr * GRID_COLS + nc;
      if (visited[ni]) continue;
      visited[ni] = 1;
      if (grid[ni] < 999) return [nc, nr];
      queue.push([nc, nr]);
    }
  }

  return [col, row]; // fallback
}

// ─── 비용 함수 ────────────────────────────────────────────────────────────────

function edgeCost(fromCol, fromRow, toCol, toRow, grid, maxSafeConcentration) {
  const idx = toRow * GRID_COLS + toCol;
  const concentration = grid[idx];

  // 통과 불가: 선박 등급 초과 해빙 농도
  if (concentration > maxSafeConcentration) return Infinity;

  // 대각선 이동은 √2 거리
  const isDiagonal = fromCol !== toCol && fromRow !== toRow;
  const baseMoveCost = isDiagonal ? 1.414 : 1.0;

  // 해빙 패널티: 농도 높을수록 비용 증가 → 개방 해수 우선 경로 유도
  const icePenalty = maxSafeConcentration > 0
    ? (concentration / maxSafeConcentration) * 1.5
    : 0;

  return baseMoveCost * (1 + icePenalty);
}

// ─── 휴리스틱 ────────────────────────────────────────────────────────────────

function heuristic(col, row, goalCol, goalRow) {
  const dc = col - goalCol;
  const dr = row - goalRow;
  return Math.sqrt(dc * dc + dr * dr);
}

// ─── MinHeap ─────────────────────────────────────────────────────────────────

class MinHeap {
  constructor() {
    this.data = [];
  }

  push(value, priority) {
    this.data.push({ priority, value });
    this._bubbleUp(this.data.length - 1);
  }

  pop() {
    const top = this.data[0].value;
    const last = this.data.pop();
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  get size() {
    return this.data.length;
  }

  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.data[parent].priority <= this.data[i].priority) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  _sinkDown(i) {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this.data[left].priority < this.data[smallest].priority) smallest = left;
      if (right < n && this.data[right].priority < this.data[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ─── 경로 복원 + 단순화 ──────────────────────────────────────────────────────

function reconstructPath(cameFrom, endIdx) {
  const rawPath = [];
  let current = endIdx;
  while (current !== -1) {
    rawPath.push(current);
    current = cameFrom[current];
  }
  rawPath.reverse();

  const waypoints = rawPath.map((idx) => {
    const col = idx % GRID_COLS;
    const row = Math.floor(idx / GRID_COLS);
    return cellToLonLat(col, row);
  });

  return simplifyPath(waypoints, 12); // 방향 변화 12° 이상만 웨이포인트 유지
}

/**
 * 방향 변화 기반 경로 단순화.
 */
function simplifyPath(points, angleDegThreshold) {
  if (points.length <= 2) return points;

  const result = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const next = points[i + 1];

    const a1 = Math.atan2(curr[1] - prev[1], curr[0] - prev[0]);
    const a2 = Math.atan2(next[1] - curr[1], next[0] - curr[0]);
    let diff = Math.abs((a2 - a1) * 180 / Math.PI);
    if (diff > 180) diff = 360 - diff;

    if (diff > angleDegThreshold) result.push(curr);
  }

  result.push(points[points.length - 1]);
  return result;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * A* 기반 북극 항로 탐색.
 *
 * @param {number} startLon 출발 경도
 * @param {number} startLat 출발 위도 (65°N 이상이어야 격자 내 포함)
 * @param {number} goalLon  목적지 경도
 * @param {number} goalLat  목적지 위도
 * @param {Object} dataset  현재 월의 해빙 데이터 { cells: [...] }
 * @param {number} maxSafeConcentration 선박 등급별 최대 통과 가능 농도
 * @param {Array}  icebergs 빙산 위치 배열 [{ lat, lon, length_m }] (선택)
 * @returns {Array<[number, number]>|null} [lon, lat] 웨이포인트 배열, 경로 없으면 null
 */
export function findArcticPath(
  startLon,
  startLat,
  goalLon,
  goalLat,
  dataset,
  maxSafeConcentration,
  icebergs = []
) {
  const clampedStartLat = Math.max(GRID_LAT_MIN, Math.min(GRID_LAT_MAX - 0.01, startLat));
  const clampedGoalLat  = Math.max(GRID_LAT_MIN, Math.min(GRID_LAT_MAX - 0.01, goalLat));

  const grid = buildGrid(dataset, icebergs);
  let [startCol, startRow] = lonLatToCell(startLon, clampedStartLat);
  let [goalCol, goalRow]   = lonLatToCell(goalLon,  clampedGoalLat);

  // 출발/도착 지점이 육지에 있으면 가장 가까운 해수 셀로 스냅
  [startCol, startRow] = snapToOcean(startCol, startRow, grid);
  [goalCol, goalRow]   = snapToOcean(goalCol, goalRow, grid);

  // 이미 같은 셀이면 빈 경로 반환
  if (startCol === goalCol && startRow === goalRow) {
    return [[goalLon, goalLat]];
  }

  const size = GRID_ROWS * GRID_COLS;
  const gScore   = new Float32Array(size).fill(Infinity);
  const cameFrom = new Int32Array(size).fill(-1);

  const startIdx = startRow * GRID_COLS + startCol;
  const goalIdx  = goalRow  * GRID_COLS + goalCol;

  gScore[startIdx] = 0;

  const openSet = new MinHeap();
  openSet.push(startIdx, heuristic(startCol, startRow, goalCol, goalRow));

  while (openSet.size > 0) {
    const currentIdx = openSet.pop();

    if (currentIdx === goalIdx) {
      return reconstructPath(cameFrom, currentIdx);
    }

    const currentCol = currentIdx % GRID_COLS;
    const currentRow = Math.floor(currentIdx / GRID_COLS);

    for (const [dc, dr] of DIRS) {
      const nc = currentCol + dc;
      const nr = currentRow + dr;
      if (nc < 0 || nc >= GRID_COLS || nr < 0 || nr >= GRID_ROWS) continue;

      const cost = edgeCost(currentCol, currentRow, nc, nr, grid, maxSafeConcentration);
      if (!isFinite(cost)) continue;

      const neighborIdx = nr * GRID_COLS + nc;
      const tentativeG = gScore[currentIdx] + cost;

      if (tentativeG < gScore[neighborIdx]) {
        cameFrom[neighborIdx] = currentIdx;
        gScore[neighborIdx] = tentativeG;
        const f = tentativeG + heuristic(nc, nr, goalCol, goalRow);
        openSet.push(neighborIdx, f);
      }
    }
  }

  return null; // 경로 없음
}

/**
 * 선박 전방 N 셀(0.5° 단위)에 통과 불가 해빙 또는 빙산이 있는지 확인.
 *
 * @param {Object} vessel - { position: [lon, lat], heading, maxSafeConcentration }
 * @param {Object} dataset - 해빙 데이터
 * @param {Array}  icebergs - 빙산 위치 배열
 * @param {number} lookAheadSteps - 전방 확인 셀 수 (기본 3)
 * @returns {boolean} 전방에 통과 불가 장애물이 있으면 true
 */
export function isPathAheadBlocked(
  vessel,
  dataset,
  icebergs = [],
  lookAheadSteps = 3
) {
  const grid = buildGrid(dataset, icebergs);
  const headingRad = (vessel.heading * Math.PI) / 180;

  for (let i = 1; i <= lookAheadSteps; i++) {
    const checkLon = vessel.position[0] + Math.sin(headingRad) * i * GRID_LON_STEP;
    const checkLat = vessel.position[1] + Math.cos(headingRad) * i * GRID_LAT_STEP;

    if (checkLat < GRID_LAT_MIN || checkLat >= GRID_LAT_MAX) continue;

    const [col, row] = lonLatToCell(checkLon, checkLat);
    const concentration = grid[row * GRID_COLS + col];
    if (concentration > vessel.maxSafeConcentration) return true;
  }

  return false;
}
