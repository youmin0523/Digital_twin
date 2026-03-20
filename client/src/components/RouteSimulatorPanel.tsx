import React from 'react';
import { useAppContext } from '../context/AppContext';
import { FeasibilityRating, FeasibilityResult, RouteId } from '../types';

const RATING_CONFIG: Record<FeasibilityRating, { label: string; color: string; bg: string; border: string }> = {
  safe:       { label: '안전',   color: 'text-green-400',  bg: 'bg-green-900/40',  border: 'border-green-500/50' },
  caution:    { label: '주의',   color: 'text-yellow-400', bg: 'bg-yellow-900/40', border: 'border-yellow-500/50' },
  dangerous:  { label: '위험',   color: 'text-orange-400', bg: 'bg-orange-900/40', border: 'border-orange-500/50' },
  impossible: { label: '불가',   color: 'text-red-400',    bg: 'bg-red-900/40',    border: 'border-red-500/50' },
};

const RATING_EMOJI: Record<FeasibilityRating, string> = {
  safe: '✅',
  caution: '⚠️',
  dangerous: '🔴',
  impossible: '🚫',
};

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className={color}>{value.toFixed(0)}점</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color.replace('text-', 'bg-')}`}
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

function RouteCard({ result, isActive, onSelect }: {
  result: FeasibilityResult;
  isActive: boolean;
  onSelect: () => void;
}) {
  const cfg = RATING_CONFIG[result.overallRating];

  return (
    <div
      onClick={onSelect}
      className={`cursor-pointer rounded-xl p-4 border transition-all duration-200 flex-1 min-w-0
        ${isActive ? `${cfg.bg} ${cfg.border} border-2 scale-[1.02] shadow-xl` : 'bg-gray-800/60 border-gray-700/50 hover:bg-gray-800 hover:border-gray-600'}
      `}
    >
      {/* Route name + rating badge */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="font-bold text-white text-sm leading-tight">
            {result.routeId}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {result.routeId === 'NSR' ? '북동항로' : result.routeId === 'NWP' ? '북서항로' : '횡극항로'}
          </div>
        </div>
        <div className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color} border ${cfg.border}`}>
          {RATING_EMOJI[result.overallRating]} {cfg.label}
        </div>
      </div>

      {/* Score bars */}
      <div className="space-y-2 mb-3">
        <ScoreBar label="빙결 적합도" value={result.iceScore} color="text-blue-400" />
        <ScoreBar label="거리 효율" value={result.distanceScore} color="text-cyan-400" />
        <ScoreBar label="선박 능력" value={result.capabilityScore} color="text-purple-400" />
      </div>

      {/* Total score */}
      <div className={`text-center py-1.5 rounded-lg ${cfg.bg} border ${cfg.border} mb-3`}>
        <span className={`text-xl font-black ${cfg.color}`}>{result.scoreTotal.toFixed(0)}</span>
        <span className="text-xs text-gray-400 ml-1">/ 100</span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-gray-400">예상 소요</div>
          <div className="text-white font-bold mt-0.5">
            {result.estimatedDays > 99 ? '운항 불가' : `${result.estimatedDays.toFixed(1)}일`}
          </div>
        </div>
        <div className="bg-gray-700/50 rounded-lg p-2 text-center">
          <div className="text-gray-400">평균 빙결</div>
          <div className="text-white font-bold mt-0.5">{(result.avgConcentration * 100).toFixed(0)}%</div>
        </div>
      </div>

      {/* Recommendation */}
      <p className="text-[10px] text-gray-400 leading-relaxed">{result.recommendation}</p>
    </div>
  );
}

export default function RouteSimulatorPanel() {
  const { state, dispatch } = useAppContext();
  const { feasibilityResults } = state;

  if (!feasibilityResults) return null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[860px] max-w-[96vw]">
      <div className="bg-gray-900/92 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50 p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold">항로 타당성 분석 결과</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              선박: {state.vesselProfile.type} | {state.vesselProfile.tonnage.toLocaleString()} DWT |
              {state.vesselProfile.iceClass} | 허용 농도 {(state.vesselProfile.maxSafeConcentration * 100).toFixed(0)}%
            </p>
          </div>
          <button
            onClick={() => {
              dispatch({ type: 'SET_FEASIBILITY', results: null });
              dispatch({ type: 'SET_ACTIVE_ROUTE', routeId: null });
            }}
            className="text-gray-400 hover:text-white text-lg px-2"
            title="닫기"
          >
            ×
          </button>
        </div>

        {/* Route cards */}
        <div className="flex gap-3">
          {feasibilityResults.map((result) => (
            <RouteCard
              key={result.routeId}
              result={result}
              isActive={state.activeRoute === result.routeId}
              onSelect={() => {
                const newRoute = state.activeRoute === result.routeId ? null : result.routeId as RouteId;
                dispatch({ type: 'SET_ACTIVE_ROUTE', routeId: newRoute });
                dispatch({ type: 'TOGGLE_LAYER', layer: 'routes' });
                if (newRoute && !state.layerVisibility.routes) {
                  dispatch({ type: 'TOGGLE_LAYER', layer: 'routes' });
                }
              }}
            />
          ))}
        </div>

        {state.activeRoute && (
          <p className="text-xs text-center text-gray-400 mt-3">
            선택한 항로({state.activeRoute})가 지구본에 표시됩니다. 다시 클릭하면 해제됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
