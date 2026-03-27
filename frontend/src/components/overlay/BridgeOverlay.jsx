import React from 'react';

export default function BridgeOverlay({ visible, heading, speed, rollAngle }) {
  return (
    <div id="bridge-frame" className={visible ? 'show' : ''}>
      <div id="bf-top">
        <div className="bf-led-row">
          <span className="bf-led green"></span><span className="bf-led-lbl">NAV</span>
          <span className="bf-led green"></span><span className="bf-led-lbl">SYS</span>
          <span className="bf-led yellow"></span><span className="bf-led-lbl">AUX</span>
        </div>
      </div>
      <div id="bf-bottom">
        <div className="bf-instruments">
          <span><span className="bf-dot green"></span>AIS ACTIVE</span>
          <span><span className="bf-dot green"></span>RADAR ON</span>
          <span>
            <span id="bf-ice-dot" className="bf-dot green"></span>
            <span id="bf-ice-txt">CLEAR</span>
          </span>
        </div>
      </div>
      <div id="bf-left"></div>
      <div id="bf-right"></div>
      <div className="bf-wiper" id="bf-wiper1"></div>
      <div className="bf-wiper" id="bf-wiper2"></div>
    </div>
  );
}
