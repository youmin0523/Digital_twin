/**
 * ForwardPreviewHUD.jsx
 * =====================
 * 선미 추적 뷰 전용 오버레이. 현재 선박 위치 기준 전방 N tick 의
 * 얼음 두께·RIO 시퀀스를 히스토그램 + 통과 가능성 배지로 표시.
 *
 * 위성 조감에서는 절대 렌더링되지 않는다 (선미뷰 고유 가치).
 * 부모에서 `visible` prop 으로 제어.
 */

import React, { useMemo } from 'react';
import { deriveForwardPreview, derivePassBadge } from '../../services/derivedMetrics';

const BAR_COUNT = 16;

function thicknessColor(m) {
  if (m == null) return '#4b5563';
  if (m < 0.3) return '#38bdf8';
  if (m < 0.8) return '#22d3ee';
  if (m < 1.2) return '#eab308';
  if (m < 1.8) return '#fb923c';
  return '#ef4444';
}

export default function ForwardPreviewHUD({ visible, trace, tHours }) {
  const preview = useMemo(
    () => (trace ? deriveForwardPreview(trace, tHours, BAR_COUNT) : []),
    [trace, tHours],
  );
  const badge = useMemo(() => derivePassBadge(preview), [preview]);

  if (!visible || !trace || preview.length === 0) return null;

  const maxH = Math.max(
    0.5,
    ...preview.map((p) => p.effective_thickness_m || p.thickness_m || 0),
  );
  const farKm = preview[preview.length - 1]?.kmAhead || 0;

  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 180,
        pointerEvents: 'none',
        background: 'rgba(5, 10, 20, 0.78)',
        border: '1px solid rgba(34, 211, 238, 0.35)',
        borderRadius: 6,
        padding: '8px 12px',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: 11,
        minWidth: 360,
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ color: '#22d3ee', fontWeight: 700, letterSpacing: 1 }}>
          전방 프리뷰
        </span>
        <span style={{ color: '#94a3b8', fontSize: 10 }}>
          0 ~ {farKm.toFixed(0)} km
        </span>
        <span
          style={{
            marginLeft: 'auto',
            padding: '2px 8px',
            borderRadius: 3,
            background: badge.color,
            color: '#0a0f1c',
            fontWeight: 800,
            fontSize: 10,
            letterSpacing: 1,
          }}
        >
          {badge.label}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: 2,
          height: 46,
          borderBottom: '1px solid rgba(148,163,184,0.25)',
          paddingBottom: 2,
        }}
      >
        {preview.map((p, i) => {
          const h = p.effective_thickness_m || p.thickness_m || 0;
          const pct = Math.max(4, (h / maxH) * 100);
          return (
            <div
              key={`${p.t}-${i}`}
              title={`+${p.kmAhead.toFixed(1)}km · ${h.toFixed(2)}m · RIO ${p.rio?.toFixed(1) ?? '-'}`}
              style={{
                flex: 1,
                height: `${pct}%`,
                background: thicknessColor(h),
                opacity: 0.85,
                borderRadius: '2px 2px 0 0',
              }}
            />
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 3,
          color: '#64748b',
          fontSize: 9,
        }}
      >
        <span>두께 최대 {maxH.toFixed(2)}m</span>
        <span>추정 · {preview.length} tick</span>
      </div>
    </div>
  );
}
