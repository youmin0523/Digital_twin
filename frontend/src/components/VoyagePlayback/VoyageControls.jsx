import React from 'react';
import { PLAYBACK_SPEEDS } from '../../hooks/useVoyagePlayback';

export default function VoyageControls({
  iceClass,
  onLoadIceClass,
  trace,
  tHours,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onSeek,
  onSetSpeed,
}) {
  const duration = trace ? trace.metadata.duration_hours : 0;
  return (
    <div className="voyage-controls">
      <div className="voyage-controls-row">
        <div className="voyage-controls-group">
          <span className="voyage-controls-label">Class</span>
          {['Arc4', 'Arc7', 'Arc9'].map((cls) => (
            <button
              type="button"
              key={cls}
              className={`voyage-btn ${iceClass === cls ? 'active' : ''}`}
              onClick={() => onLoadIceClass(cls)}
            >
              {cls}
            </button>
          ))}
        </div>
        <div className="voyage-controls-group">
          <button
            type="button"
            className="voyage-btn primary"
            onClick={isPlaying ? onPause : onPlay}
            disabled={!trace}
          >
            {isPlaying ? '❚❚ Pause' : '▶ Play'}
          </button>
          <span className="voyage-controls-label">Speed</span>
          {PLAYBACK_SPEEDS.map((s) => (
            <button
              type="button"
              key={s}
              className={`voyage-btn small ${speed === s ? 'active' : ''}`}
              onClick={() => onSetSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
      <div className="voyage-controls-row">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.5}
          value={tHours}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          disabled={!trace}
          className="voyage-slider"
        />
        <span className="voyage-controls-label">
          {tHours.toFixed(1)}h / {duration.toFixed(0)}h
        </span>
      </div>
    </div>
  );
}
