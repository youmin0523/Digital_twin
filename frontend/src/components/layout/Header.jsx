import React, { useState, useEffect } from 'react';
import './Header.css';

export default function Header() {
  const [utc, setUtc] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setUtc(
        now.getUTCFullYear() + '-' +
        String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(now.getUTCDate()).padStart(2, '0') + ' ' +
        String(now.getUTCHours()).padStart(2, '0') + ':' +
        String(now.getUTCMinutes()).padStart(2, '0') + ':' +
        String(now.getUTCSeconds()).padStart(2, '0') + ' UTC'
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
        <span className="dt-header__clock">{utc}</span>
      </div>
    </header>
  );
}
