import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  ReactNode,
} from 'react';
import * as Cesium from 'cesium';
import {
  AppAction,
  AppState,
  IceClass,
  VesselProfile,
} from '../types';
import { ICE_CLASS_MAX_CONCENTRATION, TONNAGE_SPEED } from '../data/vesselTypes';

// ─── Initial State ────────────────────────────────────────────────────────────

const defaultProfile: VesselProfile = {
  type: 'commercial',
  tonnage: 15000,
  iceClass: 'PC5',
  maxSafeConcentration: ICE_CLASS_MAX_CONCENTRATION['PC5'],
  speedKnots: TONNAGE_SPEED[15000],
};

const initialState: AppState = {
  currentMonth: new Date().getMonth(),
  isAnimating: false,
  animationSpeed: 1,
  layerVisibility: {
    iceConcentration: true,
    iceThickness: false,
    vessels: true,
    routes: true,
    sarImagery: false,
  },
  selectedVesselId: null,
  vesselProfile: defaultProfile,
  feasibilityResults: null,
  alerts: [],
  activeRoute: null,
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MONTH':
      return { ...state, currentMonth: action.month };

    case 'TOGGLE_ANIMATION':
      return { ...state, isAnimating: !state.isAnimating };

    case 'SET_ANIMATION_SPEED':
      return { ...state, animationSpeed: action.speed };

    case 'TOGGLE_LAYER':
      return {
        ...state,
        layerVisibility: {
          ...state.layerVisibility,
          [action.layer]: !state.layerVisibility[action.layer],
        },
      };

    case 'SELECT_VESSEL':
      return { ...state, selectedVesselId: action.id };

    case 'UPDATE_VESSEL_PROFILE': {
      const merged = { ...state.vesselProfile, ...action.profile };
      // Re-derive maxSafeConcentration and speedKnots when class/tonnage changes
      if (action.profile.iceClass) {
        merged.maxSafeConcentration =
          ICE_CLASS_MAX_CONCENTRATION[action.profile.iceClass as IceClass];
      }
      if (action.profile.tonnage) {
        merged.speedKnots = TONNAGE_SPEED[action.profile.tonnage];
      }
      return { ...state, vesselProfile: merged };
    }

    case 'SET_FEASIBILITY':
      return { ...state, feasibilityResults: action.results };

    case 'ADD_ALERT': {
      // Keep max 5 alerts, remove oldest if necessary
      const existing = state.alerts.filter((a) => !a.dismissed);
      const trimmed = existing.length >= 5 ? existing.slice(1) : existing;
      return { ...state, alerts: [...trimmed, action.alert] };
    }

    case 'DISMISS_ALERT':
      return {
        ...state,
        alerts: state.alerts.map((a) =>
          a.id === action.id ? { ...a, dismissed: true } : a
        ),
      };

    case 'SET_ACTIVE_ROUTE':
      return { ...state, activeRoute: action.routeId };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  viewerRef: React.MutableRefObject<Cesium.Viewer | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Viewer is kept in a plain ref — never in React state — to avoid re-render loops
  const viewerRef = useRef<Cesium.Viewer | null>(null);

  return (
    <AppContext.Provider value={{ state, dispatch, viewerRef }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
