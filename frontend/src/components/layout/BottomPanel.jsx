import React, { useState } from 'react';
import './BottomPanel.css';

const TABS = ['Ship Ice Info', 'Ship Weather Info', 'Ship Design Info', 'Ship Service Info'];

/* ── RIO 게이지 SVG (compact 65x55) ── */
function RioGauge({ value, level }) {
  const color = level === 'safe' ? '#27ae60' : level === 'warning' ? '#f39c12' : '#e74c3c';
  const label = level === 'safe' ? '낮음' : level === 'warning' ? '보통' : '높음';
  const angle = Math.min(1, Math.max(0, value / 10)) * 180;
  const rad = (angle - 180) * Math.PI / 180;
  const x = 32 + 22 * Math.cos(rad);
  const y = 38 + 22 * Math.sin(rad);
  return (
    <svg width="65" height="55" viewBox="0 0 65 55" className="gauge-svg">
      <path d="M 10 38 A 22 22 0 0 1 54 38" fill="none" stroke="#1a2a4a" strokeWidth="4" strokeLinecap="round" />
      <path d="M 10 38 A 22 22 0 0 1 54 38" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(angle / 180) * 69} 69`} />
      <circle cx={x} cy={y} r="2.5" fill={color} />
      <text x="32" y="34" textAnchor="middle" fill={color} fontSize="13" fontWeight="700">{(value || 0).toFixed(1)}</text>
      <text x="32" y="45" textAnchor="middle" fill="#6a89b8" fontSize="7">{label}</text>
      <text x="32" y="53" textAnchor="middle" fill="#4a6490" fontSize="6">POLARIS RIO</text>
    </svg>
  );
}

/* ── 속력 게이지 SVG (compact 65x55) ── */
function SpeedGauge({ speed }) {
  const kn = parseFloat(speed) || 0;
  const pct = Math.min(1, kn / 25);
  const angle = pct * 180;
  const rad = (angle - 180) * Math.PI / 180;
  const x = 32 + 22 * Math.cos(rad);
  const y = 38 + 22 * Math.sin(rad);
  return (
    <svg width="65" height="55" viewBox="0 0 65 55" className="gauge-svg">
      <path d="M 10 38 A 22 22 0 0 1 54 38" fill="none" stroke="#1a2a4a" strokeWidth="4" strokeLinecap="round" />
      <path d="M 10 38 A 22 22 0 0 1 54 38" fill="none" stroke="#4ecdc4" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${(angle / 180) * 69} 69`} />
      <circle cx={x} cy={y} r="2.5" fill="#4ecdc4" />
      <text x="32" y="34" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="700">{kn.toFixed(1)}</text>
      <text x="32" y="45" textAnchor="middle" fill="#6a89b8" fontSize="7">kn</text>
    </svg>
  );
}

/* ── 정보 카드 ── */
function InfoCard({ label, value, unit, accent }) {
  return (
    <div className="bp-card">
      <span className="bp-card__label">{label}</span>
      <span className="bp-card__value" style={accent ? { color: accent } : undefined}>
        {value}
      </span>
      {unit && <span className="bp-card__unit">{unit}</span>}
    </div>
  );
}

/* ── 데이터 행 ── */
function DataRow({ label, value, cls }) {
  return (
    <div className="bp-row">
      <span className="bp-row__label">{label}</span>
      <span className={`bp-row__value ${cls || ''}`}>{value}</span>
    </div>
  );
}

/* ── Tab 1: Ship Ice Info ── */
function IceInfoPanel({ hud }) {
  const sicNum = parseFloat(hud.sic) || 0;
  const rfiNum = parseFloat(hud.rfi) || 0;
  const rioLevel = sicNum < 15 ? 'safe' : sicNum < 40 ? 'warning' : 'danger';
  const iceType = sicNum > 70 ? '다년빙' : sicNum > 30 ? '일년빙' : sicNum > 10 ? '신생빙' : '없음';

  return (
    <div className="bp-content">
      <div className="bp-content__left">
        <RioGauge value={rfiNum} level={rioLevel} />
        <div className="bp-info-stack">
          <DataRow label="Ice Class" value={hud.iceClass || 'PC2'} />
          <DataRow label="SIC" value={hud.sic} />
          <DataRow label="빙해상태" value={hud.iceState} />
          <DataRow label="RFI 지수" value={hud.rfi} />
          <DataRow label="수온" value={hud.temp} />
        </div>
      </div>
      <div className="bp-divider" />
      <div className="bp-content__right bp-cards">
        <InfoCard label="해빙 농도" value={hud.sic} unit="%" />
        <InfoCard label="해빙 두께" value={sicNum > 30 ? (sicNum / 50).toFixed(1) : '0.0'} unit="m" />
        <InfoCard label="해빙 유형" value={iceType} />
        <InfoCard label="POLARIS RIO" value={rfiNum.toFixed(1)} accent={rioLevel === 'safe' ? '#27ae60' : rioLevel === 'warning' ? '#f39c12' : '#e74c3c'} />
      </div>
    </div>
  );
}

