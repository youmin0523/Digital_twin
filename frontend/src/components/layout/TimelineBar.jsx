import React from 'react';
import './TimelineBar.css';

const ROUTE_LABELS = {
  NSR: '북극항로',
  NWP: '북서항로',
  TSR: '횡단항로',
  SUEZ: '수에즈',
  CAPE: '희망봉',
};

const ROUTE_DAYS = {
  NSR: 14,
  NWP: 16,
  TSR: 13,
  SUEZ: 22,
  CAPE: 30,
};

// //! [Original Code]
// export default function TimelineBar({
//   simProgress,
//   timelineDay,
//   onTimelineChange,
//   currentRouteKey,
//   departureName,
//   arrivalName,
// }) {
//   const totalDays = ROUTE_DAYS[currentRouteKey] || 14;
// //* [Modified Code] 상위 컴포넌트에서 전달받은 동적 실제 totalDays 적용
export default function TimelineBar({
  simProgress,
  timelineDay,
  onTimelineChange,
  currentRouteKey,
  departureName,
  arrivalName,
  totalDays: propTotalDays,
}) {
  const totalDays = propTotalDays || ROUTE_DAYS[currentRouteKey] || 14;
  const routeLabel = ROUTE_LABELS[currentRouteKey] || '기타항로';
  const pct = Math.min(100, (simProgress || 0) * 100);
  const depName = departureName || '부산';
  const arrName = arrivalName || '로테르담';

  return (
    <div className="timeline-bar">
      <span className="timeline-bar__port">{depName}</span>
      <div className="timeline-bar__track">
        <div className="timeline-bar__fill" style={{ width: pct + '%' }} />
        <div className="timeline-bar__cursor" style={{ left: pct + '%' }} />
        <input
          type="range"
          className="timeline-bar__slider"
          min="0"
          max={totalDays}
          step="0.1"
          value={timelineDay}
          onChange={(e) => onTimelineChange(e.target.value)}
        />
      </div>
      <span className="timeline-bar__port">{arrName}</span>
      <span className="timeline-bar__day">
        Day {Math.floor(timelineDay)} / {totalDays}
      </span>
      <span className="timeline-bar__summary">
        {depName} → {routeLabel} → {arrName} | {totalDays}일 운항
      </span>
    </div>
  );
}
