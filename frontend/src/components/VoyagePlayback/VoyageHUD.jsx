import React from 'react';

function rioColorHex(rio) {
  if (rio >= 0) return '#4ade80';
  if (rio >= -3) return '#facc15';
  if (rio >= -6) return '#fb923c';
  return '#ef4444';
}

const CLOSE_BTN_STYLE = {
  background: 'transparent',
  border: '1px solid rgba(148,163,184,0.4)',
  borderRadius: 3,
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 700,
  width: 18,
  height: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  lineHeight: 1,
  marginLeft: 'auto',
};

export default function VoyageHUD({ trace, tHours, currentRio, onClose }) {
  if (!trace) {
    return (
      <div className="voyage-hud">
        <div
          className="voyage-hud-title"
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <span>Voyage Playback</span>
          {onClose && (
            <button type="button" onClick={onClose} title="닫기" style={CLOSE_BTN_STYLE}>
              ✕
            </button>
          )}
        </div>
        <div className="voyage-hud-row muted">Select ice class to load</div>
      </div>
    );
  }

  const meta = trace.metadata;
  const sum = trace.summary;
  const duration = meta.duration_hours;
  const rioColor = rioColorHex(currentRio ?? 0);

  return (
    <div className="voyage-hud">
      <div
        className="voyage-hud-title"
        style={{ display: 'flex', alignItems: 'center' }}
      >
        <span>Voyage Playback</span>
        {onClose && (
          <button type="button" onClick={onClose} title="닫기" style={CLOSE_BTN_STYLE}>
            ✕
          </button>
        )}
      </div>
      <div className="voyage-hud-row">
        <span className="voyage-hud-key">Time</span>
        <span className="voyage-hud-val">
          t={tHours.toFixed(1)}h / {duration.toFixed(0)}h
        </span>
      </div>
      <div className="voyage-hud-row">
        <span className="voyage-hud-key">Class</span>
        <span className="voyage-hud-val">
          {meta.ship.ice_class} @ {meta.ship.speed_knots}kn
        </span>
      </div>
      <div className="voyage-hud-row">
        <span className="voyage-hud-key">RIO</span>
        <span className="voyage-hud-val" style={{ color: rioColor }}>
          {(currentRio ?? 0).toFixed(2)}
        </span>
      </div>
      <div className="voyage-hud-row">
        <span className="voyage-hud-key">Max RIO hit</span>
        <span className="voyage-hud-val">{sum.max_rio_violation}</span>
      </div>
      <div className="voyage-hud-row">
        <span className="voyage-hud-key">Calls</span>
        <span className="voyage-hud-val">
          {sum.icebreaker_calls} / intercept_failed {sum.intercept_failed}
        </span>
      </div>
      <div className="voyage-hud-row">
        <span className="voyage-hud-key">Escorted</span>
        <span className="voyage-hud-val">
          {sum.total_escort_distance_km.toFixed(1)} km
        </span>
      </div>
    </div>
  );
}