/* ── Tab 2: Ship Weather Info ── */
function WeatherInfoPanel({ hud }) {
  const windSpeed = (parseFloat(hud.hs) * 3.2 + 1.5).toFixed(1);
  const windDir = Math.round(180 + Math.random() * 60);
  const visibility = parseFloat(hud.hs) > 2 ? '5.0 km' : '10+ km';
  const pressure = (1013 - parseFloat(hud.hs) * 3).toFixed(0);

  return (
    <div className="bp-content">
      <div className="bp-content__left bp-cards" style={{ flexWrap: 'wrap', maxWidth: 180 }}>
        <InfoCard label="파고 Hs" value={hud.hs} accent="#5fa8f5" />
        <InfoCard label="풍속" value={windSpeed} unit="m/s" />
        <InfoCard label="풍향" value={windDir + '°'} />
        <InfoCard label="수온" value={hud.temp} accent={parseFloat(hud.temp) < 0 ? '#4ecdc4' : '#f39c12'} />
      </div>
      <div className="bp-divider" />
      <div className="bp-content__right bp-info-stack">
        <DataRow label="Roll" value={hud.roll} />
        <DataRow label="Pitch" value={hud.pitch} />
        <DataRow label="해역 상태" value={hud.seaLabel} />
        <DataRow label="시정" value={visibility} />
        <DataRow label="기압" value={pressure + ' hPa'} />
      </div>
    </div>
  );
}

/* ── Tab 3: Ship Design Info ── */
function DesignInfoPanel({
  specs, onSpecChange, onPresetLoad, onApply,
  evaluationResult, onEvaluate, onRecenter,
}) {
  return (
    <div className="bp-content bp-content--design">
      {/* 좌: 선종 + 선박 제원 */}
      <div className="bp-content__col">
        <span className="bp-design__col-title">선박 제원 설정</span>
        <div className="bp-design__presets">
          <button className="bp-design__preset-btn" onClick={() => onPresetLoad('icebreaker')}>쇄빙선</button>
          <button className="bp-design__preset-btn" onClick={() => onPresetLoad('lng')}>LNG운반선</button>
          <button className="bp-design__preset-btn" onClick={() => onPresetLoad('container')}>컨테이너</button>
        </div>
        <div className="bp-design__fields">
          <DesignField label="배수량" value={specs.displacement} unit="톤"
            onChange={v => onSpecChange('displacement', Number(v))} />
          <DesignField label="LOA" value={specs.length} unit="m"
            onChange={v => onSpecChange('length', Number(v))} />
          <DesignField label="Beam" value={specs.width} unit="m"
            onChange={v => onSpecChange('width', Number(v))} />
          <DesignField label="GM" value={specs.gm} unit="m"
            onChange={v => onSpecChange('gm', Number(v))} />
          <DesignField label="Draft" value={specs.draft || 8.5} unit="m"
            onChange={v => onSpecChange('draft', Number(v))} />
          <div className="bp-design__field">
            <span className="bp-design__field-label">Ice Class</span>
            <select className="bp-design__select" value={specs.iceClass}
              onChange={e => onSpecChange('iceClass', e.target.value)}>
              <option value="PC1">PC1</option><option value="PC2">PC2</option>
              <option value="PC3">PC3</option><option value="PC4">PC4</option>
              <option value="PC5">PC5</option><option value="PC6">PC6</option>
              <option value="PC7">PC7</option><option value="NONE">일반</option>
            </select>
          </div>
        </div>
      </div>
      <div className="bp-divider" />
      {/* 중: POLAR CODE + 체크리스트 */}
      <div className="bp-content__col">
        <span className="bp-design__col-title">POLAR CODE 안전 설계 기준</span>
        <DesignField label="Draft" value={specs.draft || 8.5} unit="m"
          onChange={v => onSpecChange('draft', Number(v))} />
        <DesignField label="Rescue" value="7" unit="일" onChange={() => {}} />
        <DesignField label="온도여유" value="12" unit="°C" onChange={() => {}} />
        <span className="bp-design__col-title" style={{ marginTop: 4 }}>항행 설비 안전 체크리스트</span>
        <div className="bp-design__checks">
          <label><input type="checkbox" defaultChecked /> PWOM 비치</label>
          <label><input type="checkbox" defaultChecked /> NSRA 허가</label>
          <label><input type="checkbox" defaultChecked /> 방한 설비</label>
          <label><input type="checkbox" /> 생존 장비</label>
          <label><input type="checkbox" defaultChecked /> 극지 통신</label>
          <label><input type="checkbox" defaultChecked /> 극지 항해사</label>
        </div>
      </div>
      <div className="bp-divider" />
      {/* 우: 버튼 */}
      <div className="bp-content__col bp-content__col--actions">
        <button className="bp-design__btn bp-design__btn--primary" onClick={onApply}>
          제원 데이터 적용
        </button>
        <button className="bp-design__btn" onClick={onRecenter}>
          선박 위치로 복귀
        </button>
      </div>
    </div>
  );
}

