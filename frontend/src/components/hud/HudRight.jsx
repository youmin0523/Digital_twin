import React from 'react';

export default function HudRight({
  danger,
  dangerClass,
  iceClass,
  sic,
  temp,
  rfi,
  hs,
  roll,
  pitch,
  seaLabel,
  dataSource,
  bergAlert,
  bergAlertVisible,
  onMonthChange,
}) {
  return (
    <div className="hud" id="hud-right">
      <div className="hud-title">해빙 위험도</div>
      <div className="hud-row">
        <span className="hud-label">전방위험도</span>
        <span className={`hud-value ${dangerClass || 'safe'}`} id="hud-danger">
          {danger || '낮음 🟢'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Ice Class</span>
        <span className="hud-value" id="hud-iceclass">{iceClass || 'PC2'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">SIC</span>
        <span className="hud-value" id="hud-sic">{sic || '0%'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">수온</span>
        <span className="hud-value" id="hud-temp">{temp || '+2.1°C'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">RFI 지수</span>
        <span className="hud-value" id="hud-rfi">{rfi || '0.0'}</span>
      </div>
      <div style={{ borderTop: '1px solid rgba(30, 64, 175, 0.4)', margin: '6px 0' }} />
      <div className="hud-row">
        <span className="hud-label">파고 Hs</span>
        <span className="hud-value" id="hud-hs">{hs || '—'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Roll</span>
        <span className="hud-value" id="hud-roll">{roll || '+0.0°'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Pitch</span>
        <span className="hud-value" id="hud-pitch">{pitch || '+0.0°'}</span>
      </div>
      <div className="hud-row">
        <span className="hud-label">해역 상태</span>
        <span className="hud-value" id="hud-sealabel">{seaLabel || '—'}</span>
      </div>
      <div style={{ borderTop: '1px solid rgba(30, 64, 175, 0.4)', margin: '6px 0' }} />
      <div className="hud-row">
        <span className="hud-label">빙하 데이터</span>
        <select
          id="ice-month-select"
          style={{
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            border: '1px solid rgba(100,180,255,0.4)',
            borderRadius: '4px',
            padding: '1px 4px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
          onChange={(e) => onMonthChange && onMonthChange(e.target.value)}
        >
          <optgroup label="Live">
            <option value="live">LIVE (최신)</option>
          </optgroup>
          <optgroup label="2023 Archive">
            <option value="2023-01">2023-01</option>
            <option value="2023-02">2023-02</option>
            <option value="2023-03">2023-03 (최대)</option>
            <option value="2023-04">2023-04</option>
            <option value="2023-05">2023-05</option>
            <option value="2023-06">2023-06</option>
            <option value="2023-07">2023-07</option>
            <option value="2023-08">2023-08</option>
            <option value="2023-09">2023-09 (최소)</option>
            <option value="2023-10">2023-10</option>
            <option value="2023-11">2023-11</option>
            <option value="2023-12">2023-12</option>
          </optgroup>
        </select>
      </div>
      <div className="hud-row">
        <span className="hud-label">데이터</span>
        <span className="hud-value" id="hud-datasource" style={{ color: '#eab308' }}>
          {dataSource || '절차적 폴백'}
        </span>
      </div>
      <div
        className="hud-row"
        id="hud-berg-alert"
        style={{ display: bergAlertVisible ? 'flex' : 'none' }}
      >
        <span
          className="hud-value"
          id="hud-berg-text"
          style={{ color: '#ff6b6b', fontSize: '10px', whiteSpace: 'normal', lineHeight: '1.3' }}
        >
          {bergAlert}
        </span>
      </div>
    </div>
  );
}
