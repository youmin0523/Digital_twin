import React, { useState, useRef, useCallback } from 'react';

const RECOMMENDATION_STYLE = {
  '추천':   { color: '#34d399', border: '#22c55e', icon: '✓' },
  '조건부': { color: '#fbbf24', border: '#f59e0b', icon: '△' },
  '비추천': { color: '#f87171', border: '#ef4444', icon: '✕' },
  '기준':   { color: '#93c5fd', border: '#3b82f6', icon: '◆' },
};

// 가설 시나리오 식별: name 또는 label에 [HYP] / 【가설】 prefix가 있거나 is_hypothetical 플래그
function isHypothetical(sc) {
  if (sc?.is_hypothetical === true) return true;
  const t = (sc?.name || sc?.label || '');
  return t.includes('[HYP]') || t.includes('【가설】');
}

// 추천 분포 카운트
function countRec(scenarios) {
  const out = { '추천': 0, '조건부': 0, '비추천': 0 };
  for (const s of scenarios) {
    const r = s.recommendation;
    if (r in out) out[r] += 1;
  }
  return out;
}

// 도넛 차트 (SVG, 의존성 없음)
function DonutChart({ counts, size = 80 }) {
  const total = counts['추천'] + counts['조건부'] + counts['비추천'];
  if (total === 0) return null;
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const segs = [
    { val: counts['추천'],   color: '#22c55e' },
    { val: counts['조건부'], color: '#f59e0b' },
    { val: counts['비추천'], color: '#ef4444' },
  ];
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {segs.map((s, i) => {
        if (s.val === 0) return null;
        const len = (s.val / total) * c;
        const dash = `${len} ${c - len}`;
        const offset = -acc;
        acc += len;
        return (
          <circle key={i}
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={s.color} strokeWidth={10}
            strokeDasharray={dash} strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
      })}
      <text x={size / 2} y={size / 2} textAnchor="middle" dy="0.35em"
        fontSize={14} fontWeight="bold" fill="#e2e8f0">{total}</text>
    </svg>
  );
}

const STATUS_BADGE = {
  good:      { label: '수렴 — 변별 양호',           bg: 'rgba(52,211,153,0.12)',  fg: '#34d399', bd: 'rgba(52,211,153,0.4)'  },
  collapse:  { label: '붕괴 — 모두 비추천',           bg: 'rgba(239,68,68,0.10)',   fg: '#f87171', bd: 'rgba(239,68,68,0.4)'   },
  stalled:   { label: '정체 — 시나리오 더 안 늘어남', bg: 'rgba(245,158,11,0.10)',  fg: '#fbbf24', bd: 'rgba(245,158,11,0.4)'  },
  improving: { label: '진행 중 — 추가 반복 권장',     bg: 'rgba(59,130,246,0.10)',  fg: '#93c5fd', bd: 'rgba(59,130,246,0.4)'  },
};

// 단일 시나리오 카드 — 메인/가설 공용
function ScenarioCard({ sc, hyp = false }) {
  const rec = sc.recommendation || '기준';
  const s = RECOMMENDATION_STYLE[rec] || RECOMMENDATION_STYLE['기준'];
  const rs = sc.route_summary || {};
  return (
    <div style={{
      background: hyp ? 'rgba(245,158,11,0.04)' : 'rgba(255,255,255,0.03)',
      borderRadius: 6, padding: '8px 10px', marginBottom: 5,
      borderLeft: `3px solid ${s.border}`,
      borderRight: hyp ? '1px dashed rgba(245,158,11,0.3)' : 'none',
    }}>
      <div style={{ fontSize: 12, fontWeight: 'bold', color: s.color,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {s.icon} {sc.name || sc.label || '시나리오'}
        </span>
        <span style={{
          fontSize: 9, padding: '1px 6px',
          background: `${s.border}22`, border: `1px solid ${s.border}`,
          borderRadius: 3, flexShrink: 0, marginLeft: 4,
        }}>{rec}</span>
      </div>
      {sc.description && (
        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, lineHeight: 1.4 }}>
          {sc.description.substring(0, 80)}{sc.description.length > 80 ? '...' : ''}
        </div>
      )}
      {rs.avg_rio !== undefined && (
        <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 4, lineHeight: 1.5 }}>
          RIO {rs.avg_rio} | 🟢{rs.green_days || 0} 🟡{rs.yellow_days || 0} 🔴{rs.red_days || 0}
        </div>
      )}
    </div>
  );
}

