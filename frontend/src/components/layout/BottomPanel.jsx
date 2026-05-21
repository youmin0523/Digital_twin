// //! [Original Code] import React, { useState } from 'react';
// //* [Modified Code] useRef, useCallback, useEffect 추가 (Portal 기반 툴팁용 + ML 연료 비교)
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import './BottomPanel.css';
import {
  NSR_MAX_DRAFT,
  NSR_MAX_BEAM,
  MIN_RESCUE_DAYS,
  MIN_TEMP_MARGIN,
} from '../../services/polarisRIO';
import { compareFuelCost } from '../../services/api';

const DEFAULT_CHECKS = {
  pwom: true,
  nsra: true,
  winter: true,
  zeroDis: false,
  comms: true,
  navigator: true,
  sanctioned: false,
  coldRoute: false,
};

/* ── RIO 게이지 SVG (compact 65x55) ── */
function RioGauge({ value, level }) {
  const color =
    level === 'safe' ? '#27ae60' : level === 'warning' ? '#f39c12' : '#e74c3c';
  const label =
    level === 'safe' ? '낮음' : level === 'warning' ? '보통' : '높음';
  const angle = Math.min(1, Math.max(0, value / 10)) * 180;
  const rad = ((angle - 180) * Math.PI) / 180;
  const x = 32 + 22 * Math.cos(rad);
  const y = 38 + 22 * Math.sin(rad);
  return (
    <svg width="65" height="55" viewBox="0 0 65 55" className="gauge-svg">
      <path
        d="M 10 38 A 22 22 0 0 1 54 38"
        fill="none"
        stroke="#1a2a4a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M 10 38 A 22 22 0 0 1 54 38"
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(angle / 180) * 69} 69`}
      />
      <circle cx={x} cy={y} r="2.5" fill={color} />
      <text
        x="32"
        y="34"
        textAnchor="middle"
        fill={color}
        fontSize="13"
        fontWeight="700"
      >
        {(value || 0).toFixed(1)}
      </text>
      <text x="32" y="45" textAnchor="middle" fill="#6a89b8" fontSize="7">
        {label}
      </text>
      <text x="32" y="53" textAnchor="middle" fill="#4a6490" fontSize="6">
        POLARIS RIO
      </text>
    </svg>
  );
}

/* ── 속력 게이지 SVG (compact 65x55) ── */
function SpeedGauge({ speed }) {
  const kn = parseFloat(speed) || 0;
  const pct = Math.min(1, kn / 25);
  const angle = pct * 180;
  const rad = ((angle - 180) * Math.PI) / 180;
  const x = 32 + 22 * Math.cos(rad);
  const y = 38 + 22 * Math.sin(rad);
  return (
    <svg width="65" height="55" viewBox="0 0 65 55" className="gauge-svg">
      <path
        d="M 10 38 A 22 22 0 0 1 54 38"
        fill="none"
        stroke="#1a2a4a"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M 10 38 A 22 22 0 0 1 54 38"
        fill="none"
        stroke="#4ecdc4"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(angle / 180) * 69} 69`}
      />
      <circle cx={x} cy={y} r="2.5" fill="#4ecdc4" />
      <text
        x="32"
        y="34"
        textAnchor="middle"
        fill="#fff"
        fontSize="13"
        fontWeight="700"
      >
        {kn.toFixed(1)}
      </text>
      <text x="32" y="45" textAnchor="middle" fill="#6a89b8" fontSize="7">
        kn
      </text>
    </svg>
  );
}

