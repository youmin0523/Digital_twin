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
  const [iterStatus, setIterStatus] = useState(null);
  const [mode, setMode] = useState('curriculum'); // 'curriculum' | 'single' | 'iterative'
  const [difficulty, setDifficulty] = useState('medium');
  const [timesteps, setTimesteps] = useState(100000);
  const [maxIter, setMaxIter] = useState(10);
  const [targetSuccess, setTargetSuccess] = useState(0.80);
  const [targetProhibitive, setTargetProhibitive] = useState(0.10);

  useEffect(() => {
    let alive = true;
    let intervalId = null;

    async function poll() {
      try {
        const [r1, r2] = await Promise.all([
          fetch('/api/report/rl/status'),
          fetch('/api/report/rl/departure/train/iterative/status'),
        ]);
        if (r1.ok && alive) setStatus(await r1.json());
        if (r2.ok && alive) setIterStatus(await r2.json());
      } catch {
        // 서버 미가동
      }
    }

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

  const isIterRunning = iterStatus?.is_running ?? false;
  const isTraining = status?.is_training ?? false;
  const anyActive = isTraining || isIterRunning;

  const stage = status?.current_stage ?? null;
  const stageColor = STAGE_COLOR[stage] ?? '#10b981';
  const totalPct = (status?.progress ?? 0) / 100;

  const curIter = iterStatus?.current_iteration ?? 0;
  const latestMetrics = iterStatus?.latest_metrics ?? {};
  const recentHistory = iterStatus?.history ?? [];
  const lastRecord = recentHistory[recentHistory.length - 1] ?? null;

  async function handleStop() {
    try {
      if (isIterRunning) {
        await fetch('/api/report/rl/departure/train/iterative/stop', { method: 'POST' });
      } else {
        await fetch('/api/report/rl/stop', { method: 'POST' });
      }
    } catch (e) {
      console.error('학습 중단 실패:', e);
    }
  }

  async function handleStart() {
    try {
      let res;
      if (mode === 'iterative') {
        res = await fetch('/api/report/rl/departure/train/iterative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_iterations: maxIter,
            target_success_rate: targetSuccess,
            target_prohibitive_rate: targetProhibitive,
            eval_episodes: 50,
            base_timesteps: 100000,
          }),
        });
      } else {
        res = await fetch('/api/report/rl/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            curriculum: mode === 'curriculum',
            difficulty,
            timesteps,
          }),
        });
      }
      if (!res.ok) {
        const err = await res.json();
        alert(`학습 시작 실패: ${err.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      console.error('학습 시작 실패:', e);
      alert('네트워크 오류가 발생했습니다.');
    }
  }

  const borderColor = isIterRunning ? '#a78bfa' : stageColor;

  return (
    <div style={{
      position: 'absolute',
      left: 10,
      top: 320,
      width: 240,
      zIndex: 300,
      background: 'rgba(13, 19, 41, 0.92)',
      border: `1px solid ${borderColor}44`,
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
          Trend Report 학습 {isIterRunning ? '(반복)' : '(RL-A)'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: isIterRunning ? '#a78bfa' : stageColor,
          background: isIterRunning ? '#a78bfa22' : `${stageColor}22`,
          border: `1px solid ${isIterRunning ? '#a78bfa55' : `${stageColor}55`}`,
          borderRadius: 4, padding: '1px 6px',
        }}>
          {isIterRunning
            ? `반복 ${curIter}/${maxIter}`
            : (status === null ? '대기' : (STAGE_LABEL[stage] ?? stage ?? '—'))}
        </span>
      </div>

      {/* 중단 버튼 */}
      {anyActive && (
        <button onClick={handleStop} style={{
          width: '100%', marginBottom: 10, padding: '5px 0',
          background: 'rgba(127,29,29,0.5)', border: '1px solid #ef4444',
          borderRadius: 4, color: '#fca5a5', fontSize: 10, fontWeight: 600, cursor: 'pointer',
        }}>
          ■ 학습 중단
        </button>
      )}

      {/* 반복 학습 진행 표시 */}
      {isIterRunning && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>반복 진행</span>
              <span style={{ fontSize: 10, color: '#a78bfa' }}>{curIter} / {maxIter}</span>
            </div>
            <ProgressBar pct={maxIter > 0 ? curIter / maxIter : 0} color="#a78bfa" />
          </div>

          {isTraining && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>커리큘럼</span>
                <span style={{ fontSize: 10, color: stageColor }}>{status?.progress ?? 0}%</span>
              </div>
              <ProgressBar pct={totalPct} color={stageColor} />
            </div>
          )}

          {lastRecord?.signals?.length > 0 && (
            <div style={{
              marginBottom: 6, padding: '4px 6px',
              background: 'rgba(167,139,250,0.08)',
              border: '1px solid #a78bfa33',
              borderRadius: 4,
            }}>
              <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 3 }}>조정 시그널</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {lastRecord.signals.map(sig => (
                  <span key={sig} style={{
                    fontSize: 8, color: '#c4b5fd',
                    background: '#a78bfa22', border: '1px solid #a78bfa44',
                    borderRadius: 3, padding: '1px 4px',
                  }}>
                    {sig}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 일반 학습 진행 표시 */}
      {isTraining && !isIterRunning && (
        <>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>전체 커리큘럼</span>
              <span style={{ fontSize: 10, color: stageColor }}>{status.progress}%</span>
            </div>
            <ProgressBar pct={totalPct} color={stageColor} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {STAGE_ORDER.map((s, i) => {
              const stageIdx = STAGE_ORDER.indexOf(stage);
              return (
                <div key={s} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < stageIdx ? STAGE_COLOR[s]
                    : i === stageIdx ? stageColor
                      : 'rgba(255,255,255,0.08)',
                  opacity: i < stageIdx ? 0.6 : 1,
                }} />
              );
            })}
          </div>
        </>
      )}

      {/* 메트릭 */}
      {status !== null && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <MetricRow label="완료된 스텝" value={fmtNum(status?.total_timesteps_done)} color="#e2e8f0" />
          <MetricRow label="목표 스텝" value={fmtNum(status?.total_timesteps_target)} color="#94a3b8" />
          <MetricRow label="경과 시간" value={status?.elapsed_seconds != null ? `${status.elapsed_seconds}s` : '—'} color="#94a3b8" />
          {isIterRunning && latestMetrics.success_rate != null && (
            <>
              <MetricRow
                label="성공률"
                value={`${(latestMetrics.success_rate * 100).toFixed(1)}%`}
                color={latestMetrics.success_rate > 0.7 ? '#34d399' : latestMetrics.success_rate > 0.4 ? '#f59e0b' : '#ef4444'}
              />
              <MetricRow
                label="금지구간 비율"
                value={`${((latestMetrics.prohibitive_rate ?? 0) * 100).toFixed(1)}%`}
                color={latestMetrics.prohibitive_rate < 0.1 ? '#34d399' : latestMetrics.prohibitive_rate < 0.3 ? '#f59e0b' : '#ef4444'}
              />
            </>
          )}
        </div>
      )}

      {/* 학습 설정 (학습 중이 아닐 때) */}
      {!anyActive && (
        <div style={{
          marginTop: 10, padding: 8,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 4, border: '1px solid #1e293b',
        }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>학습 모드 설정</div>

          {/* 모드 선택 */}
          <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
            {[
              { key: 'curriculum', label: '커리큘럼' },
              { key: 'single', label: '단일' },
              { key: 'iterative', label: '반복 학습' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setMode(key)} style={{
                flex: 1, padding: '3px 0', fontSize: 9,
                background: mode === key
                  ? (key === 'iterative' ? 'rgba(109,40,217,0.4)' : 'rgba(5,150,105,0.4)')
                  : 'transparent',
                border: `1px solid ${mode === key ? (key === 'iterative' ? '#7c3aed' : '#10b981') : '#334155'}`,
                borderRadius: 3,
                color: mode === key ? (key === 'iterative' ? '#c4b5fd' : '#6ee7b7') : '#64748b',
                cursor: 'pointer',
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* 단일 모드 */}
          {mode === 'single' && (
            <div style={{ marginBottom: 8 }}>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{
                width: '100%', padding: '2px 4px',
                background: '#0f172a', border: '1px solid #334155',
                borderRadius: 3, color: '#6ee7b7', fontSize: 10,
              }}>
                <option value="easy">Easy Stage</option>
                <option value="medium">Medium Stage</option>
                <option value="hard">Hard Stage</option>
              </select>
            </div>
          )}

          {/* 커리큘럼/단일: 스텝 수 */}
          {mode !== 'iterative' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: '#64748b' }}>반복:</span>
              <input
                type="number"
                value={timesteps}
                onChange={(e) => setTimesteps(parseInt(e.target.value) || 10000)}
                step={10000}
                style={{
                  flex: 1, padding: '2px 4px',
                  background: '#0f172a', border: '1px solid #334155',
                  borderRadius: 3, color: '#f59e0b', fontSize: 10,
                }}
              />
            </div>
          )}

          {/* 반복 학습 설정 */}
          {mode === 'iterative' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                padding: '5px 7px', marginBottom: 6,
                background: 'rgba(109,40,217,0.1)',
                border: '1px solid #7c3aed33',
                borderRadius: 4,
                fontSize: 9, color: '#a78bfa', lineHeight: 1.5,
              }}>
                학습 완료 → 자동 분석 → 보상 조정 → 재학습을 반복합니다
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>최대 반복:</span>
                  <input
                    type="number"
                    value={maxIter}
                    onChange={(e) => setMaxIter(parseInt(e.target.value) || 1)}
                    min={1} max={20}
                    style={{
                      flex: 1, padding: '2px 4px',
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 3, color: '#c4b5fd', fontSize: 10,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>목표 성공률:</span>
                  <input
                    type="number"
                    value={targetSuccess}
                    onChange={(e) => setTargetSuccess(parseFloat(e.target.value) || 0.8)}
                    min={0.1} max={1.0} step={0.05}
                    style={{
                      flex: 1, padding: '2px 4px',
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 3, color: '#34d399', fontSize: 10,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>금지구간 목표:</span>
                  <input
                    type="number"
                    value={targetProhibitive}
                    onChange={(e) => setTargetProhibitive(parseFloat(e.target.value) || 0.1)}
                    min={0.01} max={0.5} step={0.01}
                    style={{
                      flex: 1, padding: '2px 4px',
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 3, color: '#ef4444', fontSize: 10,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* 시작 버튼 */}
          <button onClick={handleStart} style={{
            width: '100%', marginTop: 6, padding: '8px 0',
            background: mode === 'iterative'
              ? 'linear-gradient(135deg,#6d28d9,#4c1d95)'
              : 'linear-gradient(135deg,#059669,#10b981)',
            border: `1px solid ${mode === 'iterative' ? '#7c3aed' : '#059669'}`,
            borderRadius: 4, color: '#fff',
            fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
            boxShadow: mode === 'iterative'
              ? '0 2px 8px rgba(109,40,217,0.4)'
              : '0 2px 8px rgba(5,150,105,0.3)',
          }}>
            {mode === 'iterative' ? '🔄 반복 학습 시작' : 'RL 학습 시작 (Start Training)'}
          </button>
        </div>
      )}
    </div>
  );
}

function ProgressBar({ pct, color, height = 4 }) {
  return (
    <div style={{ height, borderRadius: height, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${(pct * 100).toFixed(1)}%`,
        borderRadius: height, background: color, transition: 'width 0.8s ease',
      }} />
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: '#64748b' }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}
