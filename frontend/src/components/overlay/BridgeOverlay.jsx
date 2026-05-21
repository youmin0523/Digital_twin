import React from 'react';

export default function BridgeOverlay({ visible, heading, speed, rollAngle }) {
  return (
    <div id="bridge-frame" className={visible ? 'show' : ''}>
      <div id="bf-top"></div>
      <div id="bf-bottom"></div>
      <div id="bf-left"></div>
      <div id="bf-right"></div>
      <div className="bf-wiper" id="bf-wiper1"></div>
      <div className="bf-wiper" id="bf-wiper2"></div>

      {/* 항법 HUD */}
      <svg id="bf-hud-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* 수직 점선 (heading 텍스트 → 선수) */}
        <line x1="50" y1="19" x2="50" y2="56"
          stroke="#22d3ee" strokeWidth="0.3" strokeDasharray="1.5 1" vectorEffect="non-scaling-stroke" />
        {/* 선박 실루엣 (top-down, 선수 위쪽) */}
        <path d="M50,56 L47,58.5 L46,61 L46.5,63.5 L48,65 L52,65 L53.5,63.5 L54,61 L53,58.5 Z"
          fill="rgba(34,211,238,0.10)" stroke="#22d3ee" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
        {/* 선교 구조물 */}
        <rect x="48.5" y="60.5" width="3" height="2.2"
          fill="rgba(34,211,238,0.18)" stroke="#22d3ee" strokeWidth="0.25" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* 선수방위 텍스트 */}
      <div id="bf-heading-display">
        {String(Math.round(heading || 0)).padStart(3, '0')}° T
      </div>
    </div>
  );
}