/* ── 정보 카드 ── */
function InfoCard({ label, value, unit, accent }) {
  return (
    <div className="bp-card">
      <span className="bp-card__label">{label}</span>
      <span
        className="bp-card__value"
        style={accent ? { color: accent } : undefined}
      >
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

/* ── 입력 필드 (Design) ── */
function DesignField({ label, value, unit, onChange }) {
  return (
    <div className="bp-design__field">
      <span className="bp-design__field-label">{label}</span>
      <span className="bp-design__field-value">
        <input
          className="bp-design__input"
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span className="bp-design__field-unit">{unit}</span>}
      </span>
    </div>
  );
}

/* ── Tab 1: Ship Ice & Weather ── */
function IceWeatherPanel({ hud }) {
  const sicNum = parseFloat(hud.sic) || 0;
  const rfiNum = parseFloat(hud.rfi) || 0;
  const rioLevel = sicNum < 15 ? 'safe' : sicNum < 40 ? 'warning' : 'danger';
  const windSpeed = (parseFloat(hud.hs) * 3.2 + 1.5).toFixed(1);
  const windDir = Math.round(180 + Math.random() * 60);

  return (
    <div className="bp-content" style={{ justifyContent: 'space-between', gap: 6 }}>
      <RioGauge value={rfiNum} level={rioLevel} />
      <div className="bp-info-stack" style={{ flex: '0 1 auto', minWidth: 0 }}>
        <DataRow label="Ice Class" value={hud.iceClass || 'PC2'} />
        <DataRow label="SIC" value={hud.sic} />
        <DataRow label="빙해상태" value={hud.iceState} />
        <DataRow label="RFI 지수" value={hud.rfi} />
        <DataRow label="해측상태" value={hud.seaLabel} />
      </div>
      <div className="bp-divider" />
      <div className="bp-cards" style={{ flex: '0 1 auto', minWidth: 0 }}>
        <InfoCard label="해빙 농도" value={hud.sic} unit="%" />
        <InfoCard
          label="해빙 두께"
          value={sicNum > 30 ? (sicNum / 50).toFixed(1) : '0.0'}
          unit="m"
        />
        <InfoCard
          label="POLARIS RIO"
          value={rfiNum.toFixed(1)}
          accent={
            rioLevel === 'safe'
              ? '#27ae60'
              : rioLevel === 'warning'
                ? '#f39c12'
                : '#e74c3c'
          }
        />
      </div>
      <div className="bp-divider" />
      <div className="bp-info-stack" style={{ flex: '0 1 auto', minWidth: 0 }}>
        <DataRow label="파고 Hs" value={hud.hs} />
        <DataRow label="가시거리" value={hud.vis} />
        <DataRow label="풍속" value={windSpeed + ' m/s'} />
        <DataRow label="풍향" value={windDir + '°'} />
        <DataRow label="수온" value={hud.temp} />
        <DataRow label="Roll / Pitch" value={`${hud.roll} / ${hud.pitch}`} />
      </div>
    </div>
  );
}

/* ── Tab 2: Ship Design Info ── */
function DesignInfoPanel({
  specs,
  onSpecChange,
  onPresetLoad,
  onApply,
  onRecenter,
  currentRoute,
  onRouteChange,
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
      <div className="bp-content__col">
        <span className="bp-design__col-title">선박 제원 설정</span>
        <div className="bp-design__presets">
          <button
            className="bp-design__preset-btn"
            onClick={() => onPresetLoad('bulk')}
          >
            벌크선
          </button>
          <button
            className="bp-design__preset-btn"
            onClick={() => onPresetLoad('lng')}
          >
            LNG운반선
          </button>
          <button
            className="bp-design__preset-btn"
            onClick={() => onPresetLoad('container')}
          >
            컨테이너
          </button>
        </div>
        <div className="bp-design__fields">
          <DesignField
            label="배수량"
            value={specs.displacement}
            unit="톤"
            onChange={(v) => onSpecChange('displacement', Number(v))}
          />
          <DesignField
            label="LOA"
            value={specs.length}
            unit="m"
            onChange={(v) => onSpecChange('length', Number(v))}
          />
          <DesignField
            label="Beam"
            value={specs.width}
            unit="m"
            onChange={(v) => onSpecChange('width', Number(v))}
          />
          <DesignField
            label="GM"
            value={specs.gm}
            unit="m"
            onChange={(v) => onSpecChange('gm', Number(v))}
          />
          <DesignField
            label="Draft"
            value={specs.draft || 8.5}
            unit="m"
            onChange={(v) => onSpecChange('draft', Number(v))}
          />
          <div className="bp-design__field">
            <span className="bp-design__field-label">Ice Class</span>
            <span className="bp-design__field-value">
              <select
                className="bp-design__select"
                value={specs.iceClass}
                onChange={(e) => onSpecChange('iceClass', e.target.value)}
              >
                <option value="PC1">PC1</option>
                <option value="PC2">PC2</option>
                <option value="PC3">PC3</option>
                <option value="PC4">PC4</option>
                <option value="PC5">PC5</option>
                <option value="PC6">PC6</option>
                <option value="PC7">PC7</option>
                <option value="NONE">일반</option>
              </select>
            </span>
          </div>
        </div>
      </div>
      <div className="bp-divider" />
      <div className="bp-content__col">
        <span className="bp-design__col-title">POLAR CODE 안전 설계 기준</span>
        <div className="bp-design__fields">
          <DesignField
            label="Draft"
            value={specs.draft || 8.5}
            unit="m"
            onChange={(v) => onSpecChange('draft', Number(v))}
          />
          <DesignField
            label="Rescue"
            value={rescueDays}
            unit="일"
            onChange={(v) => setRescueDays(Number(v))}
          />
          <DesignField
            label="온도여유"
            value={tempMargin}
            unit="°C"
            onChange={(v) => setTempMargin(Number(v))}
          />
        </div>
        <span className="bp-design__col-title" style={{ marginTop: 4 }}>
          항행 설비 안전 체크리스트
        </span>
        <div className="bp-design__checks">
          <label>
            <input
              type="checkbox"
              checked={checks.pwom}
              onChange={() => toggleCheck('pwom')}
            />{' '}
            PWOM 비치
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.nsra}
              onChange={() => toggleCheck('nsra')}
            />{' '}
            NSRA 허가
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.winter}
              onChange={() => toggleCheck('winter')}
            />{' '}
            방한 설비
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.zeroDis}
              onChange={() => toggleCheck('zeroDis')}
            />{' '}
            생존 장비
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.comms}
              onChange={() => toggleCheck('comms')}
            />{' '}
            극지 통신
          </label>
          <label>
            <input
              type="checkbox"
              checked={checks.navigator}
              onChange={() => toggleCheck('navigator')}
            />{' '}
            극지 항해사
          </label>
        </div>
      </div>
      <div className="bp-divider" />
      <div className="bp-content__col bp-content__col--actions">
        <div className="bp-design__route-selector">
          <span className="bp-design__route-label">목표 항로</span>
          <select
            className="bp-design__route-select"
            value={currentRoute}
            onChange={e => onRouteChange(e.target.value)}
          >
            <option value="NSR">북동항로 (NSR)</option>
            <option value="NWP">북서항로 (NWP)</option>
            <option value="TSR">북극횡단항로 (TSR)</option>
            <option value="SUEZ">수에즈 운하 (SUEZ)</option>
            <option value="CAPE">희망봉 우회 (CAPE)</option>
            <option value="ETC">직항 (ETC)</option>
          </select>
        </div>
        <button
          className="bp-design__btn bp-design__btn--primary"
          onClick={handleApplyClick}
        >
          제원 데이터 적용
        </button>
        <button className="bp-design__btn" onClick={onRecenter}>
          선박 위치로 복귀
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   //* [Modified Code] React Portal 기반 Hover 툴팁
   - CSS overflow 체인에 영향받지 않도록 document.body에 직접 렌더링
   - getBoundingClientRect()로 배지 위치 기준 동적 좌표 계산
   ══════════════════════════════════════════════════════ */
