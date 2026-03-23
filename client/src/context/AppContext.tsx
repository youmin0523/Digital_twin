import React, {
  createContext,
  useContext,
  useReducer,
  useRef,
  useEffect,
  ReactNode,
} from 'react';
import * as Cesium from 'cesium';
import {
  AppAction,
  AppState,
  IceClass,
  IceDataset,
  VesselProfile,
} from '../types';
import { ICE_CLASS_MAX_CONCENTRATION, TONNAGE_SPEED } from '../data/vesselTypes';
import { loadIceDataset, getIceDatasetSync } from '../data/realIceData';
import { initLandMask } from '../services/arcticPathfinder';

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
  iceDataRef: React.MutableRefObject<Record<number, IceDataset>>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Viewer is kept in a plain ref — never in React state — to avoid re-render loops
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  // iceDataRef: 모든 레이어/선박 컴포넌트가 공유하는 해빙 데이터 캐시
  const iceDataRef = useRef<Record<number, IceDataset>>({});

  // 앱 시작 시 1회 — 육지 마스크 로드
  useEffect(() => {
    initLandMask();
  }, []);

  // 월이 바뀔 때 실데이터 비동기 로드 → 로드 완료 시 ref 업데이트
  useEffect(() => {
    const month = state.currentMonth;
    // 즉시 절차적 데이터로 초기화 (로드 전 빈 화면 방지)
    if (!iceDataRef.current[month]) {
      iceDataRef.current[month] = getIceDatasetSync(month);
    }
    // 실데이터 백그라운드 로드
    loadIceDataset(month).then((dataset) => {
      iceDataRef.current[month] = dataset;
    });
  }, [state.currentMonth]);

  return (
    <AppContext.Provider value={{ state, dispatch, viewerRef, iceDataRef }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
