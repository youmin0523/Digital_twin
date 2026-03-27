import React from 'react';

const PRESETS = [
  { key: 'icebreaker', label: '🧊 쇄빙선' },
  { key: 'lng', label: '🛢 LNG운반선' },
  { key: 'container', label: '📦 컨테이너선' },
];

const ROUTE_OPTIONS = [
  { value: 'NSR', label: '❄ 북동항로(NSR)' },
  { value: 'NWP', label: '❄ 북서항로(NWP)' },
  { value: 'TSR', label: '❄ 북극횡단항로(TSR)' },
  { value: 'SUEZ', label: '↩ 수에즈 우회(SUEZ)' },
  { value: 'CAPE', label: '⛔ 희망봉 우회(CAPE)' },
];

const ICE_CLASSES = [
  { value: 'PC1', label: 'PC1 (최고등급)' },
  { value: 'PC2', label: 'PC2' },
  { value: 'PC3', label: 'PC3' },
  { value: 'PC4', label: 'PC4' },
  { value: 'PC5', label: 'PC5' },
  { value: 'PC6', label: 'PC6' },
  { value: 'PC7', label: 'PC7 (최저등급)' },
  { value: 'NONE', label: '일반 선박' },
];

export default function ShipSpecsPanel({
  specs,
  onSpecChange,
  onPresetLoad,
  onRouteChange,
  currentRoute,
}) {
  const s = specs || {};

  return (
    <div className="hud" id="hud-specs">
      <div className="hud-title">⚙ 선박 제원 설정</div>
      <div className="preset-row">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            className="preset-btn"
            data-preset={key}
            onClick={() => onPresetLoad && onPresetLoad(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="spec-row"
        style={{
          marginBottom: '8px',
          borderBottom: '1px solid rgba(30, 64, 175, 0.5)',
          paddingBottom: '8px',
        }}
      >
        <span className="spec-label">목표 항로</span>
        <select
          className="spec-select"
          id="spec-route"
          style={{ width: '155px', fontWeight: 'bold' }}
          value={currentRoute || 'NSR'}
          onChange={(e) => onRouteChange && onRouteChange(e.target.value)}
        >
          {ROUTE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="spec-row">
        <span className="spec-label">배수량</span>
        <input
          className="spec-input"
          id="spec-disp"
          type="number"
          value={s.displacement || 20000}
          min="1000"
          max="500000"
          step="1000"
          onChange={(e) => onSpecChange && onSpecChange('displacement', Number(e.target.value))}
        />
        <span className="spec-unit">톤</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">선박 길이</span>
        <input
          className="spec-input"
          id="spec-len"
          type="number"
          value={s.length || 160}
          min="50"
          max="500"
          step="5"
          onChange={(e) => onSpecChange && onSpecChange('length', Number(e.target.value))}
        />
        <span className="spec-unit">m</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">선박 폭</span>
        <input
          className="spec-input"
          id="spec-width"
          type="number"
          value={s.width || 30}
          min="10"
          max="100"
          step="1"
          onChange={(e) => onSpecChange && onSpecChange('width', Number(e.target.value))}
        />
        <span className="spec-unit">m</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">GM (복원력)</span>
        <input
          className="spec-input"
          id="spec-gm"
          type="number"
          value={s.gm || 3.2}
          min="1.0"
          max="8.0"
          step="0.1"
          onChange={(e) => onSpecChange && onSpecChange('gm', Number(e.target.value))}
        />
        <span className="spec-unit">m</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">Ice Class</span>
        <select
          className="spec-select"
          id="spec-iceclass"
          value={s.iceClass || 'PC2'}
          onChange={(e) => onSpecChange && onSpecChange('iceClass', e.target.value)}
        >
          {ICE_CLASSES.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <button id="btn-apply">⚡ 적용하기</button>
    </div>
  );
}