function EvalTooltipPortal({ anchorRect, evaluationResult }) {
  if (!anchorRect) return null;

  const tooltipW = 300;
  const tooltipH = 220;
  const gap = 10;

  // //* [Modified Code] 배지 위에 툴팁을 표시하되, 화면 상단을 넘으면 아래로 전환
  let top = anchorRect.top - tooltipH - gap;
  let arrowDir = 'down'; // 화살표가 아래를 가리킴
  if (top < 8) {
    top = anchorRect.bottom + gap;
    arrowDir = 'up'; // 화면 상단 공간 부족 → 아래에 표시, 화살표 위로
  }

  let left = anchorRect.left + anchorRect.width / 2 - tooltipW / 2;
  if (left < 8) left = 8;
  if (left + tooltipW > window.innerWidth - 8)
    left = window.innerWidth - tooltipW - 8;

  const arrowLeft = anchorRect.left + anchorRect.width / 2 - left;

  return ReactDOM.createPortal(
    <div className="bp-portal-tooltip" style={{ top, left, width: tooltipW }}>
      {/* 화살표 */}
      <div
        className={`bp-portal-tooltip__arrow bp-portal-tooltip__arrow--${arrowDir}`}
        style={{ left: arrowLeft }}
      />
      {/* 내용 */}
      <div className="bp-portal-tooltip__header">
        <span className="bp-portal-tooltip__icon">⚠</span>
        <span>부적합 상세 분석</span>
      </div>
      <div className="bp-portal-tooltip__body">
        <div className="bp-portal-tooltip__section">
          <span className="bp-portal-tooltip__label">판정 사유</span>
          <p className="bp-portal-tooltip__reason">{evaluationResult.reason}</p>
        </div>
        <div className="bp-portal-tooltip__divider" />
        <div className="bp-portal-tooltip__section">
          <span className="bp-portal-tooltip__label">
            NSR 운항 필수 조건 (POLAR CODE)
          </span>
          <ul className="bp-portal-tooltip__list">
            <li>
              <span>최대 허용 흘수</span>
              <strong>{NSR_MAX_DRAFT}m</strong>
            </li>
            <li>
              <span>최대 허용 선폭</span>
              <strong>{NSR_MAX_BEAM}m</strong>
            </li>
            <li>
              <span>최소 생존 장비</span>
              <strong>{MIN_RESCUE_DAYS}일</strong>
            </li>
            <li>
              <span>설계 온도 여유</span>
              <strong>{MIN_TEMP_MARGIN}°C</strong>
            </li>
            <li>
              <span>필수 설비</span>
              <strong>PWOM, NSRA, 방한, 극지통신</strong>
            </li>
          </ul>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Tab 3: Ship Service Info ── */
function ServiceInfoPanel({ hud, currentRoute, evaluationResult, specs, araon }) {
  // //* [Modified Code] Portal 툴팁 상태 관리
  const [tooltipRect, setTooltipRect] = useState(null);

  // ── ML 연료 비교 상태 ──────────────────────────────────────
  const [fuelData, setFuelData] = useState(null);
  const [fuelLoading, setFuelLoading] = useState(false);
  const [fuelError, setFuelError] = useState(null);
  const badgeRef = useRef(null);

  const handleBadgeEnter = useCallback(() => {
    if (badgeRef.current) {
      setTooltipRect(badgeRef.current.getBoundingClientRect());
    }
  }, []);
  const handleBadgeLeave = useCallback(() => setTooltipRect(null), []);

  // ── 선종 매핑 (shipSpecs.type → API vessel_type) ────────────
  const vesselTypeMap = { bulk: 'bulk', lng_tanker: 'lng', container: 'container' };
  const iceClassCodeMap = { PC2: 2, PC3: 3, PC4: 4, PC5: 5, PC6: 6, PC7: 7, NONE: 0 };
  // 선종별 기본 엔진 출력 (kW)
  const defaultEnginePower = { bulk: 18000, lng_tanker: 37000, container: 28000 };

  // NSR 항로 거리 (해리) — ai-pipeline/config.py 기준
  const routeDistanceNm = { NSR: 7200, NWP: 8100, TSR: 6600 };

  // ── ML 연료 비교 API 호출 ──────────────────────────────────
  useEffect(() => {
    if (!specs) return;
    const arcticRoutes = ['NSR', 'NWP', 'TSR'];
    if (!arcticRoutes.includes(currentRoute)) {
      setFuelData(null);
      return;
    }

    const vtype = vesselTypeMap[specs.type] || 'container';
    const iceCode = iceClassCodeMap[specs.iceClass] || 0;
    const enginePower = defaultEnginePower[specs.type] || 28000;
    const nsrDist = routeDistanceNm[currentRoute] || 7200;

    // 현재 SIC(빙하 농도)를 HUD에서 가져옴
    const sicStr = hud.sic || '0%';
    const sicVal = parseFloat(sicStr) / 100 || 0;
    // 빙하 두께는 농도에 기반한 추정값
    const iceThickness = Math.min(3.0, 0.3 + 2.0 * Math.pow(sicVal, 1.5));

    setFuelLoading(true);
    setFuelError(null);
    compareFuelCost({
      displacement: specs.displacement || 20000,
      draft: specs.draft || 8.5,
      engine_power: enginePower,
      ice_class_code: iceCode,
      nsr_ice_thickness: iceThickness,
      nsr_ice_concentration: sicVal,
      nsr_distance_nm: nsrDist,
      suez_distance_nm: 12400,
      vessel_type: vtype,
      speed_knots: 14.0,
    })
      .then((data) => {
        setFuelData(data);
        setFuelLoading(false);
      })
      .catch((err) => {
        setFuelError(err.message);
        setFuelLoading(false);
      });
  }, [specs?.type, specs?.displacement, specs?.draft, specs?.iceClass, currentRoute, hud.sic]);

  const allRoutes = [
    { name: 'NSR', dist: 7200, days: 14, cost: 280, co2: 1840, arctic: true },
    { name: 'NWP', dist: 8100, days: 16, cost: 320, co2: 2070, arctic: true },
    { name: 'TSR', dist: 6900, days: 13, cost: 260, co2: 1760, arctic: true },
    {
      name: 'SUEZ',
      dist: 11200,
      days: 22,
      cost: 450,
      co2: 2860,
      arctic: false,
    },
    {
      name: 'CAPE',
      dist: 14500,
      days: 30,
      cost: 580,
      co2: 3710,
      arctic: false,
    },
  ];

  const st = evaluationResult?.status || '';
  const isSuitable = st === 'NSR_APPROVED' || st === 'NSR_RESTRICTED';
  const isPending = !evaluationResult;
  const visibleRoutes = isPending
    ? allRoutes
    : isSuitable
      ? allRoutes
      : allRoutes.filter((r) => !r.arctic);

  const currentRouteData = allRoutes.find((r) => r.name === currentRoute);
  const suezRoute = allRoutes.find((r) => r.name === 'SUEZ');
  const savedDist =
    isSuitable && currentRouteData && suezRoute
      ? suezRoute.dist - currentRouteData.dist
      : 0;
  const savedDays =
    isSuitable && currentRouteData && suezRoute
      ? suezRoute.days - currentRouteData.days
      : 0;
  const savedCost =
    isSuitable && currentRouteData && suezRoute
      ? suezRoute.cost - currentRouteData.cost
      : 0;
  const savedCo2 =
    isSuitable && currentRouteData && suezRoute
      ? suezRoute.co2 - currentRouteData.co2
      : 0;

  const statusLabel = {
    NSR_APPROVED: '북극항로 운항 적합',
    NSR_RESTRICTED: '조건부 운항 허가',
    REROUTE_SUEZ: '북극항로 부적합 — 수에즈 우회',
    REROUTE_CAPE: '북극항로 부적합 — 희망봉 우회',
  };
  const statusColor = {
    NSR_APPROVED: '#27ae60',
    NSR_RESTRICTED: '#f39c12',
    REROUTE_SUEZ: '#e74c3c',
    REROUTE_CAPE: '#e74c3c',
  };

  return (
    <div className="bp-content bp-content--service">
      <SpeedGauge speed={hud.speed} />
      <div
        className="bp-info-stack bp-info-stack--compact"
        style={{ minWidth: 140, paddingTop: 4 }}
      >
        <DataRow
          label="침로"
          value={
            (parseFloat(hud.position?.split(',')[1]) || 0).toFixed(0) + '°T'
          }
        />
        <DataRow label="진행률" value={hud.progress} />
        <DataRow label="스로틀" value={hud.throttle} />
        <DataRow label="현재단계" value={hud.phase} />
        <DataRow label="위치" value={hud.position} />
        <DataRow label="빙결상태" value={hud.iceState} />
        {/* ── 아라온호 (KOPRI 한국 유일 쇄빙선) ────────────────── */}
        <div
          style={{
            marginTop: 6,
            paddingTop: 4,
            borderTop: '1px dashed rgba(34, 211, 238, 0.4)',
            fontSize: 10,
          }}
        >
          <div
            style={{
              color: '#22d3ee',
              fontWeight: 600,
              marginBottom: 3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            🚢 아라온 (KOPRI)
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 6,
              padding: '1px 0',
            }}
          >
            <span style={{ color: '#94a3b8' }}>좌표</span>
            <span
              style={{
                color: '#e2e8f0',
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
              title={(araon && araon.position) || ''}
            >
              {(araon && araon.position) || '71.0N 179.5E'}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 6,
              padding: '1px 0',
            }}
          >
            <span style={{ color: '#94a3b8' }}>상태</span>
            <span
              style={{
                color: '#e2e8f0',
                whiteSpace: 'nowrap',
              }}
              title={(araon && araon.statusKo) || ''}
            >
              {(araon && araon.statusKo) || '대기'}
            </span>
          </div>
        </div>
      </div>
      <div className="bp-divider" />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          flex: '1 1 180px',
          minWidth: 170,
        }}
      >
        {evaluationResult ? (
          <>
            {/* //* [Modified Code] 배지에 마우스 이벤트 바인딩 → Portal 툴팁 표시 */}
            <div
              ref={badgeRef}
              className="bp-eval-badge"
              style={{
                color: statusColor[evaluationResult.status] || '#6a89b8',
                borderColor: statusColor[evaluationResult.status] || '#1a2a4a',
                marginBottom: 4,
                cursor: 'help',
              }}
              onMouseEnter={handleBadgeEnter}
              onMouseLeave={handleBadgeLeave}
            >
              {statusLabel[evaluationResult.status] || evaluationResult.status}
              {evaluationResult.rioScore != null &&
                ` (RIO ${evaluationResult.rioScore.toFixed(1)})`}
            </div>
            {/* Portal 툴팁 — body에 직접 렌더링되므로 overflow 무관 */}
            {tooltipRect && (
              <EvalTooltipPortal
                anchorRect={tooltipRect}
                evaluationResult={evaluationResult}
              />
            )}
          </>
        ) : (
          <div
            className="bp-eval-badge"
            style={{
              color: '#6a89b8',
              borderColor: '#1a2a4a',
              marginBottom: 4,
            }}
          >
            평가 대기
          </div>
        )}
        <span className="bp-service__table-title">Route Comparison</span>
        <table className="bp-service__table">
          <thead>
            <tr>
              <th>항로</th>
              <th>거리</th>
              <th>소요</th>
              <th>비용</th>
              <th>CO₂</th>
            </tr>
          </thead>
          <tbody>
            {visibleRoutes.map((r) => (
              <tr
                key={r.name}
                className={
                  r.name === currentRoute ? 'bp-service__row--active' : ''
                }
              >
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
      {isSuitable && (
        <>
          <div className="bp-divider" />
          <div className="bp-info-stack" style={{ minWidth: 110 }}>
            <span className="bp-service__table-title">
              {currentRoute} vs SUEZ 절감
            </span>
            <DataRow
              label="거리"
              value={`-${savedDist.toLocaleString()}km`}
              cls="bp-val--save"
            />
            <DataRow
              label="소요일"
              value={`-${savedDays}일`}
              cls="bp-val--save"
            />
            <DataRow
              label="비용"
              value={`-$${savedCost}K`}
              cls="bp-val--save"
            />
            <DataRow
              label="CO₂"
              value={`-${savedCo2.toLocaleString()}t`}
              cls="bp-val--save"
            />
          </div>
        </>
      )}
      {/* ── ML 연료 비용 비교 (XGBoost 예측 기반) ── */}
      {fuelData && !fuelData.error && (
        <>
          <div className="bp-divider" />
          <div style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
            flex: '1 1 200px', minWidth: 190, maxWidth: 260,
          }}>
            <span className="bp-service__table-title" style={{ color: '#f59e0b' }}>
              ML 연료 비용 분석
            </span>
            <table className="bp-service__table" style={{ fontSize: '10px' }}>
              <thead>
                <tr>
                  <th></th>
                  <th style={{ color: '#38bdf8' }}>{currentRoute}</th>
                  <th style={{ color: '#fb923c' }}>SUEZ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ color: '#94a3b8' }}>연료</td>
                  <td>{fuelData.nsr.total_fuel_tons.toLocaleString()}t</td>
                  <td>{fuelData.suez.total_fuel_tons.toLocaleString()}t</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>연료비</td>
                  <td>${(fuelData.nsr.fuel_cost_usd / 1000).toFixed(0)}K</td>
                  <td>${(fuelData.suez.fuel_cost_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>부대비</td>
                  <td>${(fuelData.nsr.additional_cost_usd / 1000).toFixed(0)}K</td>
                  <td>${(fuelData.suez.additional_cost_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ color: '#e2e8f0', fontWeight: 'bold' }}>총비용</td>
                  <td style={{ fontWeight: 'bold' }}>${(fuelData.nsr.total_cost_usd / 1000).toFixed(0)}K</td>
                  <td style={{ fontWeight: 'bold' }}>${(fuelData.suez.total_cost_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr>
                  <td style={{ color: '#94a3b8' }}>소요일</td>
                  <td>{fuelData.nsr.transit_days}일</td>
                  <td>{fuelData.suez.transit_days}일</td>
                </tr>
              </tbody>
            </table>
            {/* 절감 요약 배지 */}
            <div style={{
              marginTop: 4, padding: '4px 8px', borderRadius: 6, fontSize: '10px',
              fontWeight: 'bold', textAlign: 'center',
              background: fuelData.comparison.nsr_is_cheaper
                ? 'rgba(52,211,153,0.15)' : 'rgba(239,68,68,0.15)',
              border: `1px solid ${fuelData.comparison.nsr_is_cheaper
                ? 'rgba(52,211,153,0.3)' : 'rgba(239,68,68,0.3)'}`,
              color: fuelData.comparison.nsr_is_cheaper ? '#34d399' : '#f87171',
            }}>
              {fuelData.comparison.nsr_is_cheaper
                ? `${currentRoute} 선택 시 $${(Math.abs(fuelData.comparison.cost_saving_usd) / 1000).toFixed(0)}K 절감 (${fuelData.comparison.cost_saving_percent}%) · ${Math.abs(fuelData.comparison.time_saving_days)}일 단축`
                : `SUEZ 우회가 $${(Math.abs(fuelData.comparison.cost_saving_usd) / 1000).toFixed(0)}K 저렴`}
            </div>
            {/* NSR 부대비 상세 (에스코트·보험) */}
            {fuelData.nsr.escort_cost_usd > 0 && (
              <div style={{ fontSize: '9px', color: '#64748b', marginTop: 3, paddingLeft: 4 }}>
                쇄빙 에스코트 ${(fuelData.nsr.escort_cost_usd / 1000).toFixed(0)}K
                · 북극해 보험 ${(fuelData.nsr.insurance_cost_usd / 1000).toFixed(0)}K
              </div>
            )}
          </div>
        </>
      )}
      {fuelLoading && (
        <>
          <div className="bp-divider" />
          <div style={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '10px' }}>
            ML 연료 분석 중...
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
  currentRoute,
  onRouteChange,
  onReset,
  araon,
}) {
  return (
    <div className="bp" style={{ position: 'relative' }}>
      <div className="bp-panel bp-panel--triple">
        {/* 좌: Ice & Weather */}
        <div className="bp-section">
          <div className="bp-section__title bp-section__title--centered">
            Ship Ice & Weather
          </div>
          <IceWeatherPanel hud={hud} />
        </div>
        <div className="bp-divider" />
        {/* 중: Design */}
        <div className="bp-section">
          <div className="bp-section__title bp-section__title--centered">
            Ship Design Info
          </div>
          <DesignInfoPanel
            specs={specs}
            onSpecChange={onSpecChange}
            onPresetLoad={onPresetLoad}
            onApply={onApply}
            onRecenter={onRecenter}
            currentRoute={currentRoute}
            onRouteChange={onRouteChange}
          />
        </div>
        <div className="bp-divider" />
        {/* 우: Service */}
        <div className="bp-section">
          <div className="bp-section__title bp-section__title--centered">
            {/* TREND REPORT / FUEL ANALYSIS 토글은 상단 메뉴로 이동해 중복 제거됨 */}
            Ship Service Info
            {/* //* [Modified Code] 초기화 아이콘 버튼 */}
            <button
              className="bp-reset-btn"
              onClick={onReset}
              title="평가 데이터 리셋"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
          </div>
          <ServiceInfoPanel
            hud={hud}
            currentRoute={currentRoute}
            evaluationResult={evaluationResult}
            specs={specs}
            araon={araon}
          />
        </div>
      </div>
    </div>
  );
}
