/**
 * arcticPathfinder.ts
 *
 * 북극 해역 A* 경로 탐색 서비스.
 * - 해빙 농도 데이터를 0.5°×0.5° 격자로 변환
 * - 선박 등급(maxSafeConcentration)에 따라 통과 가능 여부 결정
 * - A* 알고리즘으로 출발지 → 목적지 최단 항로 계산
 * - 결과를 대권항로(Geodesic) 웨이포인트 배열로 반환
 */

import { IceDataset, Vessel } from '../types';
import { sampleConcentration } from '../data/mockIceData';

// ─── 육지 마스크 ──────────────────────────────────────────────────────────────

let landMask: Uint8Array | null = null;

export async function initLandMask(): Promise<void> {
  try {
    const res = await fetch('/data/landMask.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    landMask = new Uint8Array(json.data);
    console.log('[arcticPathfinder] 육지 마스크 로드 완료 (육지 셀 수:', json.data.filter((v: number) => v === 1).length, ')');
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
const DIRS: Array<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],           [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1],
];

// ─── 좌표 변환 헬퍼 ──────────────────────────────────────────────────────────

function lonLatToCell(lon: number, lat: number): [number, number] {
  const col = Math.floor((lon - GRID_LON_MIN) / GRID_LON_STEP);
  const row = Math.floor((lat - GRID_LAT_MIN) / GRID_LAT_STEP);
  return [
    Math.max(0, Math.min(GRID_COLS - 1, col)),
    Math.max(0, Math.min(GRID_ROWS - 1, row)),
  ];
}

function cellToLonLat(col: number, row: number): [number, number] {
  return [
    GRID_LON_MIN + col * GRID_LON_STEP + GRID_LON_STEP / 2,
    GRID_LAT_MIN + row * GRID_LAT_STEP + GRID_LAT_STEP / 2,
  ];
}

// ─── 격자 생성 ────────────────────────────────────────────────────────────────

/**
 * IceDataset을 0.5°×0.5° Float32Array 격자로 변환.
 * 값: 각 셀의 해빙 농도(0.0–1.0), 육지 셀은 999(항상 통과 불가)
 */
function buildGrid(dataset: IceDataset): Float32Array {
  const grid = new Float32Array(GRID_ROWS * GRID_COLS).fill(0);

  // 1) 빙하 농도 채우기
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

  // 2) 육지 마스크 적용: 육지 셀을 999로 표시 (항상 통과 불가)
  if (landMask) {
    for (let i = 0; i < GRID_ROWS * GRID_COLS; i++) {
      if (landMask[i] === 1) grid[i] = 999;
    }
  }

  return grid;
}

/**
 * 목표 지점이 육지인 경우 BFS로 가장 가까운 해수 셀을 찾아 스냅.
 */
function snapToOcean(col: number, row: number, grid: Float32Array): [number, number] {
  if (grid[row * GRID_COLS + col] < 999) return [col, row];

  const visited = new Uint8Array(GRID_ROWS * GRID_COLS);
  const queue: Array<[number, number]> = [[col, row]];
  visited[row * GRID_COLS + col] = 1;

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
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

  return [col, row]; // fallback (should not happen)
}

// ─── 비용 함수 ────────────────────────────────────────────────────────────────

function edgeCost(
  fromCol: number, fromRow: number,
  toCol: number, toRow: number,
  grid: Float32Array,
  maxSafeConcentration: number
): number {
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

function heuristic(col: number, row: number, goalCol: number, goalRow: number): number {
  // 유클리드 거리 (격자 단위) — 항상 실제 비용 이하 → admissible
  const dc = col - goalCol;
  const dr = row - goalRow;
  return Math.sqrt(dc * dc + dr * dr);
}

// ─── MinHeap ─────────────────────────────────────────────────────────────────

class MinHeap {
  private data: Array<{ priority: number; value: number }> = [];

  push(value: number, priority: number): void {
    this.data.push({ priority, value });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): number {
    const top = this.data[0].value;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  get size(): number {
    return this.data.length;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this.data[parent].priority <= this.data[i].priority) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private sinkDown(i: number): void {
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

function reconstructPath(cameFrom: Int32Array, endIdx: number): Array<[number, number]> {
  const rawPath: number[] = [];
  let current = endIdx;
  while (current !== -1) {
    rawPath.push(current);
    current = cameFrom[current];
  }
  rawPath.reverse();

  const waypoints: Array<[number, number]> = rawPath.map((idx) => {
    const col = idx % GRID_COLS;
    const row = Math.floor(idx / GRID_COLS);
    return cellToLonLat(col, row);
  });

  return simplifyPath(waypoints, 12); // 방향 변화 12° 이상만 웨이포인트 유지
}

/**
 * Douglas-Peucker 방향 변화 기반 경로 단순화.
 * 방향 변화가 angleDegThreshold 이하인 중간 점은 제거.
 */
function simplifyPath(
  points: Array<[number, number]>,
  angleDegThreshold: number
): Array<[number, number]> {
  if (points.length <= 2) return points;

  const result: Array<[number, number]> = [points[0]];

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
 * @param startLon 출발 경도
 * @param startLat 출발 위도 (65°N 이상이어야 격자 내 포함)
 * @param goalLon  목적지 경도
 * @param goalLat  목적지 위도
 * @param dataset  현재 월의 해빙 데이터
 * @param maxSafeConcentration 선박 등급별 최대 통과 가능 농도
 * @returns [lon, lat] 웨이포인트 배열, 경로 없으면 null
 */
export function findArcticPath(
  startLon: number,
  startLat: number,
  goalLon: number,
  goalLat: number,
  dataset: IceDataset,
  maxSafeConcentration: number
): Array<[number, number]> | null {
  // 위도가 격자 범위(65–90°N) 밖이면 정적 직선 경로 반환
  const clampedStartLat = Math.max(GRID_LAT_MIN, Math.min(GRID_LAT_MAX - 0.01, startLat));
  const clampedGoalLat  = Math.max(GRID_LAT_MIN, Math.min(GRID_LAT_MAX - 0.01, goalLat));

  const grid = buildGrid(dataset);
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
  const inOpen   = new Uint8Array(size).fill(0); // 중복 삽입 방지

  const startIdx = startRow * GRID_COLS + startCol;
  const goalIdx  = goalRow  * GRID_COLS + goalCol;

  gScore[startIdx] = 0;

  const openSet = new MinHeap();
  openSet.push(startIdx, heuristic(startCol, startRow, goalCol, goalRow));
  inOpen[startIdx] = 1;

  while (openSet.size > 0) {
    const currentIdx = openSet.pop();
    inOpen[currentIdx] = 0;

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
        inOpen[neighborIdx] = 1;
      }
    }
  }

  return null; // 경로 없음
}

/**
 * 선박 전방 N 셀(0.5° 단위)에 통과 불가 해빙이 있는지 확인.
 */
export function isPathAheadBlocked(
  vessel: Vessel,
  dataset: IceDataset,
  lookAheadSteps = 3
): boolean {
  const headingRad = (vessel.heading * Math.PI) / 180;
  for (let i = 1; i <= lookAheadSteps; i++) {
    const checkLon = vessel.position[0] + Math.sin(headingRad) * i * GRID_LON_STEP;
    const checkLat = vessel.position[1] + Math.cos(headingRad) * i * GRID_LAT_STEP;
    const conc = sampleConcentration(dataset, checkLon, checkLat);
    if (conc > vessel.maxSafeConcentration) return true;
  }
  return false;
}
