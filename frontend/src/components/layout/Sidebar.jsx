import React, { useState, useEffect } from 'react';
import { PORTS, ALL_PORTS } from '../../data/ports';
import './Sidebar.css';

const ROUTE_META = [
  { key: 'NSR', label: 'NSR', color: '#4ecdc4', dist: '7,200km' },
  { key: 'NWP', label: 'NWP', color: '#f39c12', dist: '8,100km' },
  { key: 'TSR', label: 'TSR', color: '#9b59b6', dist: '6,900km' },
  { key: 'SUEZ', label: 'SUEZ', color: '#6a89b8', dist: '11,200km' },
  { key: 'CAPE', label: 'CAPE', color: '#6a89b8', dist: '14,500km' },
];

const VIEW_MODES = [
  { key: 'BRIDGE', label: '선교 1인칭' },
  { key: 'FOLLOW', label: '선미 추적' },
  { key: 'SATELLITE', label: '위성 조감' },
  { key: 'WIDE', label: '광역 항로' },
  { key: 'MANUAL', label: '수동 조종' },
];

const WMS_LAYERS = [
  { id: 'sat', label: '위성 실사영상 (MODIS/VIIRS)' },
  { id: 'nsidcConc', label: 'NSIDC 해빙 농도' },
  { id: 'gibsIce', label: '해빙 자연색 오버레이' },
  { id: 'copThick', label: 'Copernicus 해빙 두께' },
  { id: 'nsidcEdge', label: 'NSIDC 경계선 (Today)' },
  { id: 'esaSar', label: 'ESA Sentinel-1 위성' },
  { id: 'gebcoBathy', label: 'GEBCO 해저 수심도' },
  { id: 's2True', label: 'Sentinel-2 자연색' },
  { id: 's2Ndsi', label: 'Sentinel-2 NDSI (해빙 탐지)' },
];


