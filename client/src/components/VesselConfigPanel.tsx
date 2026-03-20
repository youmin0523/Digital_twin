import React from 'react';
import { useAppContext } from '../context/AppContext';
import { IceClass, TonnageClass, VesselType } from '../types';
import { ARCTIC_ROUTES } from '../data/arcticRoutes';
import { getIceDataset } from '../data/mockIceData';
import { calculateAllRoutes } from '../services/routeSimulator';
import {
  ICE_CLASS_DESCRIPTIONS,
  ICE_CLASS_MAX_CONCENTRATION,
  TONNAGE_SPEED,
  VESSEL_TYPE_LABELS,
} from '../data/vesselTypes';

const VESSEL_TYPES: VesselType[] = ['commercial', 'passenger', 'military', 'special'];
const TONNAGE_CLASSES: TonnageClass[] = [5000, 15000, 50000, 100000];
const ICE_CLASSES: IceClass[] = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7'];

const TONNAGE_LABELS: Record<number, string> = {
  5000: '5,000 DWT',
  15000: '15,000 DWT',
  50000: '50,000 DWT',
  100000: '100,000+ DWT',
};

const VESSEL_TYPE_ICONS: Record<VesselType, string> = {
  commercial: '🛳️',
  passenger: '🚢',
  military: '⚓',
  special: '🔬',
};

export default function VesselConfigPanel() {
  const { state, dispatch } = useAppContext();
  const { vesselProfile } = state;

  const maxSafe = ICE_CLASS_MAX_CONCENTRATION[vesselProfile.iceClass];
  const speed = TONNAGE_SPEED[vesselProfile.tonnage];

  function runAnalysis() {
    const dataset = getIceDataset(state.currentMonth);
    const results = calculateAllRoutes(ARCTIC_ROUTES, vesselProfile, dataset);
    dispatch({ type: 'SET_FEASIBILITY', results });
  }

  return (
    <div className="absolute top-4 right-4 z-10 w-72 flex flex-col gap-3 max-h-[calc(100vh-2rem)] overflow-y-auto">
      {/* Vessel Type */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">선박 유형</h2>
        <div className="grid grid-cols-2 gap-1.5">
          {VESSEL_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => dispatch({ type: 'UPDATE_VESSEL_PROFILE', profile: { type } })}
              className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors text-left ${
                vesselProfile.type === type
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {VESSEL_TYPE_ICONS[type]} {VESSEL_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {/* Tonnage */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">톤급 (DWT)</h2>
        <div className="flex flex-col gap-1.5">
          {TONNAGE_CLASSES.map((t) => (
            <button
              key={t}
              onClick={() => dispatch({ type: 'UPDATE_VESSEL_PROFILE', profile: { tonnage: t } })}
              className={`py-1.5 px-3 rounded-lg text-xs font-medium transition-colors flex justify-between items-center ${
                vesselProfile.tonnage === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span>{TONNAGE_LABELS[t]}</span>
              <span className="opacity-70">{TONNAGE_SPEED[t]}kt</span>
            </button>
          ))}
        </div>
      </div>

      {/* Ice Class */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          쇄빙 등급 (IACS Polar Class)
        </h2>
        <div className="flex flex-col gap-1">
          {ICE_CLASSES.map((ic) => (
            <button
              key={ic}
              onClick={() => dispatch({ type: 'UPDATE_VESSEL_PROFILE', profile: { iceClass: ic } })}
              className={`py-1.5 px-3 rounded-lg text-xs transition-colors text-left ${
                vesselProfile.iceClass === ic
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              <span className="font-bold mr-1">{ic}</span>
              <span className="opacity-75 text-[10px]">{ICE_CLASS_DESCRIPTIONS[ic]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Derived Metrics */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">선박 운항 제원</h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">허용 최대 빙결 농도</span>
            <span className="font-bold text-blue-300">{(maxSafe * 100).toFixed(0)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">순항 속력</span>
            <span className="font-bold text-blue-300">{speed}kt</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">선박 유형</span>
            <span className="font-bold text-blue-300">{VESSEL_TYPE_LABELS[vesselProfile.type]}</span>
          </div>
        </div>

        {/* Run Analysis Button */}
        <button
          onClick={runAnalysis}
          className="mt-4 w-full py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white text-sm font-bold rounded-lg shadow-lg transition-all active:scale-95"
        >
          🔍 항로 타당성 분석 실행
        </button>
      </div>
    </div>
  );
}
