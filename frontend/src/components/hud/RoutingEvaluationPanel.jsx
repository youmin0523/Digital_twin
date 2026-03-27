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
    <div id="hud-routing">
      <div className="hud-title">{'\uD83E\uDDED'} NSR \uD56D\uB85C \uC801\uD569\uC131 \uD3C9\uAC00</div>

      <div id="routing-status-badge" className={statusInfo.cls}>
        {statusInfo.text}
      </div>

      <div id="routing-rio-row">
        POLARIS RIO: <span id="routing-rio-val">
          {result.rioScore != null
            ? (result.rioScore >= 0 ? '+' : '') + result.rioScore.toFixed(2)
            : '--'}
        </span>
      </div>

      <div id="routing-reason">
        {result.reason || '\uC120\uBC15 \uC81C\uC6D0\uC744 \uC124\uC815\uD558\uACE0 \uD3C9\uAC00\uB97C \uC2E4\uD589\uD558\uC138\uC694.'}
      </div>

      {/* --- Distance comparison panel --- */}
      <div className="routing-section-title" style={{ marginTop: '8px' }}>
        \uD56D\uB85C \uAC70\uB9AC \uBE44\uAD50
      </div>
      <div style={{
        fontSize: '12px',
        marginBottom: '12px',
        background: 'rgba(0,0,0,0.3)',
        padding: '8px',
        borderRadius: '4px',
        border: '1px solid rgba(147,197,253,0.2)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#93c5fd' }} id="lbl-dist-current">{currentRouteLabel}</span>
          <span id="dist-current" style={{ color: '#ffffff', fontWeight: 'bold' }}>
            {distances.current != null
              ? `${Math.round(distances.current).toLocaleString()} km`
              : '-- km'}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span style={{ color: '#93c5fd' }}>{'\uC218\uC5D0\uC988 \uC6B4\uD558 \uC6B0\uD68C:'}</span>
          <span id="dist-suez" style={{ color: '#ffffff', fontWeight: 'bold' }}>
            {distances.suez != null
              ? `${Math.round(distances.suez).toLocaleString()} km`
              : '-- km'}
          </span>
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(147,197,253,0.3)',
          paddingTop: '6px',
          marginTop: '4px',
        }}>
          <span style={{ color: '#34d399' }}>{'\uAC70\uB9AC \uB2E8\uCD95 \uD6A8\uACFC:'}</span>
          <span id="dist-saved" style={{ color: savedColor, fontWeight: 'bold' }}>
            {savedText}
          </span>
        </div>
      </div>

      {/* --- Polar Code safety inputs --- */}
      <div className="routing-section-title">Polar Code \uC548\uC804 \uAE30\uC900</div>

      <div className="routing-input-group">
        <label>\uD758\uC218 Draft</label>
        <input
          id="r-draft"
          type="number"
          value={draft}
          step="0.1"
          min="1"
          max="25"
          onChange={(e) => setDraft(parseFloat(e.target.value) || 0)}
        />
        <span style={{ color: '#4a6a8a', fontSize: '10px' }}>m</span>
      </div>
      <div className="routing-input-group">
        <label>{'\uC0DD\uC874 \uC7A5\uBE44 Rescue'}</label>
        <input
          id="r-rescue-days"
          type="number"
          value={rescueDays}
          min="0"
          max="60"
          onChange={(e) => setRescueDays(parseInt(e.target.value) || 0)}
        />
        <span style={{ color: '#4a6a8a', fontSize: '10px' }}>{'\uC77C'}</span>
      </div>
      <div className="routing-input-group">
        <label>{'\uC124\uACC4 \uC628\uB3C4 \uC5EC\uC720'}</label>
        <input
          id="r-temp-margin"
          type="number"
          value={tempMargin}
          step="1"
          min="-20"
          max="50"
          onChange={(e) => setTempMargin(parseFloat(e.target.value) || 0)}
        />
        <span style={{ color: '#4a6a8a', fontSize: '10px' }}>{'\u00B0C'}</span>
      </div>

      {/* --- Administrative checkboxes --- */}
      <div className="routing-section-title">{'\uD589\uC815\u00B7\uC124\uBE44 \uCCB4\uD06C'}</div>
      <div className="routing-checks">
        <label>
          <input type="checkbox" id="r-pwom" checked={checks.pwom} onChange={() => handleCheck('pwom')} />
          {' PWOM \uBE44\uCE58'}
        </label>
        <label>
          <input type="checkbox" id="r-nsra" checked={checks.nsra} onChange={() => handleCheck('nsra')} />
          {' NSRA \uD5C8\uAC00'}
        </label>
        <label>
          <input type="checkbox" id="r-winter" checked={checks.winter} onChange={() => handleCheck('winter')} />
          {' \uBC29\uD55C \uC124\uBE44'}
        </label>
        <label>
          <input type="checkbox" id="r-zero-dis" checked={checks.zeroDis} onChange={() => handleCheck('zeroDis')} />
          {' \uBB34\uBC30\uCD9C \uD0F1\uD06C'}
        </label>
        <label>
          <input type="checkbox" id="r-comms" checked={checks.comms} onChange={() => handleCheck('comms')} />
          {' \uADF9\uC9C0 \uD1B5\uC2E0'}
        </label>
        <label>
          <input type="checkbox" id="r-navigator" checked={checks.navigator} onChange={() => handleCheck('navigator')} />
          {' \uADF9\uC9C0 \uD56D\uD574\uC0AC'}
        </label>
        <label>
          <input
            type="checkbox"
            id="r-sanctioned"
            style={{ accentColor: '#ef4444' }}
            checked={checks.sanctioned}
            onChange={() => handleCheck('sanctioned')}
          />
          {' \u26A0 \uC81C\uC7AC\uAD6D'}
        </label>
        <label>
          <input type="checkbox" id="r-cold-route" checked={checks.coldRoute} onChange={() => handleCheck('coldRoute')} />
          {' \uAE30\uC628 -10\u00B0C\u2193'}
        </label>
      </div>

      <button id="btn-evaluate-routing" onClick={handleEvaluate}>
        {'\uD83D\uDCCB'} \uD56D\uB85C \uC801\uD569\uC131 \uD3C9\uAC00 \uC2E4\uD589
      </button>
    </div>
  );
}
