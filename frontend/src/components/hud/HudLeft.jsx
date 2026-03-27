import React from 'react';

export default function HudLeft({ speed, throttle, progress, position, iceState, phase }) {
  return (
    <div className="hud" id="hud-left">
      {/* // //! [Original Code] <div className="hud-title">선박 정보</div> */}
      {/* // //* [Modified Code] 아이콘 추가로 시각적 포인트 부여 */}
      <div className="hud-title">🚢 선박 정보</div>
      <div className="hud-row">
        <span className="hud-label">속도</span>
        <span className="hud-value" id="hud-speed">{speed || '0.0 kn'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">스로틀</span>
        <span className="hud-value" id="hud-throttle">{throttle || '자동'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">진행률</span>
        <span className="hud-value" id="hud-progress">{progress || '0.0%'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">현재위치</span>
        <span className="hud-value" id="hud-pos">{position || '—'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">빙결상태</span>
        <span className="hud-value" id="hud-icestate">{iceState || '개방 수역'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">현재단계</span>
        <span className="hud-value" id="hud-phase">{phase || '출항 대기'}</span>
      </div>
      <div id="progress-track" style={{ marginTop: '12px', height: '4px', background: 'rgba(255,255,255,0.05)' }}>
        <div id="progress-bar" style={{ background: 'linear-gradient(90deg, #34d399, #60a5fa)', boxShadow: '0 0 8px rgba(52, 211, 153, 0.5)' }}></div>
      </div>
    </div>
  );
}
