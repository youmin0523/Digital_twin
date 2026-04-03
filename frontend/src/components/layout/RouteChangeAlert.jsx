import React from 'react'; // eslint-disable-line no-unused-vars
import './RouteChangeAlert.css';

const ROUTE_NAMES = {
  NSR:  '북동항로 (NSR)',
  NWP:  '북서항로 (NWP)',
  TSR:  '북극횡단항로 (TSR)',
  SUEZ: '수에즈 운하',
  CAPE: '희망봉 우회',
};

const STEP_LABELS = {
  '1a': '지정학·행정 (제재국가)',
  '1b': '행정 서류 미비 (NSRA/PWOM)',
  '2a': '물리적 크기 초과 (흘수)',
  '2b': '물리적 크기 초과 (선폭)',
  '3a': 'Polar Code 생존 설비 미달',
  '3b': 'Polar Code 온도 설계 미달',
  '3c': 'Polar Code 설비·인력 미비',
  '4c': 'POLARIS RIO 항해 불가',
};

export default function RouteChangeAlert({
  visible,
  fromRoute,
  toRoute,
  stepTag,
  reason,
  onConfirm,
  onClose,
}) {
  if (!visible) return null;

  const stepLabel = stepTag ? STEP_LABELS[stepTag] : null;
  const fromLabel = ROUTE_NAMES[fromRoute] || fromRoute || '—';
  const toLabel   = ROUTE_NAMES[toRoute]   || toRoute   || '—';

  return (
    <div className="rca-backdrop" onClick={onClose}>
      <div className="rca" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="rca__header">
          <span className="rca__title">⚠ 항로 변경 권고</span>
          <button className="rca__close" onClick={onClose}>✕</button>
        </div>

        {/* ── Body ── */}
        <div className="rca__body">

          {/* 판단 단계 배지 */}
          {stepLabel && (
            <>
              <div className="rca__section-label">판단 근거 (KR Polar Code / POLARIS)</div>
              <span className="rca__step-badge">⚡ {stepLabel}</span>
            </>
          )}

          {/* 항로 변경 표시 */}
          <div className="rca__section-label">항로 변경 권고</div>
          <div className="rca__route-row">
            <span className="rca__route-badge rca__route-badge--from">{fromLabel}</span>
            <span className="rca__arrow">→</span>
            <span className="rca__route-badge rca__route-badge--to">{toLabel}</span>
          </div>

          {/* 사유 */}
          {reason && (
            <>
              <div className="rca__section-label">평가 상세 사유</div>
              <div className="rca__reason-box">{reason}</div>
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="rca__footer">
          <button className="rca__btn" onClick={() => {
            if (onConfirm) onConfirm();
            onClose();
          }}>확인</button>
        </div>
      </div>
    </div>
  );
}
