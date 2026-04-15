import React, { useState, useRef, useCallback } from 'react';

const RECOMMENDATION_STYLE = {
  '추천':   { color: '#34d399', border: '#22c55e', icon: '✓' },
  '조건부': { color: '#fbbf24', border: '#f59e0b', icon: '△' },
  '비추천': { color: '#f87171', border: '#ef4444', icon: '✕' },
  '기준':   { color: '#93c5fd', border: '#3b82f6', icon: '◆' },
};

export default function WhatIfPanel({ route = 'NSR', iceClass = 'PC5' }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
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

          if (st.status === 'running' || st.status === 'pending') {
            console.log(`[What-If Scenario] AI 시나리오 분석 중 — ${st.progress ?? 0}% (항로: ${route} | 빙급: ${iceClass})`);
          } else if (st.status === 'completed' && st.result) {
            clearInterval(pollRef.current);
            setResult(st.result);
            setRunning(false);
            console.log(`[What-If Scenario] 분석 완료 — ${st.result?.scenarios?.length ?? 0}개 시나리오 생성 (항로: ${route} | 빙급: ${iceClass})`);
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

  return (
    <div style={{
      position: 'absolute',
      left: 690,
      top: 10,
      width: 280,
      zIndex: 290,
      background: 'rgba(13, 19, 41, 0.92)',
      border: '1px solid rgba(124,58,237,0.3)',
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      maxHeight: '80vh',
      overflowY: 'auto',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>🔮 WHAT-IF SCENARIO</div>

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
          width: '100%',
          padding: '9px 0',
          background: running
            ? 'rgba(139,92,246,0.15)'
            : 'linear-gradient(135deg,#6d28d9,#7c3aed)',
          border: '1px solid #7c3aed',
          borderRadius: 6,
          color: running ? '#6b89b0' : '#e0e7ff',
          fontSize: 13,
          fontFamily: "'Courier New', monospace",
          fontWeight: 'bold',
          cursor: running ? 'default' : 'pointer',
          letterSpacing: 0.5,
        }}
      >
        {running ? 'AI ANALYZING...' : result ? '▶ RE-ANALYZE' : '▶ WHAT-IF ANALYSIS'}
      </button>

      {/* Progress */}
      {running && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            background: '#0f172a',
            borderRadius: 4,
            overflow: 'hidden',
            height: 5,
            border: '1px solid #4c1d95',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
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
        <div style={{ marginTop: 8, fontSize: 11, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '6px 8px', borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {result && result.scenarios && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 10,
            color: '#6b89b0',
            borderBottom: '1px solid #4c1d95',
            paddingBottom: 5,
            marginBottom: 6,
            letterSpacing: 1,
          }}>
            {result.scenarios.length} SCENARIOS | {result.tool_calls_count || 0} TOOL CALLS
          </div>

          {result.scenarios.map((sc, i) => {
            const rec = sc.recommendation || '기준';
            const s = RECOMMENDATION_STYLE[rec] || RECOMMENDATION_STYLE['기준'];
            const rs = sc.route_summary || {};
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 5,
                borderLeft: `3px solid ${s.border}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: s.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.icon} {sc.name || `시나리오 ${i + 1}`}
                  </span>
                  <span style={{
                    fontSize: 9,
                    padding: '1px 6px',
                    background: `${s.border}22`,
                    border: `1px solid ${s.border}`,
                    borderRadius: 3,
                    flexShrink: 0,
                    marginLeft: 4,
                  }}>
                    {rec}
                  </span>
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
          })}

          {/* AI Recommendation */}
          {result.ai_recommendation && (
            <div style={{
              marginTop: 8,
              padding: '8px 10px',
              background: 'rgba(124,58,237,0.08)',
              border: '1px solid #4c1d95',
              borderRadius: 6,
              fontSize: 11,
              color: '#c4b5fd',
              lineHeight: 1.5,
              maxHeight: 120,
              overflow: 'auto',
            }}>
              <div style={{ fontSize: 10, fontWeight: 'bold', color: '#a78bfa', marginBottom: 4 }}>
                AI 종합 추천
              </div>
              {result.ai_recommendation.substring(0, 300)}
              {result.ai_recommendation.length > 300 ? '...' : ''}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