export default function WhatIfPanel({ route = 'NSR', iceClass = 'PC5' }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [stats, setStats] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const jobIdRef = useRef(null);
  const pollRef = useRef(null);

  const startWhatIf = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    setResult(null);
    setError('');

    try {
      const res = await fetch('/api/report/whatif', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route,
          ice_class: iceClass,
          departure_date_start: new Date().toISOString().split('T')[0],
          forecast_days: 30,
        }),
      });
      const data = await res.json();
      jobIdRef.current = data.job_id;

      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/report/whatif/status/${data.job_id}`);
          const st = await sr.json();
          setProgress(st.progress || 0);

          if (st.status === 'completed' && st.result) {
            clearInterval(pollRef.current);
            setResult(st.result);
            setRunning(false);
          } else if (st.status === 'failed') {
            clearInterval(pollRef.current);
            setError(st.error || '분석 실패');
            setRunning(false);
          }
        } catch {
          clearInterval(pollRef.current);
          setError('서버 연결 오류');
          setRunning(false);
        }
      }, 1500);
    } catch {
      setError('API 연결 실패 (report-service:8002)');
      setRunning(false);
    }
  }, [route, iceClass]);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/report/whatif/stats');
      const s = await r.json();
      setStats(s);
      setShowStats(true);
    } catch {
      setError('통계 조회 실패');
    }
  }, []);

  // 시나리오 분리 (메인 vs [HYP])
  const scenarios = result?.scenarios || [];
  const realScenarios = scenarios.filter(s => !isHypothetical(s));
  const hypScenarios = scenarios.filter(isHypothetical);
  const realRec = countRec(realScenarios);
  const hypRec = countRec(hypScenarios);

  const status = result?.convergence_status || (
    scenarios.length === 0 ? null :
    realRec['비추천'] / Math.max(realScenarios.length, 1) >= 0.8 ? 'collapse' :
    realScenarios.length < 4 ? 'stalled' :
    realRec['추천'] > 0 && realRec['비추천'] > 0 ? 'good' : 'improving'
  );
  const statusInfo = status ? STATUS_BADGE[status] : null;

  return (
    <div style={{
      position: 'absolute',
      left: 690, top: 5, width: 320, zIndex: 290,
      background: 'rgba(13, 19, 41, 0.92)',
      border: '1px solid rgba(124,58,237,0.3)',
      borderRadius: 8, backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      maxHeight: 'calc(100vh - 280px)', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>WHAT-IF SCENARIO</div>
        <span onClick={loadStats}
          style={{
            cursor: 'pointer', color: '#c4b5fd', fontSize: 10,
            padding: '2px 6px', borderRadius: 3,
            border: '1px solid #4c1d95', letterSpacing: 0.5,
          }}>STATS</span>
      </div>

      <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 8 }}>
        AI가 현재 데이터를 분석하여 의미 있는 시나리오를 자동 제안하고 평가합니다.
      </div>

      <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 8, padding: '4px 8px', background: 'rgba(59,130,246,0.1)', borderRadius: 4 }}>
        항로: <strong>{route}</strong> | 빙급: <strong>{iceClass}</strong>
      </div>

      <button
        onClick={startWhatIf}
        disabled={running}
        style={{
          width: '100%', padding: '9px 0',
          background: running ? 'rgba(139,92,246,0.15)' : 'linear-gradient(135deg,#6d28d9,#7c3aed)',
          border: '1px solid #7c3aed',
          borderRadius: 6,
          color: running ? '#6b89b0' : '#e0e7ff',
          fontSize: 13,
          fontFamily: "'Courier New', monospace",
          fontWeight: 'bold',
          cursor: running ? 'default' : 'pointer',
          letterSpacing: 0.5,
        }}>
        {running ? 'AI ANALYZING...' : result ? '▶ RE-ANALYZE' : '▶ WHAT-IF ANALYSIS'}
      </button>

      {/* Progress */}
      {running && (
        <div style={{ marginTop: 10 }}>
          <div style={{ background: '#0f172a', borderRadius: 4, overflow: 'hidden', height: 5, border: '1px solid #4c1d95' }}>
            <div style={{
              width: `${progress}%`, height: '100%',
              background: 'linear-gradient(90deg,#7c3aed,#a78bfa)',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#6b89b0', marginTop: 3 }}>
            {progress}% — Claude AI 시나리오 분석 중...
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#f87171',
          background: 'rgba(248,113,113,0.1)', padding: '6px 8px', borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && scenarios.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {/* 수렴 배지 */}
          {statusInfo && (
            <div style={{
              padding: '6px 10px', borderRadius: 4, marginBottom: 8,
              fontSize: 11, fontWeight: 'bold',
              background: statusInfo.bg, border: `1px solid ${statusInfo.bd}`,
              color: statusInfo.fg,
            }}>
              {statusInfo.label}
            </div>
          )}

          {/* 분포 요약 카드 (텍스트만, 도넛 차트 제거) */}
          {realScenarios.length > 0 && (
            <div style={{
              padding: '8px 10px', marginBottom: 8,
              background: 'rgba(124,58,237,0.06)',
              border: '1px solid rgba(124,58,237,0.2)',
              borderRadius: 6,
              fontSize: 11,
            }}>
              <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>실측 시나리오 분포 (총 {realScenarios.length}건)</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ color: '#34d399' }}>✓ 추천 {realRec['추천']}건</span>
                <span style={{ color: '#fbbf24' }}>△ 조건부 {realRec['조건부']}건</span>
                <span style={{ color: '#f87171' }}>✕ 비추천 {realRec['비추천']}건</span>
              </div>
            </div>
          )}

          {/* 실측 시나리오 */}
          {realScenarios.length > 0 && (
            <>
              <div style={{
                fontSize: 10, color: '#a78bfa',
                borderBottom: '1px solid #4c1d95', paddingBottom: 3, marginBottom: 5,
                letterSpacing: 1, fontWeight: 'bold',
              }}>
                실측 기반 ({realScenarios.length}개)
              </div>
              {realScenarios.map((sc, i) => <ScenarioCard key={`r-${i}`} sc={sc} />)}
            </>
          )}

          {/* 가설 시나리오 (있을 때만 별도 섹션) */}
          {hypScenarios.length > 0 && (
            <>
              <div style={{
                fontSize: 10, color: '#fbbf24',
                borderBottom: '1px dashed #92400e', paddingBottom: 3, marginBottom: 5,
                marginTop: 8,
                letterSpacing: 1, fontWeight: 'bold',
              }}>
                가설 시나리오 ({hypScenarios.length}개) — 의사결정 참고만
              </div>
              {hypScenarios.map((sc, i) => <ScenarioCard key={`h-${i}`} sc={sc} hyp />)}
            </>
          )}

          {/* AI Recommendation */}
          {result.ai_recommendation && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: 'rgba(124,58,237,0.08)',
              border: '1px solid #4c1d95', borderRadius: 6,
              fontSize: 11, color: '#c4b5fd',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              <div style={{ fontSize: 10, fontWeight: 'bold', color: '#a78bfa', marginBottom: 4 }}>
                AI 종합 추천
              </div>
              {result.ai_recommendation}
            </div>
          )}
        </div>
      )}

      {/* Stats Modal */}
      {showStats && stats && (
        <div onClick={() => setShowStats(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 600,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{
              background: 'rgba(13,19,41,0.98)',
              border: '1px solid #4c1d95', borderRadius: 8,
              padding: '14px 16px', width: 360, maxHeight: '80vh', overflowY: 'auto',
              color: '#cbd5e1',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#a78bfa', letterSpacing: 1 }}>
                WHAT-IF USAGE STATS
              </div>
              <span onClick={() => setShowStats(false)}
                style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 16 }}>×</span>
            </div>

            <div style={{ fontSize: 11, lineHeight: 1.7 }}>
              <div>총 분석 실행: <b style={{ color: '#c4b5fd' }}>{stats.n_runs}</b>건</div>
              <div>평균 반복: <b>{stats.avg_iterations}</b>회 / 평균 시나리오: <b>{stats.avg_scenarios}</b>개</div>
              <div>평균 응답시간: <b>{stats.avg_latency_ms} ms</b></div>
            </div>

            <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>수렴 분포</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>
              {Object.entries(stats.convergence_dist || {}).map(([k, v]) => (
                <div key={k}>
                  <span style={{ color: STATUS_BADGE[k]?.fg || '#cbd5e1' }}>
                    {STATUS_BADGE[k]?.label || k}
                  </span>
                  : {v}건
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>항로별 호출</div>
            <table style={{ width: '100%', fontSize: 10, marginTop: 4, color: '#cbd5e1' }}>
              <tbody>
                {Object.entries(stats.by_route || {}).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td align="right">{v}건</td></tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 10, fontSize: 10, color: '#94a3b8' }}>빙급별 호출</div>
            <table style={{ width: '100%', fontSize: 10, marginTop: 4, color: '#cbd5e1' }}>
              <tbody>
                {Object.entries(stats.by_ice_class || {}).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td align="right">{v}건</td></tr>
                ))}
              </tbody>
            </table>

            <div style={{
              marginTop: 10, fontSize: 9, color: '#475569',
              borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6,
            }}>
              로그: data/whatif_run_log.jsonl
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
