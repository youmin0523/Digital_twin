import { IceClass, Vessel, VesselType } from '../types';

// IACS Polar Class → maximum safe ice concentration
export const ICE_CLASS_MAX_CONCENTRATION: Record<IceClass, number> = {
  PC1: 1.00, // 모든 조건 운항 가능 (Year-round in all polar waters)
  PC2: 0.95, // 연중 결빙 해역 (Year-round in moderate multi-year ice)
  PC3: 0.90, // 연중 제2종 해역 (Year-round in second-year ice)
  PC4: 0.80, // 연중 박빙 해역 (Year-round in thin multi-year ice)
  PC5: 0.70, // 연중 중간 빙결 해역 (Year-round in medium first-year ice)
  PC6: 0.60, // 여름/가을 중빙 해역 (Summer/autumn medium first-year ice)
  PC7: 0.50, // 여름/가을 박빙 해역 (Summer/autumn thin first-year ice only)
};

// Speed by tonnage (knots)
export const TONNAGE_SPEED: Record<number, number> = {
  5000: 16,
  15000: 14,
  50000: 12,
  100000: 10,
};

// Ice class descriptions (Korean)
export const ICE_CLASS_DESCRIPTIONS: Record<IceClass, string> = {
  PC1: '전천후 극지 운항 — 최고 등급',
  PC2: '다년생 해빙 중빙 이하 연중 운항',
  PC3: '2년생 해빙 연중 운항',
  PC4: '얇은 다년생 해빙 연중 운항',
  PC5: '1년생 중간 해빙 연중 운항',
  PC6: '여름/가을 중간 해빙 운항',
  PC7: '여름/가을 박빙 운항 — 최저 등급',
};

// Vessel type display names (Korean)
export const VESSEL_TYPE_LABELS: Record<VesselType, string> = {
  commercial: '상선 (화물선)',
  passenger: '여객선',
  military: '군함',
  special: '특수작업선',
};