export default function Sidebar({
  currentRoute,
  onRouteChange,
  routeVisibility,
  onRouteVisibilityChange,
  currentMode,
  manualMode,
  onModeChange,
  onManualToggle,
  layerStates,
  onLayerToggle,
  satVisible,
  onSatToggle,
  iceDataSource,
  onMonthChange,
  departurePort,
  arrivalPort,
  onDepartureChange,
  onArrivalChange,
}) {
  const [archiveOptions, setArchiveOptions] = useState([
    { value: 'live', label: 'LIVE (최신 데이터)' },
  ]);

  useEffect(() => {
    fetch('/api/ice/archives')
      .then(r => r.json())
      .then(({ dates }) => {
        setArchiveOptions([
          { value: 'live', label: 'LIVE (최신 데이터)' },
          ...dates.map(d => ({ value: d, label: d })),
        ]);
      })
      .catch(() => {});
  }, []);

  const handleSelectAll = () => {
    const allVisible = ROUTE_META.every(r => routeVisibility[r.key]);
    ROUTE_META.forEach(r => onRouteVisibilityChange(r.key, !allVisible));
  };

  const handleViewMode = (mode) => {
    if (mode === 'MANUAL') {
      onManualToggle();
    } else {
      if (manualMode) onManualToggle();
      onModeChange(mode);
    }
  };

  const effectiveMode = manualMode ? 'MANUAL' : currentMode;

  return (
    <aside className="dt-sidebar">
      {/* ── 출발항 / 도착항 ── */}
      <section className="dt-sidebar__section">
        <label className="dt-sidebar__label">출발항</label>
        <select
          className="dt-sidebar__select"
          value={departurePort || 'BUSAN'}
          onChange={e => onDepartureChange(e.target.value)}
        >
          {ALL_PORTS.map(key => (
            <option key={key} value={key}>{PORTS[key].name} ({PORTS[key].nameEn})</option>
          ))}
        </select>

        <label className="dt-sidebar__label" style={{ marginTop: 6 }}>도착항</label>
        <select
          className="dt-sidebar__select"
          value={arrivalPort || 'ROTTERDAM'}
          onChange={e => onArrivalChange(e.target.value)}
        >
          {ALL_PORTS.map(key => (
            <option key={key} value={key}>{PORTS[key].name} ({PORTS[key].nameEn})</option>
          ))}
        </select>

        <button
          className="dt-sidebar__link"
          style={{ display: 'block', marginTop: 6, fontSize: 10 }}
          onClick={() => {
            const dp = departurePort || 'BUSAN';
            const ap = arrivalPort || 'ROTTERDAM';
            onDepartureChange(ap);
            onArrivalChange(dp);
          }}
          title="출발항과 도착항을 서로 바꿉니다"
        >
          &#x21C5; 출발/도착 반전
        </button>
      </section>

      {/* ── 목표 항로 ── */}
      <section className="dt-sidebar__section">
        <label className="dt-sidebar__label">목표 항로</label>
        <select
          className="dt-sidebar__select"
          value={currentRoute}
          onChange={e => onRouteChange(e.target.value)}
        >
          <option value="NSR">북동항로 (NSR)</option>
          <option value="NWP">북서항로 (NWP)</option>
          <option value="TSR">북극횡단항로 (TSR)</option>
          <option value="SUEZ">수에즈 운하 (SUEZ)</option>
          <option value="CAPE">희망봉 우회 (CAPE)</option>
        </select>
      </section>

      {/* ── Routes ── */}
      <section className="dt-sidebar__section">
        <div className="dt-sidebar__section-header">
          <span className="dt-sidebar__section-title">Routes</span>
          <button className="dt-sidebar__link" onClick={handleSelectAll}>Select All</button>
        </div>
        {ROUTE_META.map(r => (
          <label key={r.key} className="dt-sidebar__route-item">
            <input
              type="checkbox"
              className="dt-sidebar__checkbox"
              checked={routeVisibility[r.key] || false}
              onChange={e => onRouteVisibilityChange(r.key, e.target.checked)}
            />
            <span className="dt-sidebar__route-bar" style={{ background: r.color }} />
            <span className="dt-sidebar__route-label">{r.label}</span>
            <span className="dt-sidebar__route-dist">{r.dist}</span>
          </label>
        ))}
      </section>

      {/* ── View Mode ── */}
      <section className="dt-sidebar__section">
        <span className="dt-sidebar__section-title">View Mode</span>
        {VIEW_MODES.map(m => (
          <label key={m.key} className="dt-sidebar__radio-item">
            <input
              type="radio"
              name="viewmode"
              className="dt-sidebar__radio"
              checked={effectiveMode === m.key}
              onChange={() => handleViewMode(m.key)}
            />
            <span className="dt-sidebar__radio-label">{m.label}</span>
          </label>
        ))}
      </section>

      {/* ── WMS 데이터 레이어 ── */}
      <section className="dt-sidebar__section">
        <span className="dt-sidebar__section-title">실시간 WMS 데이터 레이어</span>
        {WMS_LAYERS.map(l => {
          const isSat = l.id === 'sat';
          const checked = isSat ? satVisible : (layerStates[l.id] || false);
          const onChange = isSat
            ? (e) => onSatToggle(e.target.checked)
            : (e) => onLayerToggle(l.id, e.target.checked);
          return (
            <label key={l.id} className="dt-sidebar__layer-item">
              <input
                type="checkbox"
                className="dt-sidebar__checkbox"
                checked={checked}
                onChange={onChange}
              />
              <span className="dt-sidebar__layer-label">{l.label}</span>
            </label>
          );
        })}
      </section>

      {/* ── 빙하 아카이브 ── */}
      <section className="dt-sidebar__section">
        <label className="dt-sidebar__label">빙하 아카이브</label>
        <select
          className="dt-sidebar__select"
          defaultValue="live"
          onChange={e => onMonthChange(e.target.value)}
        >
          {archiveOptions.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="dt-sidebar__datasource">
          <span className="dt-sidebar__label">데이터 소스</span>
          <span className="dt-sidebar__datasource-value">{iceDataSource || '실시간'}</span>
        </div>
      </section>
    </aside>
  );
}
