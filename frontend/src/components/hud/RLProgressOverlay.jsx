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

const SHIP_LABELS = { bulk: '벌크선', tanker: '탱커', container: '컨테이너선', lng: 'LNG선' };
const SHIP_COLORS = { bulk: '#60a5fa', tanker: '#f59e0b', container: '#34d399', lng: '#a78bfa' };
const ROUTE_COLORS = { NSR: '#38bdf8', NWP: '#fb923c', TSR: '#a78bfa' };

export default function RLProgressOverlay() {
  const [status, setStatus]           = useState(null);
  const [iterStatus, setIterStatus]   = useState(null);
  const [multiStatus, setMultiStatus] = useState(null);
  const [serverUp, setServerUp]       = useState(true);
  const [lastSeen, setLastSeen]       = useState(null); // last active state snapshot
  const [mode, setMode]               = useState('curriculum');
  const [difficulty, setDifficulty]   = useState('medium');
  const [timesteps, setTimesteps]     = useState(100000);
  const [maxIter, setMaxIter]         = useState(10);
  const [targetSuccess, setTargetSuccess]   = useState(0.85);
  const [targetCollision, setTargetCollision] = useState(0.05);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        // RL 서버가 준비됐을 때만 폴링
        const health = await fetch('/api/health/services').then(r => r.ok ? r.json() : null).catch(() => null);
        if (!health?.rl) { if (alive) setServerUp(false); return; }

        const [r1, r2, r3] = await Promise.allSettled([
          fetch('/api/rl/status'),
          fetch('/api/rl/train/iterative/status'),
          fetch('/api/rl/multi/status'),
        ]);
        let gotAny = false;
        let s = null, it = null, ms = null;
        if (r1.status === 'fulfilled' && r1.value.ok && alive) {
          s = await r1.value.json(); setStatus(s); gotAny = true;
        } else if (r1.status === 'fulfilled' && !r1.value.ok) {
          gotAny = true; // 서버는 살아있으나 아직 준비 중 — 에러 아님
        }
        if (r2.status === 'fulfilled' && r2.value.ok && alive) {
          it = await r2.value.json(); setIterStatus(it); gotAny = true;
        } else if (r2.status === 'fulfilled' && !r2.value.ok) {
          gotAny = true;
        }
        if (r3.status === 'fulfilled' && r3.value.ok && alive) {
          ms = await r3.value.json(); setMultiStatus(ms); gotAny = true;
        } else if (r3.status === 'fulfilled' && !r3.value.ok) {
          gotAny = true;
        }
        if (alive) setServerUp(gotAny);

        // 콘솔 학습 진행 로그
        if (alive) {
          if (ms?.is_running) {
            const cur = ms.running_models ?? 0;
            const tot = ms.total_models ?? 0;
            const conv = ms.converged_models ?? 0;
            console.log(`[빙산회피 RL] 전체 병렬 학습 — 학습중 ${cur}/${tot}개 | 수렴 ${conv}개`);
          } else if (it?.is_running) {
            const iter = it.current_iteration ?? 0;
            const maxIt = it.max_iterations ?? '?';
            console.log(`[빙산회피 RL] 반복 학습 — ${iter}/${maxIt}번째 진행 중`);
          } else if (s?.is_training) {
            const stage = s.current_stage ?? '—';
            const m = s.agent_status?.metrics ?? {};
            const pct = m.timestep != null && m.total_timesteps != null
              ? ((m.timestep / m.total_timesteps) * 100).toFixed(1)
              : '—';
            console.log(`[빙산회피 RL] 커리큘럼 학습 — 단계: ${stage} | 진행: ${pct}%`);
          }
        }
      } catch { if (alive) setServerUp(false); }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // 학습 중일 때 마지막 상태 스냅샷 저장
  useEffect(() => {
    const running = multiStatus?.is_running || iterStatus?.is_running || status?.is_training;
    if (running) {
      setLastSeen({
        multiStatus,
        iterStatus,
        status,
        ts: Date.now(),
      });
    }
  }, [multiStatus, iterStatus, status]);

  const isMultiRunning = multiStatus?.is_running ?? false;
  const isIterRunning  = iterStatus?.is_running ?? false;
  const isTraining     = status?.is_training ?? false;
  const anyActive      = isTraining || isIterRunning || isMultiRunning;
  const wasRunning     = lastSeen != null;

  const stage = status?.current_stage ?? null;
  const metrics = status?.agent_status?.metrics ?? {};
  const stageTotal = STAGE_STEPS[stage] ?? 100000;
  const stepInStage = metrics.timestep ?? 0;
  const stagePct = Math.min(stepInStage / stageTotal, 1);

  const completedTotal = (status?.training_log ?? []).reduce((s, log) => s + (log.timesteps ?? 0), 0);
  const grandTotal = 500000;
  const totalDone = Math.min(completedTotal + stepInStage, grandTotal);
  const totalPct = totalDone / grandTotal;

  const stageIdx = STAGE_ORDER.indexOf(stage);
  const stageColor = STAGE_COLOR[stage] ?? '#60a5fa';

  // 반복 학습 현재 iteration 정보
  const curIter = iterStatus?.current_iteration ?? 0;
  const latestMetrics = iterStatus?.latest_metrics ?? {};
  const recentHistory = iterStatus?.history ?? [];
  const lastRecord = recentHistory[recentHistory.length - 1] ?? null;

  async function handleStop() {
    try {
      if (isMultiRunning) {
        await fetch('/api/rl/multi/stop', { method: 'POST' });
      } else {
        await Promise.allSettled([
          fetch('/api/rl/train/iterative/stop', { method: 'POST' }),
          fetch('/api/rl/stop', { method: 'POST' }),
        ]);
      }
    } catch (e) { console.error('학습 중단 실패:', e); }
  }

  async function handleStart() {
    try {
      let res;
      if (mode === 'multi') {
        res = await fetch('/api/rl/multi/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_iterations: maxIter,
            target_success_rate: targetSuccess,
            target_collision_rate: targetCollision,
            eval_episodes: 50,
            eval_difficulty: 'hard',
            base_timesteps: 500000,
          }),
        });
      } else if (mode === 'iterative') {
        res = await fetch('/api/rl/train/iterative', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            max_iterations: maxIter,
            target_success_rate: targetSuccess,
            target_collision_rate: targetCollision,
            eval_episodes: 50,
            eval_difficulty: 'hard',
          }),
        });
      } else {
        res = await fetch('/api/rl/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curriculum: mode === 'curriculum', difficulty, timesteps }),
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

  const borderColor = isMultiRunning ? '#f59e0b' : isIterRunning ? '#a78bfa' : stageColor;

  return (
    <div style={{
      width: isMultiRunning ? 340 : 240,
      background: 'rgba(13, 19, 41, 0.92)',
      border: `1px solid ${borderColor}44`,
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      maxHeight: 'calc(100vh - 20px)',
      overflowY: 'auto',
    }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
          RL {isMultiRunning ? '전체 병렬' : isIterRunning ? '반복 학습' : '커리큘럼 학습'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: isMultiRunning ? '#f59e0b' : isIterRunning ? '#a78bfa' : stageColor,
          background: isMultiRunning ? '#f59e0b22' : isIterRunning ? '#a78bfa22' : `${stageColor}22`,
          border: `1px solid ${isMultiRunning ? '#f59e0b55' : isIterRunning ? '#a78bfa55' : `${stageColor}55`}`,
          borderRadius: 4, padding: '1px 6px',
        }}>
          {isMultiRunning
            ? `${multiStatus?.running_models ?? 0}/${multiStatus?.total_models ?? 0} 실행중`
            : isIterRunning
              ? `반복 ${curIter}/${maxIter}`
              : (status === null ? '대기' : (STAGE_LABEL[stage] ?? stage ?? '—'))}
        </span>
      </div>

      {/* 서버 다운 배너 */}
      {!serverUp && wasRunning && (
        <div style={{
          marginBottom: 8, padding: '4px 8px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444455',
          borderRadius: 4, fontSize: 9, color: '#fca5a5',
        }}>
          ⚠ RL 서버 재연결 중... (학습은 계속 실행 중)
        </div>
      )}
      {!serverUp && !wasRunning && (
        <div style={{
          marginBottom: 8, padding: '4px 8px',
          background: 'rgba(71,85,105,0.3)', border: '1px solid #33415533',
          borderRadius: 4, fontSize: 9, color: '#64748b',
        }}>
          RL 서버 대기 중
        </div>
      )}

      {/* 서버 다운 시 마지막 학습 상태 표시 */}
      {!serverUp && wasRunning && (() => {
        const ls = lastSeen;
        const lm = ls.multiStatus;
        const li = ls.iterStatus;
        if (lm?.is_running) {
          const running = Object.values(lm.models ?? {}).filter(m => m.is_running);
          const best = running[0];
          return (
            <div style={{
              marginBottom: 8, padding: '5px 8px',
              background: 'rgba(245,158,11,0.06)', border: '1px solid #f59e0b33',
              borderRadius: 4,
            }}>
              <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 3 }}>마지막 확인 (병렬 학습)</div>
              <div style={{ fontSize: 10, color: '#fde68a' }}>
                {lm.running_models ?? 0}/{lm.total_models ?? 84} 실행중 · 수렴 {lm.converged_models ?? 0}개
              </div>
              {best && (
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                  {best.label ?? best.route} #{best.current_iteration}회
                </div>
              )}
            </div>
          );
        }
        if (li?.is_running) {
          return (
            <div style={{
              marginBottom: 8, padding: '5px 8px',
              background: 'rgba(167,139,250,0.06)', border: '1px solid #a78bfa33',
              borderRadius: 4,
            }}>
              <div style={{ fontSize: 9, color: '#a78bfa', marginBottom: 2 }}>마지막 확인 (반복 학습)</div>
              <div style={{ fontSize: 10, color: '#c4b5fd' }}>반복 {li.current_iteration}회</div>
            </div>
          );
        }
        return null;
      })()}

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

      {/* 다중 모델 병렬 학습 진행 */}
      {isMultiRunning && multiStatus?.models && (
        <RLMultiModelProgress multiStatus={multiStatus} />
      )}

      {/* 반복 학습 진행 표시 */}
      {isIterRunning && !isMultiRunning && (
        <div style={{ marginBottom: 8 }}>
          {/* 반복 진행 바 */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>반복 진행</span>
              <span style={{ fontSize: 10, color: '#a78bfa' }}>
                {curIter} / {maxIter}
              </span>
            </div>
            <ProgressBar pct={maxIter > 0 ? curIter / maxIter : 0} color="#a78bfa" />
          </div>

          {/* 커리큘럼 내 단계 진행 */}
          {isTraining && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>현재 단계</span>
                <span style={{ fontSize: 10, color: stageColor }}>
                  {STAGE_LABEL[stage] ?? stage} {(stagePct * 100).toFixed(0)}%
                </span>
              </div>
              <ProgressBar pct={stagePct} color={stageColor} />
            </div>
          )}

          {/* 마지막 반복의 시그널 */}
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
      {isTraining && !isIterRunning && !isMultiRunning && (
        <>
          <div style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#94a3b8' }}>단계 진행</span>
              <span style={{ fontSize: 10, color: stageColor }}>{(stagePct * 100).toFixed(1)}%</span>
            </div>
            <ProgressBar pct={stagePct} color={stageColor} />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: '#64748b' }}>전체</span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {fmtNum(totalDone)} / {fmtNum(grandTotal)}
              </span>
            </div>
            <ProgressBar pct={totalPct} color="#475569" height={2} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
            {STAGE_ORDER.map((s, i) => (
              <div key={s} style={{
                flex: 1, height: 4, borderRadius: 2,
                background: i < stageIdx ? STAGE_COLOR[s]
                  : i === stageIdx ? stageColor
                    : 'rgba(255,255,255,0.08)',
                opacity: i < stageIdx ? 0.7 : 1,
                transition: 'background 0.4s',
              }} />
            ))}
          </div>
        </>
      )}

      {/* 메트릭 (다중 모델 중엔 숨김) */}
      {!isMultiRunning && (<div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <MetricRow
          label="평균 보상 (100ep)"
          value={fmtReward(metrics.mean_reward_100 ?? latestMetrics.mean_reward)}
          color={rewardColor(metrics.mean_reward_100 ?? latestMetrics.mean_reward)}
        />
        <MetricRow
          label="성공률"
          value={fmtPct(metrics.success_rate ?? latestMetrics.success_rate)}
          color={rateColor(metrics.success_rate ?? latestMetrics.success_rate)}
        />
        <MetricRow
          label="충돌률"
          value={fmtPct(metrics.collision_rate ?? latestMetrics.collision_rate)}
          color={collisionColor(metrics.collision_rate ?? latestMetrics.collision_rate)}
        />
        <MetricRow
          label="에피소드"
          value={metrics.episodes != null ? fmtNum(metrics.episodes) : '—'}
          color="#94a3b8"
        />
      </div>)}

      {/* 학습 설정 (항상 표시, 학습 중엔 비활성화) */}
      <div style={{
          marginTop: 10, padding: 8,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 4, border: `1px solid ${anyActive ? '#334155' : '#1e293b'}`,
          opacity: anyActive ? 0.6 : 1,
        }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>학습 모드 설정</div>

          {/* 모드 선택 */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
            {[
              { key: 'curriculum', label: '커리큘럼' },
              { key: 'single',     label: '단일' },
              { key: 'iterative',  label: '반복' },
              { key: 'multi',      label: '전체 병렬' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setMode(key)} style={{
                flex: '1 1 40%', padding: '3px 0', fontSize: 9,
                background: mode === key
                  ? key === 'multi' ? 'rgba(245,158,11,0.4)'
                    : key === 'iterative' ? 'rgba(109,40,217,0.4)'
                    : 'rgba(30,58,138,0.5)'
                  : 'transparent',
                border: `1px solid ${mode === key
                  ? key === 'multi' ? '#f59e0b'
                    : key === 'iterative' ? '#7c3aed'
                    : '#3b82f6'
                  : '#334155'}`,
                borderRadius: 3,
                color: mode === key
                  ? key === 'multi' ? '#fde68a'
                    : key === 'iterative' ? '#c4b5fd'
                    : '#93c5fd'
                  : '#64748b',
                cursor: 'pointer',
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* 단일 모드: 난이도 선택 */}
          {mode === 'single' && (
            <div style={{ marginBottom: 8 }}>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{
                width: '100%', padding: '2px 4px',
                background: '#0f172a', border: '1px solid #334155',
                borderRadius: 3, color: '#93c5fd', fontSize: 10,
              }}>
                <option value="easy">Easy (하절기)</option>
                <option value="medium">Medium (춘추)</option>
                <option value="hard">Hard (동절기)</option>
              </select>
            </div>
          )}

          {/* 커리큘럼/단일 모드: 스텝 수 */}
          {mode !== 'iterative' && mode !== 'multi' && (
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

          {/* 반복 / 전체 병렬 모드: 설정 */}
          {(mode === 'iterative' || mode === 'multi') && (
            <div style={{ marginBottom: 8 }}>
              {mode === 'multi' ? (
                <div style={{
                  padding: '5px 7px', marginBottom: 6,
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid #f59e0b33',
                  borderRadius: 4, fontSize: 9, color: '#fde68a', lineHeight: 1.6,
                }}>
                  항로 3종 × 빙급 7종 × 선종 4종 =<br /><b>84개 모델</b>을 동시에 반복 학습합니다
                </div>
              ) : (
                <div style={{
                  padding: '5px 7px', marginBottom: 6,
                  background: 'rgba(109,40,217,0.1)',
                  border: '1px solid #7c3aed33',
                  borderRadius: 4, fontSize: 9, color: '#a78bfa', lineHeight: 1.5,
                }}>
                  학습 완료 → 자동 분석 → 보상 조정 → 재학습을 반복합니다
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>최대 반복:</span>
                  <input type="number" value={maxIter}
                    onChange={(e) => setMaxIter(parseInt(e.target.value) || 1)}
                    min={1} max={20} step={1} style={{
                      flex: 1, padding: '2px 4px',
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 3, color: mode === 'multi' ? '#fde68a' : '#c4b5fd', fontSize: 10,
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>목표 성공률:</span>
                  <input type="number" value={targetSuccess}
                    onChange={(e) => setTargetSuccess(parseFloat(e.target.value) || 0.85)}
                    min={0.1} max={1.0} step={0.05} style={{
                      flex: 1, padding: '2px 4px',
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 3, color: '#34d399', fontSize: 10,
                    }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>목표 충돌률:</span>
                  <input type="number" value={targetCollision}
                    onChange={(e) => setTargetCollision(parseFloat(e.target.value) || 0.05)}
                    min={0.01} max={0.5} step={0.01} style={{
                      flex: 1, padding: '2px 4px',
                      background: '#0f172a', border: '1px solid #334155',
                      borderRadius: 3, color: '#ef4444', fontSize: 10,
                    }} />
                </div>
              </div>
            </div>
          )}

          {/* 시작 버튼 */}
          <button onClick={anyActive ? undefined : handleStart} disabled={anyActive} style={{
            width: '100%', marginTop: 6, padding: '8px 0',
            background: anyActive
              ? 'rgba(100,116,139,0.3)'
              : mode === 'multi'
                ? 'linear-gradient(135deg,#d97706,#f59e0b)'
                : mode === 'iterative'
                  ? 'linear-gradient(135deg,#6d28d9,#4c1d95)'
                  : 'linear-gradient(135deg,#2563eb,#1d4ed8)',
            border: `1px solid ${anyActive ? '#475569' : mode === 'multi' ? '#f59e0b' : mode === 'iterative' ? '#7c3aed' : '#3b82f6'}`,
            borderRadius: 4, color: anyActive ? '#64748b' : '#fff',
            fontSize: 11, fontWeight: 'bold', cursor: anyActive ? 'not-allowed' : 'pointer',
          }}>
            {anyActive
              ? (isMultiRunning ? '병렬 학습 진행 중...' : isIterRunning ? '반복 학습 진행 중...' : '학습 진행 중...')
              : mode === 'multi' ? '전체 병렬 학습 시작 (84개)'
                : mode === 'iterative' ? '반복 학습 시작'
                : '학습 시작 (Start Training)'}
          </button>
        </div>
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
      <span style={{ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}

function fmtReward(v) {
  if (v == null || isNaN(v)) return '—';
  return Number(v).toFixed(2);
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function fmtPct(v) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
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

// ── 다중 모델 병렬 학습 진행 컴포넌트 ─────────────────────────
const ROUTES_ORDER = ['NSR', 'NWP', 'TSR'];
const SHIP_ORDER   = ['bulk', 'tanker', 'container', 'lng'];
const ICE_ORDER    = ['PC7', 'PC6', 'PC5', 'PC4', 'PC3', 'IA_Super', 'IA'];

function modelDot(m) {
  if (m.error)     return { color: '#ef4444', label: '오류' };
  if (m.converged) return { color: '#34d399', label: '수렴' };
  if (m.is_running) return { color: '#f59e0b', label: '학습중' };
  return { color: '#475569', label: '대기' };
}

function RLMultiModelProgress({ multiStatus }) {
  const models = multiStatus?.models ?? {};

  const totalRunning   = multiStatus?.running_models ?? 0;
  const totalConverged = multiStatus?.converged_models ?? 0;
  const totalModels    = multiStatus?.total_models ?? 0;

  return (
    <div style={{ marginBottom: 8 }}>
      {/* 요약 배지 */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[
          { label: '전체',  value: totalModels,   color: '#94a3b8' },
          { label: '학습중', value: totalRunning,  color: '#f59e0b' },
          { label: '수렴',  value: totalConverged, color: '#34d399' },
        ].map(b => (
          <div key={b.label} style={{
            flex: 1, textAlign: 'center', padding: '4px 0',
            background: `${b.color}11`,
            border: `1px solid ${b.color}44`,
            borderRadius: 4,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: b.color }}>{b.value}</div>
            <div style={{ fontSize: 8, color: '#64748b' }}>{b.label}</div>
          </div>
        ))}
      </div>

      {/* 항로별 그룹 */}
      {ROUTES_ORDER.map(route => {
        const routeColor = ROUTE_COLORS[route] ?? '#94a3b8';
        return (
          <div key={route} style={{ marginBottom: 8 }}>
            {/* 항로 헤더 */}
            <div style={{
              fontSize: 9, fontWeight: 700, color: routeColor,
              borderBottom: `1px solid ${routeColor}33`,
              paddingBottom: 2, marginBottom: 4,
              letterSpacing: '0.05em',
            }}>
              {route}
            </div>

            {/* 선종별 그룹 */}
            {SHIP_ORDER.map(shipType => {
              const shipColor = SHIP_COLORS[shipType] ?? '#94a3b8';
              const shipLabel = SHIP_LABELS[shipType] ?? shipType;

              // 이 항로+선종에 속하는 모델들 (빙급 순)
              const rows = ICE_ORDER.map(iceKey => {
                const key = `${route}_${iceKey}_${shipType}`;
                return { iceKey, model: models[key] };
              }).filter(({ model }) => model != null);

              if (rows.length === 0) return null;

              return (
                <div key={shipType} style={{ marginBottom: 5 }}>
                  {/* 선종 서브헤더 */}
                  <div style={{
                    fontSize: 8, color: shipColor, marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{
                      display: 'inline-block', width: 6, height: 6,
                      borderRadius: '50%', background: shipColor, flexShrink: 0,
                    }} />
                    {shipLabel}
                  </div>

                  {/* 빙급별 행 */}
                  {rows.map(({ iceKey, model }) => {
                    const dot = modelDot(model);
                    const iceLabel = iceKey.replace('_', ' ');
                    const sr = model.latest_metrics?.success_rate;
                    const cr = model.latest_metrics?.collision_rate;
                    return (
                      <div key={iceKey} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        marginBottom: 2, paddingLeft: 10,
                      }}>
                        {/* 상태 점 */}
                        <span style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: dot.color, flexShrink: 0,
                        }} title={dot.label} />
                        {/* 빙급 */}
                        <span style={{ fontSize: 8, color: '#94a3b8', width: 38, flexShrink: 0 }}>
                          {iceLabel}
                        </span>
                        {/* 반복 */}
                        <span style={{ fontSize: 8, color: '#64748b', width: 22, flexShrink: 0 }}>
                          {model.current_iteration > 0 ? `#${model.current_iteration}` : '—'}
                        </span>
                        {/* 성공률 */}
                        <span style={{
                          fontSize: 8, fontWeight: 600,
                          color: rateColor(sr), width: 34, flexShrink: 0,
                        }}>
                          {sr != null ? `${(sr * 100).toFixed(0)}%` : '—'}
                        </span>
                        {/* 충돌률 */}
                        <span style={{
                          fontSize: 8, fontWeight: 600,
                          color: collisionColor(cr),
                        }}>
                          {cr != null ? `충${(cr * 100).toFixed(0)}%` : ''}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
