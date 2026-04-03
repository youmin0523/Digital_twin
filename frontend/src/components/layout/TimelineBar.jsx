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

export default function TimelineBar({
  simProgress,
  timelineDay,
  onTimelineChange,
  currentRouteKey,
}) {
  const totalDays = ROUTE_DAYS[currentRouteKey] || 14;
  const routeLabel = ROUTE_LABELS[currentRouteKey] || '북극항로';
  const pct = Math.min(100, (simProgress || 0) * 100);

  return (
    <div className="timeline-bar">
      <span className="timeline-bar__port">부산</span>
      <div className="timeline-bar__track">
        <div className="timeline-bar__fill" style={{ width: pct + '%' }} />
        <div className="timeline-bar__cursor" style={{ left: pct + '%' }} />
        <input
          type="range"
          className="timeline-bar__slider"
          min="0"
          max="14"
          step="0.1"
          value={timelineDay}
          onChange={e => onTimelineChange(e.target.value)}
        />
      </div>
      <span className="timeline-bar__port">로테르담</span>
      <span className="timeline-bar__day">Day {Math.floor(timelineDay)} / {totalDays}</span>
      <span className="timeline-bar__summary">
        부산 → {routeLabel} → 로테르담 | {totalDays}일 운항
      </span>
    </div>
  );
}
