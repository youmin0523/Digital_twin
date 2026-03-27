import React, { useState } from 'react';

const STATUS_LABELS = {
  NSR_APPROVED:   { cls: 'approved',   text: '\u2714 NSR_APPROVED \u2014 \uC815\uC0C1 \uD1B5\uACFC \uC2B9\uC778' },
  NSR_RESTRICTED: { cls: 'restricted', text: '\u26A0 NSR_RESTRICTED \u2014 \uC870\uAC74\uBD80 \uD1B5\uACFC' },
  REROUTE_SUEZ:   { cls: 'suez',       text: '\u21A9 REROUTE_SUEZ \u2014 \uC218\uC5D0\uC988 \uC6B0\uD68C' },
  REROUTE_CAPE:   { cls: 'cape',       text: '\u26D4 REROUTE_CAPE \u2014 \uD76C\uB9DD\uBD09 \uC6B0\uD68C' },
};

const DEFAULT_CHECKS = {
  pwom: true,
  nsra: true,
  winter: true,
  zeroDis: true,
  comms: true,
  navigator: true,
  sanctioned: false,
  coldRoute: false,
};

export default function RoutingEvaluationPanel({
  onEvaluate,
  evaluationResult,
  currentRoute,
}) {
  const [draft, setDraft] = useState(8.5);
  const [rescueDays, setRescueDays] = useState(7);
  const [tempMargin, setTempMargin] = useState(12);
  const [checks, setChecks] = useState(DEFAULT_CHECKS);

  const result = evaluationResult || {};
  const statusInfo = STATUS_LABELS[result.status] || { cls: '', text: '-- \uBBF8\uD3C9\uAC00 --' };
  const distances = result.distances || {};

  const handleCheck = (key) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleEvaluate = () => {
    if (!onEvaluate) return;
    onEvaluate({
      draft,
      rescueDays,
      tempMargin,
      hasPwom: checks.pwom,
      hasNsra: checks.nsra,
      hasWinter: checks.winter,
      hasZeroDis: checks.zeroDis,
      hasComms: checks.comms,
      hasNavigator: checks.navigator,
      isSanctioned: checks.sanctioned,
      isColdRoute: checks.coldRoute,
    });
  };

  /* Distance saved display */
  const saved = (distances.suez != null && distances.current != null)
    ? distances.suez - distances.current
    : null;

  let savedText = '-- km';
  let savedColor = '#34d399';
  if (saved !== null) {
    if (saved > 0) {
      savedText = `${Math.round(saved).toLocaleString()} km \uC808\uAC10 \u2193`;
      savedColor = '#34d399';
    } else if (saved < 0) {
      savedText = `${Math.round(-saved).toLocaleString()} km \uC99D\uAC00 \u2191`;
      savedColor = '#ef4444';
    } else {
      savedText = '-';
      savedColor = '#9ca3af';
    }
  }

  /* Route name mapping */
  const routeNames = {
    NSR: '\uBD81\uB3D9\uD56D\uB85C (NSR)',
    NWP: '\uBD81\uC11C\uD56D\uB85C (NWP)',
    TSR: '\uBD81\uADF9\uD6A1\uB2E8\uD56D\uB85C (TSR)',
    SUEZ: '\uC218\uC5D0\uC988 \uC6B4\uD558',
    CAPE: '\uD76C\uB9DD\uBD09 \uC6B0\uD68C',
  };
  const currentRouteLabel = (routeNames[currentRoute] || currentRoute || '\uD604\uC7AC \uBAA9\uD45C \uD56D\uB85C') + ':';

  return (
    <div className="hud" id="hud-routing" style={{ border: '1px solid rgba(96, 165, 250, 0.2)', minWidth: '300px' }}>
      <div className="hud-title">📋 NSR 항로 적합성 및 POLARIS 평가</div>

      <div id="routing-status-badge" className={statusInfo.cls} style={{ 
        padding: '10px', 
        fontSize: '13px', 
        borderRadius: '8px',
        marginBottom: '10px',
        boxShadow: 'inset 0 0 10px rgba(0,0,0,0.2)'
      }}>
        {statusInfo.text}
      </div>

      <div id="routing-rio-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px', marginBottom: '8px' }}>
        <span style={{ fontSize: '12px' }}>POLARIS RIO Score:</span>
        <span id="routing-rio-val" style={{ 
          fontSize: '14px', 
          color: result.rioScore >= 0 ? '#34d399' : '#f87171' 
        }}>
          {result.rioScore != null
            ? (result.rioScore >= 0 ? '+' : '') + result.rioScore.toFixed(2)
            : '--'}
        </span>
      </div>

      <div id="routing-reason" style={{ 
        background: 'rgba(0,0,0,0.2)', 
        padding: '10px', 
        borderRadius: '6px', 
        fontSize: '11px', 
        color: '#94a3b8',
        border: '1px solid rgba(255,255,255,0.05)',
        marginBottom: '12px'
      }}>
        {result.reason || '선박 제원을 설정하고 평가를 실행하세요.'}
      </div>

      {/* --- Distance comparison panel --- */}
      <div className="routing-section-title" style={{ color: '#60a5fa', fontWeight: 'bold' }}>
        🚢 항로 거리 비교분석
      </div>
      <div style={{
        fontSize: '12px',
        marginBottom: '14px',
        background: 'rgba(15, 23, 42, 0.6)',
        padding: '10px',
        borderRadius: '8px',
        border: '1px solid rgba(147,197,253,0.1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ color: '#94a3b8' }} id="lbl-dist-current">{currentRouteLabel}</span>
          <span id="dist-current" style={{ color: '#f8fafc', fontWeight: '600' }}>
            {distances.current != null
              ? `${Math.round(distances.current).toLocaleString()} km`
              : '-- km'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ color: '#94a3b8' }}>수에즈 운하 우회:</span>
          <span id="dist-suez" style={{ color: '#f8fafc', fontWeight: '600' }}>
            {distances.suez != null
              ? `${Math.round(distances.suez).toLocaleString()} km`
              : '-- km'}
          </span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          paddingTop: '8px',
          marginTop: '6px',
        }}>
          <span style={{ color: '#34d399', fontWeight: 'bold' }}>거리 단축 효과:</span>
          <span id="dist-saved" style={{ color: savedColor, fontWeight: 'bold', fontSize: '13px' }}>
            {savedText}
          </span>
        </div>
      </div>

      {/* --- Polar Code safety inputs --- */}
      <div className="routing-section-title" style={{ color: '#a78bfa' }}>Polar Code 안전 설계 기준</div>

      <div className="routing-input-group" style={{ marginBottom: '6px' }}>
        <label style={{ fontSize: '11px' }}>흘수 (Draft)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            id="r-draft"
            type="number"
            value={draft}
            style={{ width: '60px', borderRadius: '4px', textAlign: 'center' }}
            onChange={(e) => setDraft(parseFloat(e.target.value) || 0)}
          />
          <span style={{ color: '#4a6a8a', fontSize: '11px' }}>m</span>
        </div>
      </div>
      <div className="routing-input-group" style={{ marginBottom: '6px' }}>
        <label style={{ fontSize: '11px' }}>생존 장비 (Rescue)</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            id="r-rescue-days"
            type="number"
            value={rescueDays}
            style={{ width: '60px', borderRadius: '4px', textAlign: 'center' }}
            onChange={(e) => setRescueDays(parseInt(e.target.value) || 0)}
          />
          <span style={{ color: '#4a6a8a', fontSize: '11px' }}>일</span>
        </div>
      </div>
      <div className="routing-input-group" style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '11px' }}>설계 온도 여유</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input
            id="r-temp-margin"
            type="number"
            value={tempMargin}
            style={{ width: '60px', borderRadius: '4px', textAlign: 'center' }}
            onChange={(e) => setTempMargin(parseFloat(e.target.value) || 0)}
          />
          <span style={{ color: '#4a6a8a', fontSize: '11px' }}>°C</span>
        </div>
      </div>

      {/* --- Administrative checkboxes --- */}
      <div className="routing-section-title" style={{ color: '#94a3b8' }}>행정·설비 안전 체크리스트</div>
      <div className="routing-checks" style={{ gap: '8px' }}>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-pwom" checked={checks.pwom} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('pwom')} />
          PWOM 비치
        </label>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-nsra" checked={checks.nsra} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('nsra')} />
          NSRA 허가
        </label>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-winter" checked={checks.winter} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('winter')} />
          방한 설비
        </label>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-zero-dis" checked={checks.zeroDis} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('zeroDis')} />
          무배출 탱크
        </label>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-comms" checked={checks.comms} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('comms')} />
          극지 통신
        </label>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-navigator" checked={checks.navigator} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('navigator')} />
          극지 항해사
        </label>
        <label style={{ cursor: 'pointer', gap: '8px', color: checks.sanctioned ? '#f87171' : '#94a3b8' }}>
          <input
            type="checkbox"
            id="r-sanctioned"
            style={{ accentColor: '#ef4444' }}
            checked={checks.sanctioned}
            onChange={() => handleCheck('sanctioned')}
          />
          ⚠️ 제재국가
        </label>
        <label style={{ cursor: 'pointer', gap: '8px' }}>
          <input type="checkbox" id="r-cold-route" checked={checks.coldRoute} style={{ accentColor: '#34d399' }} onChange={() => handleCheck('coldRoute')} />
          기온 -10°C↓
        </label>
      </div>

      <button id="btn-evaluate-routing" onClick={handleEvaluate} style={{ 
        marginTop: '12px', 
        padding: '10px', 
        borderRadius: '8px', 
        background: 'rgba(96, 165, 250, 0.2)',
        borderColor: 'rgba(96, 165, 250, 0.4)',
        color: '#60a5fa',
        fontWeight: 'bold',
        transition: 'all 0.2s'
      }}>
        ✅ 항로 적합성 평가 실행
      </button>
    </div>
  );
}
