import React from 'react'; // eslint-disable-line no-unused-vars
import './ShipSpecsSummaryModal.css';

const ROUTE_NAMES = {
  NSR: '북동항로 (NSR)',
  NWP: '북서항로 (NWP)',
  TSR: '북극횡단항로 (TSR)',
  SUEZ: '수에즈 운하',
  CAPE: '희망봉 우회',
};

const CHECK_LABELS = [
  { key: 'pwom', label: 'PWOM 비치' },
  { key: 'nsra', label: 'NSRA 허가' },
  { key: 'winter', label: '방한 설비' },
  { key: 'zeroDis', label: '생존 장비' },
  { key: 'comms', label: '극지 통신' },
  { key: 'navigator', label: '극지 항해사' },
  { key: 'sanctioned', label: '⚠ 제재국가' },
  { key: 'coldRoute', label: '기온 -10°C↓' },
];

/* ── 2.5D Ship Diagram (고도화: 프리미엄 디지털 트윈 스타일) ── */
// //! [Original Code] 단순 기하학적 형태의 장황한 SVG Ship Diagram (Line 24-553)
/* 
function ShipDiagram({ specs }) { ... } 
*/

// //* [Modified Code] 고합성 SVG 아키텍처 및 실시간 애니메이션이 적용된 프리미엄 ShipDiagram
// //* [Modified Code] 치수선(Dimline) 시스템이 도입되어 공학적 가독성이 강화된 ShipDiagram
function ShipDiagram({ specs }) {
  const len   = (specs?.length  || 160).toFixed(1);
  const beam  = (specs?.width   || 30 ).toFixed(1);
  const draft = (specs?.draft   || 8.5).toFixed(1);
  const iceClass  = specs?.iceClass || 'PC1';
  const iceIsNone = iceClass === 'NONE';
  const shipType = specs?.type || 'icebreaker';

  // ── 선종별 스타일 설정 ──────────────────────────
  const styles = {
    icebreaker: {
      hullGrad: ['#c53030', '#9b2c2c', '#63171b'], // Red
      cargo: 'icebreaker',
      deck: '#4a5568'
    },
    lng: {
      hullGrad: ['#2b6cb0', '#2c5282', '#1a365d'], // Blue
      cargo: 'lng',
      deck: '#2d3748'
    },
    container: {
      hullGrad: ['#4a5568', '#2d3748', '#1a202c'], // Gray/Slate
      cargo: 'container',
      deck: '#2d3748'
    }
  }[shipType] || { hullGrad: ['#2c5282', '#1a365d', '#0a192f'], cargo: 'default', deck: '#4a6a8a' };

  const iceFill   = iceIsNone ? 'rgba(74,90,74,0.45)' : 'rgba(39,140,80,0.65)';
  const iceStroke = iceIsNone ? '#4a5a4a'              : '#2ecc71';
  const iceText   = iceIsNone ? '#8aaa8a'              : '#ffffff';

  return (
    <div className="ssm__diagram">
      <svg style={{ width: '100%', display: 'block' }} viewBox="0 0 520 220" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="hullSideGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={styles.hullGrad[0]} />
            <stop offset="60%"  stopColor={styles.hullGrad[1]} />
            <stop offset="100%" stopColor={styles.hullGrad[2]} />
          </linearGradient>
          <linearGradient id="deckTopGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={styles.deck} />
            <stop offset="100%" stopColor="#1a202c" />
          </linearGradient>
          {/* 브릿지 유리창 광택 */}
          <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#63b3ed" stopOpacity="0.8" />
            <stop offset="50%"  stopColor="#ebf8ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#4299e1" stopOpacity="0.7" />
          </linearGradient>
          <radialGradient id="waterFlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#3182ce" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#2c5282" stopOpacity="0" />
          </radialGradient>
          
          {/* 🏹 화살표 마커 정의 */}
          <marker id="arrowStart" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#63b3ed" />
          </marker>
          <marker id="arrowEnd" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#63b3ed" />
          </marker>

          <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
            <feOffset dx="0" dy="4" result="offsetblur" />
            <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
            <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* 🌊 수면 기반 (Water Surface) */}
        <g className="ssm__water-line">
          <ellipse cx="230" cy="130" rx="220" ry="30" fill="url(#waterFlow)" />
          <path d="M 10,130 Q 120,140 240,130 T 480,130" fill="none" stroke="#4299e1" strokeWidth="0.5" strokeDasharray="12,8" opacity="0.3" />
        </g>

          {/* 🚢 선체 본체 (Ship Group with Bobbing) */}
        <g className="ssm__ship-group" filter="url(#softShadow)">
          {/* 선체 하부 (Boottopping) - 더 깊고 육중하게 */}
          <path d="M 50,122 C 20,122 10,108 10,90 C 10,70 20,68 50,68 L 415,55 C 445,55 465,75 470,85 L 470,115 C 465,125 445,130 415,128 Z" fill="#050a14" opacity="0.7" />
          
          {/* 선체 측면 (Hull Side) - Spoon Bow & Flare 강조 */}
          <path d="M 50,120 L 415,110 C 455,108 468,90 470,80 C 468,72 455,68 415,72 L 50,85 C 20,85 15,100 15,112 C 15,125 35,120 50,120 Z" fill="url(#hullSideGrad)" stroke="#4299e1" strokeWidth="1" />
          
          {/* 갑판 (Main Deck) - 하이라이트 추가 */}
          <path d="M 50,85 L 415,75 C 445,75 460,65 455,55 C 445,45 415,45 385,48 L 50,65 C 25,65 20,75 20,75 C 20,75 25,85 50,85 Z" fill="url(#deckTopGrad)" stroke="#4a6a8a" strokeWidth="1" />

          {/* 📦 화물창/탱크 (Cargo Section) - 웅장함 디테일 */}
          {shipType === 'icebreaker' && (
            <g>
              {/* 유압식 대형 크레인 */}
              <path d="M 230,75 L 245,72 L 242,45 L 227,48 Z" fill="#2d3748" />
              <path d="M 235,45 L 310,25 L 312,30 L 237,48 Z" fill="#4a5568" stroke="#1a202c" strokeWidth="0.5" />
              {/* 헬기 데크 (Safety Netting 효과) */}
              <path d="M 40,82 L 105,80 L 102,65 L 37,68 Z" fill="#2d3748" stroke="#718096" strokeWidth="0.8" />
              <circle cx="71" cy="73" r="8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
              <text x="71" y="76" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="900" opacity="0.9">H</text>
            </g>
          )}

          {shipType === 'lng' && (
            <g>
              {/* 돔형 멤브레인 탱크 */}
              {[125, 195, 265].map((pos, i) => (
                <g key={i}>
                  <path d={`M ${pos},65 Q ${pos+25},35 ${pos+50},65`} fill="#edf2f7" stroke="#cbd5e0" strokeWidth="1.5" />
                  <rect x={pos} y={65} width="50" height="15" fill="#f7fafc" stroke="#cbd5e0" strokeWidth="1.2" />
                  {/* 상단 파이프워크 */}
                  <line x1={pos+5} y1="65" x2={pos+45} y2="65" stroke="#4a5568" strokeWidth="2" />
                </g>
              ))}
            </g>
          )}

          {shipType === 'container' && (
            <g>
              {/* 더 빽빽하고 높은 컨테이너 적재 */}
              {[110, 145, 180, 215, 250, 285].map((pos, i) => (
                <g key={i}>
                  <rect x={pos} y={55 - i*1.2} width="32" height="18" rx="1" fill={['#2b6cb0', '#c53030', '#2f855a'][i % 3]} stroke="rgba(0,0,0,0.3)" />
                  <rect x={pos} y={38 - i*1.2} width="32" height="18" rx="1" fill={['#b7791f', '#6b46c1', '#2c7a7b'][i % 3]} stroke="rgba(0,0,0,0.3)" />
                  <rect x={pos} y={21 - i*1.2} width="32" height="18" rx="1" fill={['#4a5568', '#2d3748', '#e53e3e'][(i+1) % 3]} stroke="rgba(0,0,0,0.3)" />
                </g>
              ))}
            </g>
          )}

          {/* 브릿지 구조물 (Superstructure) - 더 높고 웅장하게 */}
          <path d="M 310,75 L 400,68 L 395,45 L 305,52 Z" fill="#2d3748" stroke="#4299e1" strokeWidth="1" />
          <path d="M 315,52 L 390,48 L 385,25 L 310,30 Z" fill="#4a5568" stroke="#4299e1" strokeWidth="0.8" />
          
          {/* 창문 디테일: 내외부 반사 효과 */}
          {[0,1,2,3,4,5,6].map(idx => (
            <rect key={idx} x={320 + idx * 9} y={38 - idx * 0.4} width="7" height="6" rx="1" fill="url(#glassShine)" />
          ))}
          
          <path d="M 315,25 L 380,22 L 375,10 L 312,13 Z" fill="#1a202c" stroke="#63b3ed" strokeWidth="1.2" />
          <rect x={320} y={14} width="50" height="6" fill="url(#glassShine)" rx="1" />

          {/* 연돌 & 마스트 (Mast & Funnel) */}
          <path d="M 355,23 L 370,21 L 368,8 L 353,10 Z" fill="#171923" stroke="#4a5568" strokeWidth="0.8" />
          <line x1="340" y1="25" x2="340" y2="4" stroke="#cbd5e0" strokeWidth="0.6" />
          <g className="ssm__radar-spinner">
            <line x1="353" y1="5" x2="368" y2="5" stroke="#ecc94b" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="353" cy="5" r="2.5" fill="#2d3748" stroke="#ecc94b" strokeWidth="0.8" />
          </g>

          {/* ⚓ 선수 세부 (Forecastle & Ice Class) */}
          <path d="M 400,54 L 445,51 C 455,51 462,58 458,63 L 415,68 Z" fill="#1a365d" stroke="#3182ce" strokeWidth="0.6" />
          <circle cx="448" cy="58" r="3" fill="#000" opacity="0.5" />
          {!iceIsNone && <path d="M 465,80 L 472,88 L 460,98 Z" fill="#2ecc71" opacity="0.7" filter="blur(1px)" />}
        </g>

        {/* 📐 Dimlines (치수선 시스템 정밀 조정) */}
        
        {/* 1. LOA Dimline (Horizontal - 완전한 수평 보정) */}
        <g transform="translate(0, 195)">
          <line x1="25" y1="0" x2="465" y2="0" stroke="#63b3ed" strokeWidth="1.2" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" opacity="0.9" />
          {/* 보조 연장선 (정렬 보정) */}
          <line x1="25" y1="-85" x2="25" y2="8" stroke="#63b3ed" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
          <line x1="465" y1="-115" x2="465" y2="8" stroke="#63b3ed" strokeWidth="1" strokeDasharray="3,2" opacity="0.4" />
          
          <g transform="translate(240, 0)">
            <rect x="-40" y="-18" width="80" height="36" rx="18" className="ssm__glass-badge" fill="rgba(49, 130, 206, 0.3)" stroke="rgba(66, 153, 225, 0.7)" />
            <text y="0" textAnchor="middle" className="ssm__value-text" fontSize="13" fontWeight="bold">{len}</text>
            <text y="12" textAnchor="middle" className="ssm__dim-text" fontSize="7.5" fontWeight="600">LOA (m)</text>
          </g>
        </g>

        {/* 2. Beam Dimline (Width - 선미 명확화) */}
        <g transform="translate(470, 85)">
          {/* 선폭을 더 명확히 나타내는 가로 치수선 */}
          <line x1="-5" y1="0" x2="-45" y2="15" stroke="#63b3ed" strokeWidth="1.2" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" opacity="0.9" />
          
          <g transform="translate(25, 5)">
            <rect x="-32" y="-18" width="64" height="36" rx="18" className="ssm__glass-badge" fill="rgba(49, 130, 206, 0.3)" stroke="rgba(66, 153, 225, 0.7)" />
            <text y="1" textAnchor="middle" className="ssm__value-text" fontSize="13" fontWeight="bold">{beam}</text>
            <text y="13" textAnchor="middle" className="ssm__dim-text" fontSize="7.5" fontWeight="600">Beam (m)</text>
          </g>
        </g>

        {/* 3. Draft Dimline (Vertical - 상향 조정 및 정렬) */}
        <g transform="translate(45, 100)">
          {/* 수직 치수선 (두께 보강) */}
          <line x1="0" y1="-20" x2="0" y2="20" stroke="#63b3ed" strokeWidth="1.8" marker-start="url(#arrowStart)" marker-end="url(#arrowEnd)" opacity="1" />
          {/* 수선 보조선 (강조) */}
          <line x1="-10" y1="-20" x2="15" y2="-20" stroke="#63b3ed" strokeWidth="1.2" opacity="0.6" />
          
          {/* //* [Modified Code] Draft 배지 위치를 사용자 요청에 따라 수선 부근으로 상향 조정 */}
          <g transform="translate(-10, 50)">
            <rect x="-35" y="-18" width="70" height="36" rx="18" className="ssm__glass-badge" fill="rgba(49, 130, 206, 0.3)" stroke="rgba(66, 153, 225, 0.7)" />
            <text y="1" textAnchor="middle" className="ssm__value-text" fontSize="13" fontWeight="bold">{draft}</text>
            <text y="13" textAnchor="middle" className="ssm__dim-text" fontSize="7.5" fontWeight="600">Draft (T)</text>
          </g>
        </g>

        {/* Ice Class Badge */}
        <g transform="translate(70, 45)">
          <circle r="28" fill={iceFill} stroke={iceStroke} strokeWidth="2" className="ssm__glass-badge" />
          <text y="2" textAnchor="middle" fill={iceText} fontSize="12" fontWeight="900" filter="drop-shadow(0 0 2px rgba(0,0,0,0.6))">{iceClass}</text>
          <text y="16" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="6.5" fontWeight="700">ICE CLASS</text>
          <line x1="20" y1="20" x2="45" y2="45" stroke={iceStroke} strokeWidth="1.2" strokeDasharray="3,3" opacity="0.6" />
        </g>
      </svg>
    </div>
  );
}

