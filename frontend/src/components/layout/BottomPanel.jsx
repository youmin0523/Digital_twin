import React, { useState } from 'react';

const DEFAULT_CHECKS = {
  pwom: true, nsra: true, winter: true, zeroDis: false,
  comms: true, navigator: true, sanctioned: false, coldRoute: false,
};
import './BottomPanel.css';

const TABS = ['Ship Ice & Weather', 'Ship Design Info', 'Ship Service Info'];

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

/* ── Tab 1: Ship Ice & Weather (통합) ── */
function IceWeatherPanel({ hud }) {
  const sicNum = parseFloat(hud.sic) || 0;
  const rfiNum = parseFloat(hud.rfi) || 0;
  const rioLevel = sicNum < 15 ? 'safe' : sicNum < 40 ? 'warning' : 'danger';
  const iceType = sicNum > 70 ? '다년빙' : sicNum > 30 ? '일년빙' : sicNum > 10 ? '신생빙' : '없음';
  const windSpeed = (parseFloat(hud.hs) * 3.2 + 1.5).toFixed(1);
  const windDir = Math.round(180 + Math.random() * 60);
  const visibility = parseFloat(hud.hs) > 2 ? '5.0 km' : '10+ km';
  const pressure = (1013 - parseFloat(hud.hs) * 3).toFixed(0);

  return (
    <div className="bp-content">
      {/* 좌: RIO 게이지 + 해빙 정보 */}
      <RioGauge value={rfiNum} level={rioLevel} />
      <div className="bp-info-stack" style={{ width: 150 }}>
        <DataRow label="Ice Class" value={hud.iceClass || 'PC2'} />
        <DataRow label="SIC" value={hud.sic} />
        <DataRow label="빙해상태" value={hud.iceState} />
        <DataRow label="RFI 지수" value={hud.rfi} />
        <DataRow label="해빙 유형" value={iceType} />
      </div>
      <div className="bp-divider" />
      {/* 중: 해빙 카드 */}
      <div className="bp-cards">
        <InfoCard label="해빙 농도" value={hud.sic} unit="%" />
        <InfoCard label="해빙 두께" value={sicNum > 30 ? (sicNum / 50).toFixed(1) : '0.0'} unit="m" />
        <InfoCard label="POLARIS RIO" value={rfiNum.toFixed(1)} accent={rioLevel === 'safe' ? '#27ae60' : rioLevel === 'warning' ? '#f39c12' : '#e74c3c'} />
      </div>
      <div className="bp-divider" />
      {/* 우: 기상 정보 */}
      <div className="bp-info-stack" style={{ minWidth: 190 }}>
        <DataRow label="파고 Hs" value={hud.hs} />
        <DataRow label="풍속" value={windSpeed + ' m/s'} />
        <DataRow label="수온" value={hud.temp} />
        <DataRow label="Roll / Pitch" value={`${hud.roll} / ${hud.pitch}`} />
        <DataRow label="해역 상태" value={hud.seaLabel} />
        <DataRow label="시정 / 기압" value={`${visibility} / ${pressure}hPa`} />
      </div>
    </div>
  );
}

