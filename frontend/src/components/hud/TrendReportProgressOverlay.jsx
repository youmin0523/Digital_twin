import { useEffect, useState } from 'react';

const STAGE_ORDER = ['easy (1/3)', 'medium (2/3)', 'hard (3/3)'];
const STAGE_COLOR = {
  'easy (1/3)': '#34d399',
  'medium (2/3)': '#f59e0b',
  'hard (3/3)': '#ef4444',
};

const SHIP_LABELS = {
  bulk: '벌크선',
  tanker: '탱커',
  container: '컨테이너선',
  lng: 'LNG선',
};
const SHIP_COLORS = {
  bulk: '#60a5fa',
  tanker: '#f59e0b',
  container: '#34d399',
  lng: '#a78bfa',
};

const POLL_MS = 2000;

export default function TrendReportProgressOverlay() {
  const [status, setStatus]         = useState(null);
  const [iterStatus, setIterStatus] = useState(null);
  const [multiStatus, setMultiStatus] = useState(null);
  const [serverUp, setServerUp]     = useState(true);
  const [lastSeen, setLastSeen]     = useState(null);
  const [mode, setMode]             = useState('curriculum');
  const [difficulty, setDifficulty] = useState('medium');
  const [timesteps, setTimesteps]   = useState(100000);
  const [maxIter, setMaxIter]       = useState(10);
  const [targetSuccess, setTargetSuccess]         = useState(0.80);
  const [targetProhibitive, setTargetProhibitive] = useState(0.10);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        // Report 서버가 준비됐을 때만 폴링
        const health = await fetch('/api/health/services').then(r => r.ok ? r.json() : null).catch(() => null);
        if (!health?.report) { if (alive) setServerUp(false); return; }

        const [r1, r2, r3] = await Promise.allSettled([
          fetch('/api/report/rl/status'),
          fetch('/api/report/rl/departure/train/iterative/status'),
          fetch('/api/report/rl/multi/status'),
        ]);
        let gotAny = false;
        let s = null, it = null, ms = null;
        if (r1.status === 'fulfilled' && r1.value.ok && alive) { s = await r1.value.json(); setStatus(s); gotAny = true; }
        else if (r1.status === 'fulfilled' && !r1.value.ok) { gotAny = true; }
        if (r2.status === 'fulfilled' && r2.value.ok && alive) { it = await r2.value.json(); setIterStatus(it); gotAny = true; }
        else if (r2.status === 'fulfilled' && !r2.value.ok) { gotAny = true; }
        if (r3.status === 'fulfilled' && r3.value.ok && alive) { ms = await r3.value.json(); setMultiStatus(ms); gotAny = true; }
        else if (r3.status === 'fulfilled' && !r3.value.ok) { gotAny = true; }
        if (alive) setServerUp(gotAny);

        // 콘솔 학습 진행 로그
        if (alive) {
          if (ms?.is_running) {
            const cur = ms.running_models ?? 0;
            const tot = ms.total_models ?? 0;
            const conv = ms.converged_models ?? 0;
            console.log(`[Trend Report 강화학습] 전체 병렬 학습 — ${cur}/${tot}번째 진행 중 | 수렴 ${conv}개`);
          } else if (it?.is_running) {
            const iter = it.current_iteration ?? 0;
            const maxIt = it.max_iterations ?? '?';
            console.log(`[Trend Report 강화학습] 반복 학습 — ${iter}/${maxIt}번째 진행 중`);
          } else if (s?.is_training) {
            const stage = s.current_stage ?? '—';
            const pct = s.progress ?? 0;
            console.log(`[Trend Report 강화학습] 커리큘럼 학습 — 단계: ${stage} | 진행: ${pct}%`);
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
    if (running) setLastSeen({ multiStatus, iterStatus, status });
  }, [multiStatus, iterStatus, status]);

  const isMultiRunning = multiStatus?.is_running ?? false;
  const isIterRunning  = iterStatus?.is_running ?? false;
  const isTraining     = status?.is_training ?? false;
  const anyActive      = isTraining || isIterRunning || isMultiRunning;
  const wasRunning     = lastSeen != null;

  const stage      = status?.current_stage ?? null;
  const stageColor = STAGE_COLOR[stage] ?? '#10b981';
  const totalPct   = (status?.progress ?? 0) / 100;
  const curIter    = iterStatus?.current_iteration ?? 0;
  const latestMetrics = iterStatus?.latest_metrics ?? {};

  async function handleStop() {
    try {
      if (isMultiRunning) {
        await fetch('/api/report/rl/multi/stop', { method: 'POST' });
      } else if (isIterRunning) {
        await fetch('/api/report/rl/departure/train/iterative/stop', { method: 'POST' });
      } else {
        await fetch('/api/report/rl/stop', { method: 'POST' });
      }
    } catch (e) { console.error('학습 중단 실패:', e); }
  }

  async function handleStart() {
    try {
      let res;
      if (mode === 'multi') {
        res = await fetch('/api/report/rl/multi/train', {
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
      } else if (mode === 'iterative') {
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

  const borderColor = isMultiRunning ? '#f59e0b'
    : isIterRunning ? '#a78bfa'
    : stageColor;

  return (
    <div style={{
      width: isMultiRunning ? 320 : 240,
      background: 'rgba(13,19,41,0.93)',
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
          Trend Report 학습
          {isMultiRunning ? ' (전체 병렬)' : isIterRunning ? ' (반복)' : ''}
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
              : status === null ? '대기' : stage ?? '—'}
        </span>
      </div>

      {/* 서버 다운 배너 */}
      {!serverUp && wasRunning && (
        <div style={{
          marginBottom: 8, padding: '4px 8px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444455',
          borderRadius: 4, fontSize: 9, color: '#fca5a5',
        }}>
          ⚠ Report 서버 재연결 중... (학습 계속 실행 중)
        </div>
      )}
      {!serverUp && !wasRunning && (
        <div style={{
          marginBottom: 8, padding: '4px 8px',
          background: 'rgba(71,85,105,0.3)', border: '1px solid #33415533',
          borderRadius: 4, fontSize: 9, color: '#64748b',
        }}>
          Report 서버 대기 중
        </div>
      )}

      {/* 서버 다운 시 마지막 학습 상태 */}
      {!serverUp && wasRunning && (() => {
        const lm = lastSeen?.multiStatus;
        const li = lastSeen?.iterStatus;
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
                {lm.running_models ?? 0}/{lm.total_models ?? 28} 실행중 · 수렴 {lm.converged_models ?? 0}개
              </div>
              {best && (
                <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>
                  {best.ice_class} / {best.ship_type} #{best.current_iteration}회
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

      {/* 다중 모델 진행 */}
      {isMultiRunning && multiStatus?.models && (
        <MultiModelProgress multiStatus={multiStatus} />
      )}

      {/* 단일 반복 학습 */}
      {isIterRunning && !isMultiRunning && (
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
          {latestMetrics.success_rate != null && (
            <>
              <MetricRow label="성공률"
                value={`${(latestMetrics.success_rate * 100).toFixed(1)}%`}
                color={latestMetrics.success_rate > 0.7 ? '#34d399' : latestMetrics.success_rate > 0.4 ? '#f59e0b' : '#ef4444'} />
              <MetricRow label="금지구간 비율"
                value={`${((latestMetrics.prohibitive_rate ?? 0) * 100).toFixed(1)}%`}
                color={(latestMetrics.prohibitive_rate ?? 1) < 0.1 ? '#34d399' : (latestMetrics.prohibitive_rate ?? 1) < 0.3 ? '#f59e0b' : '#ef4444'} />
            </>
          )}
        </div>
      )}

      {/* 일반 커리큘럼 학습 */}
      {isTraining && !isIterRunning && !isMultiRunning && (
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
              const idx = STAGE_ORDER.indexOf(stage);
              return (
                <div key={s} style={{
                  flex: 1, height: 4, borderRadius: 2,
                  background: i < idx ? STAGE_COLOR[s] : i === idx ? stageColor : 'rgba(255,255,255,0.08)',
                  opacity: i < idx ? 0.6 : 1,
                }} />
              );
            })}
          </div>
        </>
      )}

      {/* 공통 메트릭 */}
      {status !== null && !isMultiRunning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <MetricRow label="완료된 스텝" value={fmtNum(status?.total_timesteps_done)} color="#e2e8f0" />
          <MetricRow label="목표 스텝"   value={fmtNum(status?.total_timesteps_target)} color="#94a3b8" />
          <MetricRow label="경과 시간"   value={status?.elapsed_seconds != null ? `${status.elapsed_seconds}s` : '—'} color="#94a3b8" />
        </div>
      )}

      {/* 학습 설정 (비활성 시) */}
      {!anyActive && (
        <div style={{
          marginTop: 10, padding: 8,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 4, border: '1px solid #1e293b',
        }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>학습 모드 설정</div>

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
                    : 'rgba(5,150,105,0.4)'
                  : 'transparent',
                border: `1px solid ${mode === key
                  ? key === 'multi' ? '#f59e0b'
                    : key === 'iterative' ? '#7c3aed'
                    : '#10b981'
                  : '#334155'}`,
                borderRadius: 3,
                color: mode === key
                  ? key === 'multi' ? '#fde68a'
                    : key === 'iterative' ? '#c4b5fd'
                    : '#6ee7b7'
                  : '#64748b',
                cursor: 'pointer',
              }}>
                {label}
              </button>
            ))}
          </div>

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

          {(mode === 'curriculum' || mode === 'single') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
              <span style={{ fontSize: 9, color: '#64748b' }}>반복:</span>
              <input type="number" value={timesteps}
                onChange={(e) => setTimesteps(parseInt(e.target.value) || 10000)}
                step={10000} style={{
                  flex: 1, padding: '2px 4px',
                  background: '#0f172a', border: '1px solid #334155',
                  borderRadius: 3, color: '#f59e0b', fontSize: 10,
                }} />
            </div>
          )}

          {(mode === 'iterative' || mode === 'multi') && (
            <div style={{ marginBottom: 8 }}>
              {mode === 'multi' ? (
                <div style={{
                  padding: '5px 7px', marginBottom: 6,
                  background: 'rgba(245,158,11,0.08)',
                  border: '1px solid #f59e0b33',
                  borderRadius: 4, fontSize: 9, color: '#fde68a', lineHeight: 1.6,
                }}>
                  빙급 7종 × 선종 4종 = <b>28개 모델</b>을<br />동시에 반복 학습합니다
                </div>
              ) : (
                <div style={{
                  padding: '5px 7px', marginBottom: 6,
                  background: 'rgba(109,40,217,0.1)',
                  border: '1px solid #7c3aed33',
                  borderRadius: 4, fontSize: 9, color: '#a78bfa', lineHeight: 1.5,
                }}>
                  학습 완료 → 분석 → 보상 조정 → 재학습
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <SettingRow label="최대 반복" color={mode === 'multi' ? '#fde68a' : '#c4b5fd'}>
                  <input type="number" value={maxIter}
                    onChange={(e) => setMaxIter(parseInt(e.target.value) || 1)}
                    min={1} max={20} style={mkInputStyle(mode === 'multi' ? '#fde68a' : '#c4b5fd')} />
                </SettingRow>
                <SettingRow label="목표 성공률" color="#34d399">
                  <input type="number" value={targetSuccess}
                    onChange={(e) => setTargetSuccess(parseFloat(e.target.value) || 0.8)}
                    min={0.1} max={1.0} step={0.05} style={mkInputStyle('#34d399')} />
                </SettingRow>
                <SettingRow label="금지구간 목표" color="#ef4444">
                  <input type="number" value={targetProhibitive}
                    onChange={(e) => setTargetProhibitive(parseFloat(e.target.value) || 0.1)}
                    min={0.01} max={0.5} step={0.01} style={mkInputStyle('#ef4444')} />
                </SettingRow>
              </div>
            </div>
          )}

          <button onClick={handleStart} style={{
            width: '100%', marginTop: 6, padding: '8px 0',
            background: mode === 'multi'
              ? 'linear-gradient(135deg,#d97706,#f59e0b)'
              : mode === 'iterative'
                ? 'linear-gradient(135deg,#6d28d9,#4c1d95)'
                : 'linear-gradient(135deg,#059669,#10b981)',
            border: `1px solid ${mode === 'multi' ? '#f59e0b' : mode === 'iterative' ? '#7c3aed' : '#059669'}`,
            borderRadius: 4, color: '#fff',
            fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
          }}>
            {mode === 'multi' ? '전체 병렬 학습 시작 (28개)'
              : mode === 'iterative' ? '반복 학습 시작'
              : 'RL 학습 시작'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── 다중 모델 진행 표시 ──────────────────────────────────── */
function MultiModelProgress({ multiStatus }) {
  const models    = multiStatus?.models ?? {};
  const converged = multiStatus?.converged_models ?? 0;
  const total     = multiStatus?.total_models ?? 0;
  const running   = multiStatus?.running_models ?? 0;

  const byShip = {};
  Object.entries(models).forEach(([key, m]) => {
    const st = m.ship_type;
    if (!byShip[st]) byShip[st] = [];
    byShip[st].push({ key, ...m });
  });

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <SummaryBadge label="전체"  value={total}     color="#94a3b8" />
        <SummaryBadge label="학습중" value={running}  color="#f59e0b" />
        <SummaryBadge label="수렴"  value={converged} color="#34d399" />
      </div>

      {Object.entries(byShip).map(([shipType, entries]) => (
        <div key={shipType} style={{ marginBottom: 8 }}>
          <div style={{
            fontSize: 9, fontWeight: 700,
            color: SHIP_COLORS[shipType] ?? '#94a3b8',
            marginBottom: 4, letterSpacing: '0.05em',
          }}>
            {SHIP_LABELS[shipType] ?? shipType}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {entries.map((m) => (
              <ModelRow key={m.key} model={m} shipColor={SHIP_COLORS[shipType] ?? '#94a3b8'} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelRow({ model, shipColor }) {
  const sr = model.latest_metrics?.success_rate;
  const pr = model.latest_metrics?.prohibitive_rate;
  const dot = model.converged ? '#34d399'
    : model.error ? '#ef4444'
    : model.is_running ? shipColor
    : '#475569';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '3px 5px', borderRadius: 4,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${dot}22`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0,
        boxShadow: model.is_running ? `0 0 4px ${dot}` : 'none',
      }} />
      <span style={{ fontSize: 9, color: '#cbd5e1', width: 52, flexShrink: 0 }}>
        {model.ice_class}
      </span>
      <span style={{ fontSize: 9, color: '#64748b', flexShrink: 0 }}>
        {model.current_iteration > 0 ? `${model.current_iteration}회` : '대기'}
      </span>
      {sr != null && (
        <span style={{
          fontSize: 9, marginLeft: 'auto', flexShrink: 0,
          color: sr > 0.7 ? '#34d399' : sr > 0.4 ? '#f59e0b' : '#ef4444',
        }}>
          {(sr * 100).toFixed(0)}%
        </span>
      )}
      {pr != null && (
        <span style={{
          fontSize: 9, flexShrink: 0,
          color: pr < 0.1 ? '#34d399' : pr < 0.3 ? '#f59e0b' : '#ef4444',
        }}>
          /{(pr * 100).toFixed(0)}%
        </span>
      )}
      {model.converged && <span style={{ fontSize: 8, color: '#34d399', flexShrink: 0 }}>✓</span>}
      {model.error    && <span style={{ fontSize: 8, color: '#ef4444', flexShrink: 0 }}>!</span>}
    </div>
  );
}

/* ── 공용 컴포넌트 ────────────────────────────────────────── */
function SummaryBadge({ label, value, color }) {
  return (
    <div style={{
      flex: 1, textAlign: 'center', padding: '3px 4px',
      background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 4,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 8, color: '#64748b' }}>{label}</div>
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

function SettingRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <span style={{ fontSize: 9, color: '#64748b', width: 70 }}>{label}:</span>
      {children}
    </div>
  );
}

function mkInputStyle(color) {
  return {
    flex: 1, padding: '2px 4px',
    background: '#0f172a', border: '1px solid #334155',
    borderRadius: 3, color, fontSize: 10,
  };
}

function fmtNum(n) {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}