// 8 mock vessels: 3 NSR, 2 NWP, 2 intermediate, 1 stationary
export const MOCK_VESSELS: Vessel[] = [
  // ── NSR (Northern Sea Route) ─────────────────────────────────────────
  {
    id: 'v1',
    name: '북극성-1호',
    type: 'commercial',
    iceClass: 'PC5',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC5'],
    speedKnots: 13,
    colorHex: '#3b82f6', // blue
    waypoints: [
      [33, 69], [60, 72], [80, 75], [100, 79],
      [125, 76], [145, 74], [160, 70], [170, 66],
    ],
    currentWaypointIndex: 1,
    staticWaypointTargetIndex: 2,  // 현재 위치(50,71)에서 waypoints[2]=[80,75]로 이동
    position: [50, 71],
    heading: 90,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },
  {
    id: 'v2',
    name: '세종대왕-2호',
    type: 'commercial',
    iceClass: 'PC4',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC4'],
    speedKnots: 12,
    colorHex: '#10b981', // emerald
    waypoints: [
      [33, 69], [60, 72], [80, 75], [100, 79],
      [125, 76], [145, 74], [160, 70], [170, 66],
    ],
    currentWaypointIndex: 3,
    staticWaypointTargetIndex: 4,  // waypoints[4]=[125,76]
    position: [100, 79],
    heading: 75,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },
  {
    id: 'v3',
    name: '아라온-특수',
    type: 'special',
    iceClass: 'PC2',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC2'],
    speedKnots: 11,
    colorHex: '#f59e0b', // amber
    waypoints: [
      [80, 75], [100, 79], [125, 76], [145, 74],
      [160, 70], [170, 66],
    ],
    currentWaypointIndex: 2,
    staticWaypointTargetIndex: 3,  // waypoints[3]=[145,74]
    position: [120, 77],
    heading: 65,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },

  // ── NWP (Northwest Passage) ──────────────────────────────────────────
  // 실제 NWP 항로: 데이비스 해협 → 랭커스터 해협 → 배로 해협 → 보퍼트해 → 베링해
  {
    id: 'v4',
    name: '한국해양-3',
    type: 'military',
    iceClass: 'PC3',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC3'],
    speedKnots: 18,
    colorHex: '#ef4444', // red
    waypoints: [
      [-60, 70],    // 데이비스 해협 (Davis Strait) — 개방 해수
      [-80, 74],    // 랭커스터 해협 서쪽 입구 (Lancaster Sound)
      [-94, 74.5],  // 배로 해협 (Barrow Strait)
      [-110, 74],   // 맥클린턱 해협 (M'Clintock Channel) 접근
      [-125, 71],   // 보퍼트해 동쪽 (Beaufort Sea)
      [-145, 70],   // 알래스카 북쪽 해안 외측
      [-168, 66],   // 베링 해협 (Bering Strait)
    ],
    currentWaypointIndex: 1,
    staticWaypointTargetIndex: 2,  // waypoints[2]=[-94,74.5] 배로 해협
    position: [-75, 73],
    heading: 270,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },
  {
    id: 'v5',
    name: '극지여객-1',
    type: 'passenger',
    iceClass: 'PC6',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC6'],
    speedKnots: 14,
    colorHex: '#a855f7', // purple
    waypoints: [
      [-60, 70],    // 데이비스 해협 (Davis Strait) — 개방 해수
      [-80, 74],    // 랭커스터 해협 서쪽 입구 (Lancaster Sound)
      [-94, 74.5],  // 배로 해협 (Barrow Strait)
      [-110, 74],   // 맥클린턱 해협 (M'Clintock Channel) 접근
      [-125, 71],   // 보퍼트해 동쪽 (Beaufort Sea)
      [-145, 70],   // 알래스카 북쪽 해안 외측
      [-168, 66],   // 베링 해협 (Bering Strait)
    ],
    currentWaypointIndex: 3,
    staticWaypointTargetIndex: 4,  // waypoints[4]=[-125,71] 보퍼트해
    position: [-100, 74],
    heading: 255,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },

  // ── Intermediate/Cross routes ─────────────────────────────────────────
  {
    id: 'v6',
    name: '빙해탐사-7',
    type: 'special',
    iceClass: 'PC1',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC1'],
    speedKnots: 10,
    colorHex: '#06b6d4', // cyan
    waypoints: [
      [0, 75], [30, 80], [60, 85], [90, 82],
      [120, 78], [150, 72],
    ],
    currentWaypointIndex: 1,
    staticWaypointTargetIndex: 2,  // waypoints[2]=[60,85]
    position: [20, 77],
    heading: 45,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },
  {
    id: 'v7',
    name: '대한상선-88',
    type: 'commercial',
    iceClass: 'PC7',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC7'],
    speedKnots: 14,
    colorHex: '#f97316', // orange
    waypoints: [
      [160, 70], [140, 68], [120, 70], [100, 73],
      [80, 74], [60, 72], [33, 69],
    ],
    currentWaypointIndex: 2,
    staticWaypointTargetIndex: 3,  // waypoints[3]=[100,73]
    position: [135, 69],
    heading: 255,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: true,
    lastRouteCalcMonth: -1,
  },

  // ── Stationary (anchored near Svalbard) ──────────────────────────────
  {
    id: 'v8',
    name: '스발바르-기지선',
    type: 'special',
    iceClass: 'PC3',
    maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC3'],
    speedKnots: 0,
    colorHex: '#64748b', // slate
    waypoints: [[15, 78], [15, 78]],
    currentWaypointIndex: 0,
    staticWaypointTargetIndex: 0,  // 정박 선박 — 이동 없음
    position: [15, 78],
    heading: 0,
    isInAlert: false,
    computedWaypoints: null,
    routeNeedsRecalc: false,
    lastRouteCalcMonth: -1,
  },
];
