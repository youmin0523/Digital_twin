import React, { useEffect, useState } from 'react';

const STAGE_STEPS = {
  easy: 100000, stage_1_basic: 100000,
  medium: 200000, stage_2_moderate: 200000,
  hard: 200000, stage_3_hard: 200000,
};
const STAGE_ORDER = ['stage_1_basic', 'stage_2_moderate', 'stage_3_hard'];
const STAGE_LABEL = {
  easy: 'Easy', stage_1_basic: 'Easy',
  medium: 'Medium', stage_2_moderate: 'Medium',
  hard: 'Hard', stage_3_hard: 'Hard',
};
const STAGE_COLOR = {
  easy: '#34d399', stage_1_basic: '#34d399',
  medium: '#f59e0b', stage_2_moderate: '#f59e0b',
  hard: '#ef4444', stage_3_hard: '#ef4444',
};

const POLL_MS = 1500;

export default function RLProgressOverlay() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const res = await fetch('/api/rl/status');
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setStatus(data);
      } catch {
        // 서버 없으면 그냥 숨김
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!status?.is_training) return null;

  const stage = status.current_stage;
  const metrics = status.agent_status?.metrics ?? {};
  const stageTotal = STAGE_STEPS[stage] ?? 100000;
  const stepInStage = metrics.timestep ?? 0;
  const stagePct = Math.min(stepInStage / stageTotal, 1);

  // 전체 진행률 — training_log 완료 단계 + 현재 단계 timestep
  const completedTotal = (status.training_log ?? []).reduce((s, log) => s + (log.timesteps ?? 0), 0);
  const grandTotal = 500000; // easy 100k + medium 200k + hard 200k
  const totalDone = Math.min(completedTotal + stepInStage, grandTotal);
  const totalPct = totalDone / grandTotal;

  // 단계 인디케이터용 인덱스
  const stageIdx = STAGE_ORDER.indexOf(stage);
  const stageColor = STAGE_COLOR[stage] ?? '#60a5fa';

  return (
    <div style={{
      position: 'absolute',
      right: 1670,
      top: 10,
      width: 240,
      zIndex: 300,
      background: 'rgba(13, 19, 41, 0.92)',
      border: `1px solid ${stageColor}44`,
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
          RL 커리큘럼 학습
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: stageColor,
          background: `${stageColor}22`,
          border: `1px solid ${stageColor}55`,
          borderRadius: 4,
          padding: '1px 6px',
        }}>
          {STAGE_LABEL[stage] ?? stage}
        </span>
      </div>

      {/* 단계 진행률 */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: '#94a3b8' }}>단계 진행</span>
          <span style={{ fontSize: 10, color: stageColor, fontVariantNumeric: 'tabular-nums' }}>
            {(stagePct * 100).toFixed(1)}%
          </span>
        </div>
        <ProgressBar pct={stagePct} color={stageColor} />
      </div>

      {/* 전체 진행률 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <span style={{ fontSize: 10, color: '#64748b' }}>전체</span>
          <span style={{ fontSize: 10, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
            {fmtNum(totalDone)} / {fmtNum(grandTotal)}
          </span>
        </div>
        <ProgressBar pct={totalPct} color="#475569" height={2} />
      </div>

      {/* 단계 인디케이터 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {STAGE_ORDER.map((s, i) => {
          const done = i < stageIdx;
          const active = i === stageIdx;
          return (
            <div key={s} style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: done ? STAGE_COLOR[s]
                : active ? stageColor
                  : 'rgba(255,255,255,0.08)',
              opacity: done ? 0.7 : 1,
              transition: 'background 0.4s',
            }} />
          );
        })}
      </div>

      {/* 메트릭 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <MetricRow
          label="평균 보상 (100ep)"
          value={metrics.mean_reward_100?.toFixed(2) ?? '—'}
          color={rewardColor(metrics.mean_reward_100)}
        />
        <MetricRow
          label="성공률"
          value={metrics.success_rate != null ? `${(metrics.success_rate * 100).toFixed(1)}%` : '—'}
          color={rateColor(metrics.success_rate)}
        />
        <MetricRow
          label="충돌률"
          value={metrics.collision_rate != null ? `${(metrics.collision_rate * 100).toFixed(1)}%` : '—'}
          color={collisionColor(metrics.collision_rate)}
        />
        <MetricRow
          label="에피소드"
          value={metrics.episodes != null ? fmtNum(metrics.episodes) : '—'}
          color="#94a3b8"
        />
      </div>
    </div>
  );
}

function ProgressBar({ pct, color, height = 4 }) {
  return (
    <div style={{
      height,
      borderRadius: height,
      background: 'rgba(255,255,255,0.06)',
      overflow: 'hidden',
    }}>
      <div style={{
        height: '100%',
        width: `${(pct * 100).toFixed(1)}%`,
        borderRadius: height,
        background: color,
        transition: 'width 0.8s ease',
      }} />
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  );
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function rewardColor(v) {
  if (v == null) return '#64748b';
  if (v > 50) return '#34d399';
  if (v > 0) return '#f59e0b';
  return '#ef4444';
}

function rateColor(v) {
  if (v == null) return '#64748b';
  if (v > 0.7) return '#34d399';
  if (v > 0.4) return '#f59e0b';
  return '#ef4444';
}

function collisionColor(v) {
  if (v == null) return '#64748b';
  if (v < 0.1) return '#34d399';
  if (v < 0.3) return '#f59e0b';
  return '#ef4444';
}
