import React from 'react';

export default function ManualControl({ throttle, speed, heading, turnRate, fov, visible }) {
  if (!visible) return null;

  return (
    <div className="hud" id="hud-manual">
      <div className="hud-title">조종 계기</div>
      <div className="hud-row">
        <span className="hud-label">엔진</span>
        <span className="hud-value" id="man-thr">{throttle || '0%'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">선속</span>
        <span className="hud-value" id="man-spd">{speed || '0.0 kn'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">선수방위</span>
        <span className="hud-value" id="man-hdg">{heading || '000°'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">선회율</span>
        <span className="hud-value" id="man-trn">{turnRate || '0.00 °/s'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">FOV</span>
        <span className="hud-value" id="man-fov">{fov || '90°'}</span>
      </div>
    </div>
  );
}