function DesignField({ label, value, unit, onChange }) {
  return (
    <div className="bp-design__field">
      <span className="bp-design__field-label">{label}</span>
      <input className="bp-design__input" type="number" value={value}
        onChange={e => onChange(e.target.value)} />
      <span className="bp-design__field-unit">{unit}</span>
    </div>
  );
}

/* ── Tab 4: Ship Service Info ── */
function ServiceInfoPanel({ hud, currentRoute, evaluationResult }) {
  const routeData = [
    { name: 'NSR', dist: '7,200', days: '14', cost: '$280K', co2: '1,840t' },
    { name: 'NWP', dist: '8,100', days: '16', cost: '$320K', co2: '2,070t' },
    { name: 'TSR', dist: '6,900', days: '13', cost: '$260K', co2: '1,760t' },
    { name: 'SUEZ', dist: '11,200', days: '22', cost: '$450K', co2: '2,860t' },
    { name: 'CAPE', dist: '14,500', days: '30', cost: '$580K', co2: '3,710t' },
  ];

  const currDist = evaluationResult?.distances?.current || 7200;
  const suezDist = evaluationResult?.distances?.suez || 11200;
  const savedDist = suezDist - currDist;
  const savedDays = Math.round(savedDist / (7200 / 14));

  return (
    <div className="bp-content">
      <div className="bp-content__left">
        <SpeedGauge speed={hud.speed} />
        <div className="bp-info-stack">
          <DataRow label="침로" value={(parseFloat(hud.position?.split(',')[1]) || 0).toFixed(0) + '°T'} />
          <DataRow label="진행률" value={hud.progress} />
          <DataRow label="스로틀" value={hud.throttle} />
          <DataRow label="현재단계" value={hud.phase} />
          <DataRow label="위치" value={hud.position} />
          <DataRow label="빙결상태" value={hud.iceState} />
        </div>
      </div>
      <div className="bp-divider" />
      <div className="bp-content__right" style={{ overflow: 'hidden' }}>
        <span className="bp-service__table-title">Route Comparison</span>
        <table className="bp-service__table">
          <thead>
            <tr><th>항로</th><th>거리</th><th>소요</th><th>비용</th><th>CO₂</th></tr>
          </thead>
          <tbody>
            {routeData.map(r => (
              <tr key={r.name} className={r.name === currentRoute ? 'bp-service__row--active' : ''}>
                <td>{r.name}</td><td>{r.dist}</td><td>{r.days}일</td><td>{r.cost}</td><td>{r.co2}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bp-service__savings">
          <InfoCard label="거리 절감" value={savedDist.toLocaleString()} unit="km" accent="#27ae60" />
          <InfoCard label="소요일 절감" value={savedDays > 0 ? savedDays : 0} unit="일" accent="#27ae60" />
        </div>
      </div>
    </div>
  );
}

/* ── Main BottomPanel ── */
export default function BottomPanel({
  hud,
  specs,
  onSpecChange,
  onPresetLoad,
  onApply,
  onRecenter,
  evaluationResult,
  onEvaluate,
  currentRoute,
}) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="bp">
      {/* Tab Header */}
      <div className="bp-tabs">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            className={`bp-tabs__btn ${activeTab === i ? 'bp-tabs__btn--active' : ''}`}
            onClick={() => setActiveTab(i)}
          >
            {tab}
          </button>
        ))}
      </div>
      {/* Tab Content */}
      <div className="bp-panel">
        {activeTab === 0 && <IceInfoPanel hud={hud} />}
        {activeTab === 1 && <WeatherInfoPanel hud={hud} />}
        {activeTab === 2 && (
          <DesignInfoPanel
            specs={specs}
            onSpecChange={onSpecChange}
            onPresetLoad={onPresetLoad}
            onApply={onApply}
            onRecenter={onRecenter}
            evaluationResult={evaluationResult}
            onEvaluate={onEvaluate}
          />
        )}
        {activeTab === 3 && (
          <ServiceInfoPanel
            hud={hud}
            currentRoute={currentRoute}
            evaluationResult={evaluationResult}
          />
        )}
      </div>
    </div>
  );
}
