import React from 'react';
import './SimulationControls.css';

export default function SimulationControls({
  isSimulating,
  onStart,
  onReset,
  multiplier,
  onMultiplierChange,
}) {
  return (
    <div className="sim-controls">
      <button
        className={`sim-controls__btn ${isSimulating ? 'sim-controls__btn--active' : ''}`}
        onClick={onStart}
        title={isSimulating ? '일시정지' : '재생'}
      >
        {isSimulating ? '⏸' : '▶'}
      </button>
      <button className="sim-controls__btn" onClick={onReset} title="정지">
        ⏹
      </button>
      <div className="sim-controls__speed">
        <input
          type="range"
          className="sim-controls__slider"
          min="50"
          max="5000"
          step="50"
          value={multiplier}
          onChange={e => onMultiplierChange(e.target.value)}
        />
        <span className="sim-controls__speed-label">
          x{Math.round(multiplier / 20)}
        </span>
      </div>
    </div>
  );
}