/* ── Tab 3: Ship Design Info ── */
function DesignInfoPanel({
  specs, onSpecChange, onPresetLoad, onApply, onRecenter,
}) {
  const [rescueDays, setRescueDays] = useState(7);
  const [tempMargin, setTempMargin] = useState(12);
  const [checks, setChecks] = useState(DEFAULT_CHECKS);

  const toggleCheck = (key) =>
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleApplyClick = () =>
    onApply({ draft: specs.draft || 8.5, rescueDays, tempMargin, checks });

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
        <DesignField label="Rescue" value={rescueDays} unit="일"
          onChange={v => setRescueDays(Number(v))} />
        <DesignField label="온도여유" value={tempMargin} unit="°C"
          onChange={v => setTempMargin(Number(v))} />
        <span className="bp-design__col-title" style={{ marginTop: 4 }}>항행 설비 안전 체크리스트</span>
        <div className="bp-design__checks">
          <label><input type="checkbox" checked={checks.pwom} onChange={() => toggleCheck('pwom')} /> PWOM 비치</label>
          <label><input type="checkbox" checked={checks.nsra} onChange={() => toggleCheck('nsra')} /> NSRA 허가</label>
          <label><input type="checkbox" checked={checks.winter} onChange={() => toggleCheck('winter')} /> 방한 설비</label>
          <label><input type="checkbox" checked={checks.zeroDis} onChange={() => toggleCheck('zeroDis')} /> 생존 장비</label>
          <label><input type="checkbox" checked={checks.comms} onChange={() => toggleCheck('comms')} /> 극지 통신</label>
          <label><input type="checkbox" checked={checks.navigator} onChange={() => toggleCheck('navigator')} /> 극지 항해사</label>
        </div>
      </div>
      <div className="bp-divider" />
      {/* 우: 버튼 */}
      <div className="bp-content__col bp-content__col--actions">
        <button className="bp-design__btn bp-design__btn--primary" onClick={handleApplyClick}>
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
  const allRoutes = [
    { name: 'NSR', dist: 7200, days: 14, cost: 280, co2: 1840, arctic: true },
    { name: 'NWP', dist: 8100, days: 16, cost: 320, co2: 2070, arctic: true },
    { name: 'TSR', dist: 6900, days: 13, cost: 260, co2: 1760, arctic: true },
    { name: 'SUEZ', dist: 11200, days: 22, cost: 450, co2: 2860, arctic: false },
    { name: 'CAPE', dist: 14500, days: 30, cost: 580, co2: 3710, arctic: false },
  ];

  // 적합성 판단: NSR_APPROVED 또는 NSR_RESTRICTED → 적합, REROUTE_* → 부적합
  const st = evaluationResult?.status || '';
  const isSuitable = st === 'NSR_APPROVED' || st === 'NSR_RESTRICTED';
  const isPending = !evaluationResult;

  // 적합 → 전체 5행, 부적합 → SUEZ/CAPE만
  const visibleRoutes = isPending ? allRoutes : isSuitable ? allRoutes : allRoutes.filter(r => !r.arctic);

  // 절감 계산 (적합일 때만)
  const currentRouteData = allRoutes.find(r => r.name === currentRoute);
  const suezRoute = allRoutes.find(r => r.name === 'SUEZ');
  const savedDist = isSuitable && currentRouteData && suezRoute ? suezRoute.dist - currentRouteData.dist : 0;
  const savedDays = isSuitable && currentRouteData && suezRoute ? suezRoute.days - currentRouteData.days : 0;
  const savedCost = isSuitable && currentRouteData && suezRoute ? suezRoute.cost - currentRouteData.cost : 0;
  const savedCo2 = isSuitable && currentRouteData && suezRoute ? suezRoute.co2 - currentRouteData.co2 : 0;

  const statusLabel = {
    NSR_APPROVED: '북극항로 운항 적합',
    NSR_RESTRICTED: '조건부 운항 허가',
    REROUTE_SUEZ: '북극항로 부적합 — 수에즈 우회',
    REROUTE_CAPE: '북극항로 부적합 — 희망봉 우회',
  };
  const statusColor = {
    NSR_APPROVED: '#27ae60', NSR_RESTRICTED: '#f39c12',
    REROUTE_SUEZ: '#e74c3c', REROUTE_CAPE: '#e74c3c',
  };

  return (
    <div className="bp-content">
      {/* 좌: 운항 정보 */}
      <SpeedGauge speed={hud.speed} />
      <div className="bp-info-stack" style={{ minWidth: 150 }}>
        <DataRow label="침로" value={(parseFloat(hud.position?.split(',')[1]) || 0).toFixed(0) + '°T'} />
        <DataRow label="진행률" value={hud.progress} />
        <DataRow label="스로틀" value={hud.throttle} />
        <DataRow label="현재단계" value={hud.phase} />
        <DataRow label="위치" value={hud.position} />
        <DataRow label="빙결상태" value={hud.iceState} />
      </div>
      <div className="bp-divider" />
      {/* 중: Route Comparison + 평가 상태 */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, minWidth: 0 }}>
        {/* 평가 배지 */}
        {evaluationResult ? (
          <div className="bp-eval-badge" style={{
            color: statusColor[evaluationResult.status] || '#6a89b8',
            borderColor: statusColor[evaluationResult.status] || '#1a2a4a',
            marginBottom: 4,
          }}>
            {statusLabel[evaluationResult.status] || evaluationResult.status}
            {evaluationResult.rioScore != null && ` (RIO ${evaluationResult.rioScore.toFixed(1)})`}
          </div>
        ) : (
          <div className="bp-eval-badge" style={{ color: '#6a89b8', borderColor: '#1a2a4a', marginBottom: 4 }}>
            평가 대기 — 제원 데이터를 적용하세요
          </div>
        )}
        <span className="bp-service__table-title">Route Comparison</span>
        <table className="bp-service__table">
          <thead>
            <tr><th>항로</th><th>거리</th><th>소요</th><th>비용</th><th>CO₂</th></tr>
          </thead>
          <tbody>
            {visibleRoutes.map(r => (
              <tr key={r.name} className={r.name === currentRoute ? 'bp-service__row--active' : ''}>
                <td>{r.name}</td>
                <td>{r.dist.toLocaleString()}km</td>
                <td>{r.days}일</td>
                <td>${r.cost}K</td>
                <td>{r.co2.toLocaleString()}t</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* 우: 절감 효과 (적합일 때만) */}
      {isSuitable && (
        <>
          <div className="bp-divider" />
          <div className="bp-info-stack" style={{ minWidth: 130 }}>
            <span className="bp-service__table-title">{currentRoute} vs SUEZ 절감</span>
            <DataRow label="거리" value={`-${savedDist.toLocaleString()}km`} cls="bp-val--save" />
            <DataRow label="소요일" value={`-${savedDays}일`} cls="bp-val--save" />
            <DataRow label="비용" value={`-$${savedCost}K`} cls="bp-val--save" />
            <DataRow label="CO₂" value={`-${savedCo2.toLocaleString()}t`} cls="bp-val--save" />
          </div>
        </>
      )}
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
  return (
    <div className="bp">
      <div className="bp-panel bp-panel--triple">
        {/* 좌: Ice & Weather */}
        <div className="bp-section">
          <div className="bp-section__title">Ship Ice & Weather</div>
          <IceWeatherPanel hud={hud} />
        </div>
        <div className="bp-divider" />
        {/* 중: Design */}
        <div className="bp-section">
          <div className="bp-section__title">Ship Design Info</div>
          <DesignInfoPanel
            specs={specs}
            onSpecChange={onSpecChange}
            onPresetLoad={onPresetLoad}
            onApply={onApply}
            onRecenter={onRecenter}
          />
        </div>
        <div className="bp-divider" />
        {/* 우: Service */}
        <div className="bp-section">
          <div className="bp-section__title">Ship Service Info</div>
          <ServiceInfoPanel
            hud={hud}
            currentRoute={currentRoute}
            evaluationResult={evaluationResult}
          />
        </div>
      </div>
    </div>
  );
}
