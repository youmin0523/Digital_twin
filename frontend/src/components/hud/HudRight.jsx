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
      <div className="hud-title">⚖ 해빙 위험도 평가</div>
      <div className="hud-row">
        {/* // //! [Original Code] <span className="hud-label">전방위험도</span> */}
        {/* // //* [Modified Code] 라벨 텍스트 가독성 개선 */}
        <span className="hud-label">전방 위험도</span>
        <span
          className={`hud-value ${dangerClass || 'safe'}`}
          id="hud-danger"
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            background: 'rgba(0,0,0,0.2)',
            fontSize: '14px',
          }}
        >
          {danger || '낮음 🟢'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Ice Class</span>
        <span
          className="hud-value"
          id="hud-iceclass"
          style={{ color: '#60a5fa' }}
        >
          {iceClass || 'PC2'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">SIC</span>
        <span className="hud-value" id="hud-sic">
          {sic || '0%'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">수온</span>
        <span className="hud-value" id="hud-temp">
          {temp || '+2.1°C'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">RFI 지수</span>
        <span className="hud-value" id="hud-rfi">
          {rfi || '0.0'}
        </span>
      </div>
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          margin: '10px 0',
        }}
      />
      <div className="hud-row">
        <span className="hud-label">파고 (Hs)</span>
        <span className="hud-value" id="hud-hs">
          {hs || '—'}
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">Roll / Pitch</span>
        <span className="hud-value" id="hud-roll-pitch">
          <span style={{ color: '#f1f5f9' }}>{roll || '+0.0°'}</span> /{' '}
          <span style={{ color: '#f1f5f9' }}>{pitch || '+0.0°'}</span>
        </span>
      </div>
      <div className="hud-row">
        <span className="hud-label">해역 상태</span>
        <span className="hud-value" id="hud-sealabel">
          {seaLabel || '—'}
        </span>
      </div>
      <div
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          margin: '10px 0',
        }}
      />
      <div className="hud-row">
        <span className="hud-label">빙하 아카이브</span>
        <select
          id="ice-month-select"
          // //! [Original Code] { ... style props ... }
          // //* [Modified Code] 세련된 드롭다운 스타일
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            color: '#f8fafc',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '11px',
            cursor: 'pointer',
            outline: 'none',
          }}
          onChange={(e) => onMonthChange && onMonthChange(e.target.value)}
        >
          <optgroup label="Live Mode">
            <option value="live">LIVE (최신 데이터)</option>
          </optgroup>
          <optgroup label="2023 Archive">
            <option value="2023-01">2023-01</option>
            <option value="2023-02">2023-02</option>
            <option value="2023-03">2023-03 (최대 빙량)</option>
            <option value="2023-04">2023-04</option>
            <option value="2023-05">2023-05</option>
            <option value="2023-06">2023-06</option>
            <option value="2023-07">2023-07</option>
            <option value="2023-08">2023-08</option>
            <option value="2023-09">2023-09 (최소 빙량)</option>
            <option value="2023-10">2023-10</option>
            <option value="2023-11">2023-11</option>
            <option value="2023-12">2023-12</option>
          </optgroup>
        </select>
      </div>
      <div className="hud-row">
        <span className="hud-label">데이터 소스</span>
        <span
          className="hud-value"
          id="hud-datasource"
          style={{ color: '#f59e0b', fontSize: '11px' }}
        >
          {dataSource || '절차적 폴백'}
        </span>
      </div>
      <div
        className="hud-row"
        id="hud-berg-alert"
        style={{
          display: bergAlertVisible ? 'flex' : 'none',
          background: 'rgba(239, 68, 68, 0.1)',
          padding: '8px',
          borderRadius: '6px',
          marginTop: '8px',
          border: '1px solid rgba(239, 68, 68, 0.2)',
        }}
      >
        <span
          className="hud-value"
          id="hud-berg-text"
          style={{
            color: '#f87171',
            fontSize: '11px',
            whiteSpace: 'normal',
            lineHeight: '1.4',
            textAlign: 'left',
          }}
        >
          🚨 {bergAlert}
        </span>
      </div>
    </div>
  );
}
