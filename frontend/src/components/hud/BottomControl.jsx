import React from 'react';

export default function BottomControl({
  isSimulating,
  onStart,
  onReset,
  multiplier,
  onMultiplierChange,
  timelineDay,
  onTimelineChange,
}) {
  return (
    <div
      className="hud"
      id="hud-bottom"
      style={{ flexDirection: 'column', padding: '10px 18px 8px', minWidth: '400px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', justifyContent: 'center' }}>
        <button className="ctrl-btn" id="btn-start" onClick={onStart}>
          {isSimulating ? '■ 정지' : '▶ 출항'}
        </button>
        <button className="ctrl-btn" id="btn-reset" onClick={onReset}>
          ↺ 리셋
        </button>
        <span className="hud-label" style={{ marginLeft: '10px' }}>배속</span>
        <input
          type="range"
          id="speed-slider"
          min="50"
          max="5000"
          step="50"
          value={multiplier || 1000}
          style={{ flex: 1 }}
          onChange={(e) => onMultiplierChange && onMultiplierChange(Number(e.target.value))}
        />
        <span className="hud-value" id="speed-label" style={{ minWidth: '45px' }}>
          ×{Math.round((multiplier || 1000) / 20)}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          marginTop: '8px',
          borderTop: '1px solid rgba(147, 197, 253, 0.2)',
          paddingTop: '8px',
        }}
      >
        <span className="hud-label" style={{ color: '#fca5a5', fontSize: '11px' }}>
          예측 타임라인
        </span>
        <input
          type="range"
          id="timeline-slider"
          min="0"
          max="14"
          step="1"
          value={timelineDay || 0}
          style={{ flex: 1, accentColor: '#fca5a5' }}
          onChange={(e) => onTimelineChange && onTimelineChange(Number(e.target.value))}
        />
        <span
          className="hud-value"
          id="timeline-label"
          style={{ color: '#fecaca', fontSize: '11px', minWidth: '45px' }}
        >
          Day {timelineDay || 0}
        </span>
      </div>
    </div>
  );
}
