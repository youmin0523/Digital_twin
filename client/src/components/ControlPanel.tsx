import React, { useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { LayerVisibility } from '../types';

const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

const LAYER_LABELS: Record<keyof LayerVisibility, string> = {
  iceConcentration: '해빙 농도 히트맵',
  iceThickness: '해빙 두께 (3D)',
  sarImagery: 'SAR 위성 이미지',
  vessels: '선박 추적',
  routes: '항로 표시',
};

const LAYER_ICONS: Record<keyof LayerVisibility, string> = {
  iceConcentration: '🧊',
  iceThickness: '📐',
  sarImagery: '🛰️',
  vessels: '🚢',
  routes: '🗺️',
};

export default function ControlPanel() {
  const { state, dispatch } = useAppContext();
  const animIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Month animation
  useEffect(() => {
    if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    if (!state.isAnimating) return;

    animIntervalRef.current = setInterval(() => {
      dispatch({
        type: 'SET_MONTH',
        month: (state.currentMonth + 1) % 12,
      });
    }, 1200 / state.animationSpeed);

    return () => {
      if (animIntervalRef.current) clearInterval(animIntervalRef.current);
    };
  }, [state.isAnimating, state.animationSpeed, state.currentMonth, dispatch]);

  return (
    <div className="absolute top-4 left-4 z-10 w-72 flex flex-col gap-3">
      {/* Header */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h1 className="text-lg font-bold tracking-tight leading-tight">
          북극항로 디지털 트윈
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          K-문샷 디지털 실증 플랫폼
        </p>
      </div>

      {/* Layer Controls */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">레이어 제어</h2>
        <div className="flex flex-col gap-2">
          {(Object.keys(LAYER_LABELS) as (keyof LayerVisibility)[]).map((key) => (
            <label key={key} className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={state.layerVisibility[key]}
                  onChange={() => dispatch({ type: 'TOGGLE_LAYER', layer: key })}
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${
                  state.layerVisibility[key] ? 'bg-blue-500' : 'bg-gray-600'
                }`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  state.layerVisibility[key] ? 'translate-x-4' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-sm">
                {LAYER_ICONS[key]} {LAYER_LABELS[key]}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Time Control */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">시간 시뮬레이션</h2>

        {/* Month display */}
        <div className="text-center mb-3">
          <span className="text-2xl font-bold text-blue-300">
            {MONTH_NAMES[state.currentMonth]}
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {state.currentMonth < 4 || state.currentMonth > 9 ? '❄️ 결빙기' : '🌊 해빙기'}
          </span>
        </div>

        {/* Slider */}
        <input
          type="range"
          min={0}
          max={11}
          value={state.currentMonth}
          onChange={(e) => {
            if (state.isAnimating) dispatch({ type: 'TOGGLE_ANIMATION' });
            dispatch({ type: 'SET_MONTH', month: Number(e.target.value) });
          }}
          className="w-full accent-blue-400 mb-3"
        />

        {/* Month labels */}
        <div className="flex justify-between text-xs text-gray-500 mb-3 px-0.5">
          <span>1월</span>
          <span>4월</span>
          <span>7월</span>
          <span>10월</span>
          <span>12월</span>
        </div>

        {/* Play/Pause + Speed */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => dispatch({ type: 'TOGGLE_ANIMATION' })}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              state.isAnimating
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {state.isAnimating ? '⏸ 정지' : '▶ 재생'}
          </button>

          <select
            value={state.animationSpeed}
            onChange={(e) =>
              dispatch({ type: 'SET_ANIMATION_SPEED', speed: Number(e.target.value) })
            }
            className="bg-gray-700 text-white text-sm rounded-lg px-2 py-1.5 border border-gray-600"
          >
            <option value={1}>1×</option>
            <option value={3}>3×</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="p-4 bg-gray-900/90 backdrop-blur-md text-white rounded-xl shadow-2xl border border-gray-700/50">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">해빙 농도 범례</h2>
        <div
          className="h-4 rounded-full mb-1"
          style={{
            background: 'linear-gradient(to right, #1e3a5f, #2563eb, #93c5fd, #e0f2fe, #ffffff)',
          }}
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0% (개방)</span>
          <span>50%</span>
          <span>100% (완전 결빙)</span>
        </div>

        <div className="mt-3 pt-3 border-t border-gray-700">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">항로 안전도</h2>
          <div className="flex flex-col gap-1 text-xs">
            {[
              { color: 'bg-green-400', label: '안전 운항 가능' },
              { color: 'bg-yellow-400', label: '주의 필요' },
              { color: 'bg-orange-400', label: '위험 — 운항 제한' },
              { color: 'bg-red-500', label: '통행 불가' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-3 h-3 rounded-full ${color}`} />
                <span className="text-gray-300">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