function SummaryCard({ label, value, unit }) {
  return (
    <div className="ssm__card">
      <span className="ssm__card-label">{label}</span>
      <span className="ssm__card-value">{value ?? '—'}</span>
      {unit && <span className="ssm__card-unit">{unit}</span>}
    </div>
  );
}

export default function ShipSpecsSummaryModal({
  open,
  specs,
  polarParams,
  currentRoute,
  onConfirm,
  onClose,
}) {
  if (!open || !specs || !polarParams) return null;

  const { draft, rescueDays, tempMargin, checks = {} } = polarParams;

  return (
    <div className="ssm-backdrop" onClick={onClose}>
      <div className="ssm" onClick={(e) => e.stopPropagation()}>
        {/* ── Header ── */}
        <div className="ssm__header">
          <span className="ssm__title">⚙ 선박 제원 요약 확인</span>
          <button className="ssm__close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="ssm__body">
          {/* Ship Diagram */}
          <ShipDiagram specs={specs} />

          {/* Spec Grid */}
          <div className="ssm__section-label">선박 제원</div>
          <div className="ssm__spec-grid">
            <SummaryCard
              label="배수량"
              value={specs.displacement?.toLocaleString()}
              unit="톤"
            />
            <SummaryCard label="LOA" value={specs.length} unit="m" />
            <SummaryCard label="Beam" value={specs.width} unit="m" />
            <SummaryCard label="GM" value={specs.gm} unit="m" />
            <SummaryCard label="Draft" value={specs.draft} unit="m" />
            <SummaryCard label="Ice Class" value={specs.iceClass} />
          </div>

          {/* Route */}
          <div className="ssm__section-label">현재 선택 항로</div>
          <span className="ssm__route-badge">
            {ROUTE_NAMES[currentRoute] || currentRoute || '—'}
          </span>

          {/* Polar Code params */}
          <div className="ssm__section-label">POLAR CODE 안전 설계 기준</div>
          <div className="ssm__polar-row">
            <span>Draft</span> <span>{draft} m</span>
            <span>Rescue</span> <span>{rescueDays} 일</span>
            <span>온도여유</span> <span>{tempMargin} °C</span>
          </div>

          {/* Checklist */}
          <div className="ssm__section-label">항행 설비 안전 체크리스트</div>
          <div className="ssm__checks">
            {CHECK_LABELS.map(({ key, label }) => (
              <span
                key={key}
                className={`ssm__check-badge ${checks[key] ? 'ssm__check-badge--on' : 'ssm__check-badge--off'}`}
              >
                {checks[key] ? '✓' : '✗'} {label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="ssm__footer">
          <button className="ssm__btn ssm__btn--confirm" onClick={onConfirm}>
            ✅ 확인 &amp; 평가 실행
          </button>
          <button className="ssm__btn ssm__btn--close" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
