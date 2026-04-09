import React, { useEffect, useState } from 'react';

const STAGE_ORDER = ['easy (1/3)', 'medium (2/3)', 'hard (3/3)'];
const STAGE_LABEL = {
  'easy (1/3)': 'Easy Stage',
  'medium (2/3)': 'Medium Stage',
  'hard (3/3)': 'Hard Stage',
};
const STAGE_COLOR = {
  'easy (1/3)': '#34d399',
  'medium (2/3)': '#f59e0b',
  'hard (3/3)': '#ef4444',
};

const POLL_MS = 2000;

export default function TrendReportProgressOverlay() {
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState('curriculum'); // 'curriculum' or 'single'
  const [difficulty, setDifficulty] = useState('medium');
  const [timesteps, setTimesteps] = useState(100000);

  useEffect(() => {
    let alive = true;
    let intervalId = null;

    async function poll() {
      try {
        const res = await fetch('/api/report/rl/status');
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setStatus(data);
      } catch {
        // 서버 미가동
      }
    }

    // 첫 요청 성공 시에만 폴링 시작
    (async () => {
      try {
        const res = await fetch('/api/report/rl/status');
        if (!res.ok || !alive) return;
        const data = await res.json();
        if (alive) {
          setStatus(data);
          intervalId = setInterval(poll, POLL_MS);
        }
      } catch {
        // 서버 없음 → 폴링 안 함
      }
    })();

    return () => { alive = false; if (intervalId) clearInterval(intervalId); };
  }, []);

  const stage = status?.current_stage ?? null;
  const stageColor = STAGE_COLOR[stage] ?? '#10b981';
  const totalPct = (status?.progress ?? 0) / 100;

  return (
    <div style={{
      position: 'absolute',
      left: 10,
      top: 320, // RLProgressOverlay(top:10) 밑에 배치 (간격 고려)
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
          Trend Report 학습 (RL-A)
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
          {status === null ? '대기' : (STAGE_LABEL[stage] ?? stage ?? '—')}
        </span>
      </div>

      {status?.is_training && (
        <button
          onClick={async () => {
            try {
              await fetch('/api/report/rl/stop', { method: 'POST' });
            } catch (e) {
              console.error('Failed to stop RL-A training:', e);
            }
          }}
          style={{
            width: '100%',
            marginBottom: 10,
            padding: '5px 0',
            background: 'rgba(127,29,29,0.5)',
            border: '1px solid #ef4444',
            borderRadius: 4,
            color: '#fca5a5',
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ■ 학습 중단
        </button>
      )}

      {status?.is_training && (
        <>
          {/* 전체 진행률 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>전체 커리큘럼</span>
              <span style={{ fontSize: 10, color: stageColor, fontVariantNumeric: 'tabular-nums' }}>
                {status.progress}%
              </span>
            </div>
            <ProgressBar pct={totalPct} color={stageColor} />
          </div>

          {/* 단계 인디케이터 */}
          <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
            {STAGE_ORDER.map((s, i) => {
              const stageIdx = STAGE_ORDER.indexOf(stage);
              const done = i < stageIdx;
              const active = i === stageIdx;
              return (
                <div key={s} style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 2,
                  background: done ? STAGE_COLOR[s] : active ? stageColor : 'rgba(255,255,255,0.08)',
                  opacity: done ? 0.6 : 1,
                }} />
              );
            })}
          </div>
        </>
      )}

      {/* 통계 */}
      {status !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <MetricRow label="완료된 스텝" value={fmtNum(status?.total_timesteps_done)} color="#e2e8f0" />
          <MetricRow label="목표 스텝" value={fmtNum(status?.total_timesteps_target)} color="#94a3b8" />
          <MetricRow label="경과 시간" value={status?.elapsed_seconds != null ? `${status.elapsed_seconds}s` : '—'} color="#94a3b8" />
        </div>
      )}

      {/* 학습 옵션 설정 (학습 중이 아닐 때만 노출) */}
      {!status?.is_training && (
        <div style={{
          marginTop: 10,
          padding: 8,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 4,
          border: '1px solid #1e293b',
        }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>학습 모드 설정</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            {['curriculum', 'single'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  flex: 1,
                  padding: '3px 0',
                  fontSize: 9,
                  background: mode === m ? 'rgba(5,150,105,0.4)' : 'transparent',
                  border: `1px solid ${mode === m ? '#10b981' : '#334155'}`,
                  borderRadius: 3,
                  color: mode === m ? '#6ee7b7' : '#64748b',
                  cursor: 'pointer',
                }}
              >
                {m === 'curriculum' ? '커리큘럼' : '단일 단계'}
              </button>
            ))}
          </div>

          {mode === 'single' && (
            <div style={{ marginBottom: 8 }}>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                style={{
                  width: '100%',
                  padding: '2px 4px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 3,
                  color: '#6ee7b7',
                  fontSize: 10,
                }}
              >
                <option value="easy">Easy Stage</option>
                <option value="medium">Medium Stage</option>
                <option value="hard">Hard Stage</option>
              </select>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>반복:</span>
            <input
              type="number"
              value={timesteps}
              onChange={(e) => setTimesteps(parseInt(e.target.value) || 10000)}
              step={10000}
              style={{
                flex: 1,
                padding: '2px 4px',
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: 3,
                color: '#f59e0b',
                fontSize: 10,
              }}
            />
          </div>

          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/report/rl/train', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    curriculum: mode === 'curriculum',
                    difficulty: difficulty,
                    timesteps: timesteps,
                  }),
                });
                if (!res.ok) {
                  const err = await res.json();
                  alert(`학습 시작 실패: ${err.error || '알 수 없는 오류'}`);
                }
              } catch (e) {
                console.error('Failed to start RL-A training:', e);
                alert('네트워크 오류가 발생했습니다.');
              }
            }}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '8px 0',
              background: 'linear-gradient(135deg,#059669,#10b981)',
              border: '1px solid #059669',
              borderRadius: 4,
              color: '#fff',
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(5,150,105,0.3)',
            }}
          >
            RL 학습 시작 (Start Training)
          </button>
        </div>
      )}
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
      <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>
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
