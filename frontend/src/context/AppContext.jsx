import React, { createContext, useContext, useReducer } from 'react';

// ── Initial State ────────────────────────────────────────────────────────────
// Mirrors every global variable from arctic-hybrid.html lines 2599-2760

const initialState = {
  // Simulation
  simProgress: 0,
  simElapsed: 0,
  isSimulating: false,
  multiplier: 1000,

  // Route
  currentRouteKey: 'NSR',

  // Ports (dynamic departure/arrival)
  departurePort: 'BUSAN',
  arrivalPort: 'ROTTERDAM',

  // Dynamic waypoints (null = use default ROUTES[key])
  generatedWaypoints: null,
  isRerouting: false,

  // Camera
  currentMode: 'SATELLITE',
  prevMode: 'SATELLITE',

  // Ship position (shared between Cesium and Three.js)
  shipState: { lon: 129.04, lat: 35.1, heading: 0 },
  manualMode: false,
  manualThrottle: 0,
  manualYawRate: 0,
  manualSpeed: 0,
  manualHeading: 0,

  // Ship specs
  shipSpecs: {
    type: 'bulk',
    displacement: 55000,
    length: 225,
    width: 32,
    gm: 3.8,
    draft: 14.5,
    iceClass: 'Arc4',
  },

  // Ice data (3-tier fallback: Copernicus LIVE -> local monthly -> procedural)
  iceDataSource: '\uC808\uCC28\uC801 \uD3F4\uBC31',
  cachedIceData: null,
  cachedIceKey: '',

  // HUD values
  hud: {
    speed: 0,
    throttle: '\uC790\uB3D9',
    progress: 0,
    position: '\u2014',
    iceState: '\uAC1C\uBC29 \uC218\uC5ED',
    phase: '\uCD9C\uD56D \uB300\uAE30',
    danger: '\uB0AE\uC74C \uD83D\uDFE2',
    dangerClass: 'safe',
    iceClass: 'Arc4',
    sic: '0%',
    temp: '+2.1\u00B0C',
    rfi: '0.0',
    hs: '\u2014',
    // //* [Modified Code] 가시거리 필드 추가 (위도 기반 추정값)
    vis: '10.0 km',
    roll: '+0.0\u00B0',
    pitch: '+0.0\u00B0',
    seaLabel: '\u2014',
    bergAlert: '',
    bergAlertVisible: false,
  },

  // Camera HUD
  zoomBar: '[\u2591\u2591\u2591\u2591\u2590\u2591\u2591\u2591]',
  zoomDist: '\uC120\uAD50',
  fov: 90,
  fovOverride: false,

  // Binoculars
  binocularsActive: false,

  // Bridge overlay
  bridgeVisible: false,

  // Timeline
  timelineDay: 0,
};

// ── Reducer ─────────────────────────────────────────────────────────────────
// 테스트 주석
function reducer(state, action) {
  switch (action.type) {
    case 'SET_SIMULATING':
      return { ...state, isSimulating: action.payload };

    case 'SET_PROGRESS':
      return { ...state, simProgress: action.payload };

    case 'SET_ELAPSED':
      return { ...state, simElapsed: action.payload };

    case 'SET_MULTIPLIER':
      return { ...state, multiplier: action.payload };

    case 'SET_ROUTE':
      return { ...state, currentRouteKey: action.payload };

    case 'SET_DEPARTURE_PORT':
      return { ...state, departurePort: action.payload };

    case 'SET_ARRIVAL_PORT':
      return { ...state, arrivalPort: action.payload };

    case 'SET_GENERATED_WAYPOINTS':
      return { ...state, generatedWaypoints: action.payload };

    case 'SET_GENERATED_WAYPOINTS_WITH_PROGRESS':
      return {
        ...state,
        generatedWaypoints: action.payload.waypoints,
        simProgress: action.payload.progress,
        simElapsed: action.payload.elapsed,
      };

    case 'SET_REROUTING':
      return { ...state, isRerouting: action.payload };

    case 'SET_MODE':
      return {
        ...state,
        prevMode: state.currentMode,
        currentMode: action.payload,
      };

    case 'SET_SHIP_STATE':
      return {
        ...state,
        shipState: { ...state.shipState, ...action.payload },
      };

    case 'SET_MANUAL_MODE':
      return { ...state, manualMode: action.payload };

    case 'SET_MANUAL':
      return { ...state, ...action.payload };

    case 'SET_SHIP_SPECS':
      return {
        ...state,
        shipSpecs: { ...state.shipSpecs, ...action.payload },
      };

    case 'SET_ICE_DATA':
      return {
        ...state,
        cachedIceData: action.payload.data,
        cachedIceKey: action.payload.key,
        iceDataSource: action.payload.source || state.iceDataSource,
      };

    case 'UPDATE_HUD':
      return {
        ...state,
        hud: { ...state.hud, ...action.payload },
      };

    case 'SET_FOV':
      return { ...state, fov: action.payload };

    case 'SET_FOV_OVERRIDE':
      return { ...state, fovOverride: action.payload };

    case 'SET_ZOOM':
      return {
        ...state,
        zoomBar: action.payload.bar,
        zoomDist: action.payload.dist,
      };

    case 'SET_BINOCULARS':
      return { ...state, binocularsActive: action.payload };

    case 'SET_BRIDGE_VISIBLE':
      return { ...state, bridgeVisible: action.payload };

    case 'SET_TIMELINE':
      return { ...state, timelineDay: action.payload };

    case 'RESET':
      return {
        ...initialState,
        departurePort: state.departurePort,
        arrivalPort: state.arrivalPort,
        currentRouteKey: state.currentRouteKey,
      };

    default:
      return state;
  }
}

// ── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext(null);
const DispatchContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </AppContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppState must be used within an AppProvider');
  }
  return ctx;
}

export function useDispatch() {
  const ctx = useContext(DispatchContext);
  if (!ctx) {
    throw new Error('useDispatch must be used within an AppProvider');
  }
  return ctx;
}
