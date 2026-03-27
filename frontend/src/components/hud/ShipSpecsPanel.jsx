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
    <div
      className="hud"
      id="hud-specs"
      style={{ border: '1px solid rgba(96, 165, 250, 0.2)' }}
    >
      <div className="hud-title">⚙️ 선박 제원 설정</div>
      <div
        className="preset-row"
        style={{
          background: 'rgba(0,0,0,0.2)',
          padding: '4px',
          borderRadius: '8px',
          marginBottom: '16px',
        }}
      >
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            className="preset-btn"
            data-preset={key}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              fontSize: '10px',
              padding: '6px 0',
              borderRadius: '6px',
              transition: 'all 0.2s',
            }}
            onClick={() => onPresetLoad && onPresetLoad(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="spec-row"
        style={{
          marginBottom: '12px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          paddingBottom: '12px',
        }}
      >
        <span
          className="spec-label"
          style={{ color: '#34d399', fontWeight: 'bold' }}
        >
          목표 항로
        </span>
        <select
          className="spec-select"
          id="spec-route"
          style={{
            width: '160px',
            fontWeight: 'bold',
            background: 'rgba(52, 211, 153, 0.1)',
            borderColor: 'rgba(52, 211, 153, 0.3)',
            color: '#34d399',
          }}
          value={currentRoute || 'NSR'}
          onChange={(e) => onRouteChange && onRouteChange(e.target.value)}
        >
          {ROUTE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="spec-row">
        <span className="spec-label">배수량 (Displacement)</span>
        <input
          className="spec-input"
          id="spec-disp"
          type="number"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          value={s.displacement || 20000}
          onChange={(e) =>
            onSpecChange && onSpecChange('displacement', Number(e.target.value))
          }
        />
        <span className="spec-unit">ton</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">선박 길이 (LOA)</span>
        <input
          className="spec-input"
          id="spec-len"
          type="number"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          value={s.length || 160}
          onChange={(e) =>
            onSpecChange && onSpecChange('length', Number(e.target.value))
          }
        />
        <span className="spec-unit">m</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">선박 폭 (Beam)</span>
        <input
          className="spec-input"
          id="spec-width"
          type="number"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          value={s.width || 30}
          onChange={(e) =>
            onSpecChange && onSpecChange('width', Number(e.target.value))
          }
        />
        <span className="spec-unit">m</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">GM (Restoration)</span>
        <input
          className="spec-input"
          id="spec-gm"
          type="number"
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
            border: '1px solid rgba(255,255,255,0.1)',
          }}
          value={s.gm || 3.2}
          onChange={(e) =>
            onSpecChange && onSpecChange('gm', Number(e.target.value))
          }
        />
        <span className="spec-unit">m</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">Polar Ice Class</span>
        <select
          className="spec-select"
          id="spec-iceclass"
          style={{
            width: '130px',
            background: 'rgba(15, 23, 42, 0.6)',
            borderRadius: '6px',
          }}
          value={s.iceClass || 'PC2'}
          onChange={(e) =>
            onSpecChange && onSpecChange('iceClass', e.target.value)
          }
        >
          {ICE_CLASSES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <button
        id="btn-apply"
        style={{
          marginTop: '16px',
          padding: '10px',
          borderRadius: '8px',
          fontWeight: 'bold',
          background:
            'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(52, 211, 153, 0.5))',
          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
        }}
      >
        ⚡ 제원 데이터 적용
      </button>
    </div>
  );
}
