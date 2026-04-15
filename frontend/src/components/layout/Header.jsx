import React, { useState, useEffect } from 'react';
import './Header.css';

const NAV_ITEMS = [
  { id: 'rl_curriculum',  label: 'RL 커리큘럼 학습',  short: 'RL CURR' },
  { id: 'trend_learning', label: 'Trend Report 학습', short: 'TR LEARN' },
  { id: 'whatif',         label: 'WHAT-IF SCENARIO',  short: 'WHAT-IF' },
  { id: 'sar',            label: 'SAR ICEBERG DETECTION', short: 'SAR' },
  { id: 'trend_report',   label: 'TREND REPORT',      short: 'TREND' },
  { id: 'fuel',           label: 'FUEL ANALYSIS',     short: 'FUEL' },
];

export default function Header({ activePanel = null, onSelectPanel = () => {} }) {
  const [kst, setKst] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      setKst(
        kstDate.getUTCFullYear() + '-' +
        String(kstDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(kstDate.getUTCDate()).padStart(2, '0') + ' ' +
        String(kstDate.getUTCHours()).padStart(2, '0') + ':' +
        String(kstDate.getUTCMinutes()).padStart(2, '0') + ':' +
        String(kstDate.getUTCSeconds()).padStart(2, '0') + ' KST'
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="dt-header">
      <div className="dt-header__logo">
        <span className="dt-header__logo-main">ARCTIC</span>
        <span className="dt-header__logo-sub">DIGITAL TWIN CENTER</span>
      </div>

      <nav className="dt-header__nav">
        {NAV_ITEMS.map(item => {
          const active = activePanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`dt-header__nav-btn${active ? ' dt-header__nav-btn--active' : ''}`}
              onClick={() => onSelectPanel(item.id)}
              title={item.label}
            >
              <span className="dt-header__nav-label-full">{item.label}</span>
              <span className="dt-header__nav-label-short">{item.short}</span>
            </button>
          );
        })}
      </nav>

      <div className="dt-header__status">
        <div className="dt-header__indicator">
          <span className="dt-header__dot dt-header__dot--ok" />
          <span className="dt-header__indicator-label">NSIDC</span>
        </div>
        <div className="dt-header__indicator">
          <span className="dt-header__dot dt-header__dot--ok" />
          <span className="dt-header__indicator-label">Copernicus</span>
        </div>
        <div className="dt-header__indicator">
          <span className="dt-header__dot dt-header__dot--ok" />
          <span className="dt-header__indicator-label">NASA GIBS</span>
        </div>
        <span className="dt-header__clock">{kst}</span>
      </div>
    </header>
  );
}
