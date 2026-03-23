// ─── Ice Data ───────────────────────────────────────────────────────────────

export interface IceGridCell {
  lon: number;          // western edge (degrees)
  lat: number;          // southern edge (degrees)
  lonStep: number;      // cell width (degrees)
  latStep: number;      // cell height (degrees)
  concentration: number; // 0.0–1.0
  thickness: number;    // 0.0–5.0 meters
}

export interface IceDataset {
  month: number;        // 0=January, 11=December
  cells: IceGridCell[];
}

// ─── Vessel Types ────────────────────────────────────────────────────────────

export type VesselType = 'commercial' | 'passenger' | 'military' | 'special';
export type TonnageClass = 5000 | 15000 | 50000 | 100000;
export type IceClass = 'PC1' | 'PC2' | 'PC3' | 'PC4' | 'PC5' | 'PC6' | 'PC7';

export interface VesselProfile {
  type: VesselType;
  tonnage: TonnageClass;
  iceClass: IceClass;
  maxSafeConcentration: number; // derived from iceClass
  speedKnots: number;
}

export interface Vessel {
  id: string;
  name: string;
  type: VesselType;
  iceClass: IceClass;
  maxSafeConcentration: number;
  speedKnots: number;
  colorHex: string;
  waypoints: Array<[number, number]>; // [lon, lat]
  currentWaypointIndex: number;
  position: [number, number];         // current [lon, lat]
  heading: number;                    // degrees
  isInAlert: boolean;
  computedWaypoints: Array<[number, number]> | null; // A* 계산된 경로 (null이면 정적 waypoints 사용)
  routeNeedsRecalc: boolean;                         // true이면 다음 틱에 A* 재계산
  lastRouteCalcMonth: number;                        // 마지막으로 경로를 계산한 월
  staticWaypointTargetIndex: number;                 // vessel.waypoints 중 현재 A* 목표 인덱스
}

// ─── Routes ──────────────────────────────────────────────────────────────────

export type RouteId = 'NSR' | 'NWP' | 'CUSTOM';

export interface RouteWaypoint {
  lon: number;
  lat: number;
  label?: string;
}

export interface ArcticRoute {
  id: RouteId;
  name: string;
  nameKo: string;
  waypoints: RouteWaypoint[];
  totalDistanceNm: number;
}

// ─── Feasibility ─────────────────────────────────────────────────────────────

export type FeasibilityRating = 'safe' | 'caution' | 'dangerous' | 'impossible';

export interface RouteSegmentResult {
  from: RouteWaypoint;
  to: RouteWaypoint;
  avgConcentration: number;
  rating: FeasibilityRating;
}

export interface FeasibilityResult {
  routeId: RouteId;
  overallRating: FeasibilityRating;
  scoreTotal: number;       // 0–100
  iceScore: number;         // weighted 40%
  distanceScore: number;    // weighted 30%
  capabilityScore: number;  // weighted 30%
  estimatedDays: number;
  avgConcentration: number;
  segments: RouteSegmentResult[];
  recommendation: string;
}

// ─── UI State ────────────────────────────────────────────────────────────────

export interface LayerVisibility {
  iceConcentration: boolean;
  iceThickness: boolean;
  vessels: boolean;
  routes: boolean;
  sarImagery: boolean;
}

export interface Alert {
  id: string;
  vesselId: string;
  vesselName: string;
  message: string;
  severity: 'warning' | 'critical';
  timestamp: number;
  dismissed: boolean;
}

// ─── App State ───────────────────────────────────────────────────────────────

export interface AppState {
  currentMonth: number;                 // 0–11
  isAnimating: boolean;
  animationSpeed: number;               // 1 | 5 | 10
  layerVisibility: LayerVisibility;
  selectedVesselId: string | null;
  vesselProfile: VesselProfile;
  feasibilityResults: FeasibilityResult[] | null;
  alerts: Alert[];
  activeRoute: RouteId | null;
}

export type AppAction =
  | { type: 'SET_MONTH'; month: number }
  | { type: 'TOGGLE_ANIMATION' }
  | { type: 'SET_ANIMATION_SPEED'; speed: number }
  | { type: 'TOGGLE_LAYER'; layer: keyof LayerVisibility }
  | { type: 'SELECT_VESSEL'; id: string | null }
  | { type: 'UPDATE_VESSEL_PROFILE'; profile: Partial<VesselProfile> }
  | { type: 'SET_FEASIBILITY'; results: FeasibilityResult[] | null }
  | { type: 'ADD_ALERT'; alert: Alert }
  | { type: 'DISMISS_ALERT'; id: string }
  | { type: 'SET_ACTIVE_ROUTE'; routeId: RouteId | null };
