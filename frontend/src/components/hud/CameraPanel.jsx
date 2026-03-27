import React from 'react';

const CAMERA_MODES = [
  { mode: 'BRIDGE', label: '🎯 선교 1인칭' },
  { mode: 'FOLLOW', label: '🚢 선미 추적' },
  { mode: 'SATELLITE', label: '🛰️ 위성 조감' },
  { mode: 'WIDE', label: '🌐 광역 항로' },
];

export default function CameraPanel({
  currentMode,
  onModeChange,
  onManualToggle,
  zoomBar,
  zoomDist,
  fov,
  onFovChange,
}) {
  return (
    <div className="hud" id="hud-camera">
      <div id="cam-buttons">
        {CAMERA_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            className={`cam-btn${currentMode === mode ? ' active' : ''}`}
            data-mode={mode}
            onClick={() => onModeChange && onModeChange(mode)}
          >
            {label}
          </button>
        ))}
        <button id="btn-manual" onClick={onManualToggle}>
          🕹️ 수동 조종
        </button>
      </div>
      <div id="hud-zoom">
        🔭&nbsp;
        <span id="zoom-bar">{zoomBar || '[░░░░▐░░░]'}</span>&nbsp;
        <span id="zoom-dist">{zoomDist || '선교'}</span>
        <span style={{ color: '#4a6a8a', fontSize: '10px' }}>휠↑줌인 ↓줌아웃</span>
      </div>
      <div id="hud-fov">
        👁 시야각&nbsp;
        <input
          type="range"
          id="fov-slider"
          min="60"
          max="120"
          step="1"
          value={fov || 90}
          onChange={(e) => onFovChange && onFovChange(Number(e.target.value))}
        />
        <span id="fov-label">{fov ? `${fov}°` : '90°'}</span>
        <span id="fov-override">수동</span>
      </div>
    </div>
  );
}
