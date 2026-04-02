import React, { useState, useRef, useCallback } from 'react';

const ROUTES = ['NSR', 'NWP', 'TSR', 'SUEZ', 'CAPE'];
const DEFAULT_CHECKED = { NSR: true, NWP: true, TSR: true, SUEZ: false, CAPE: false };

const TIER_STYLE = {
  '개척유망': { color: '#34d399', border: '#22c55e', icon: '●' },
  '조건부':   { color: '#fbbf24', border: '#f59e0b', icon: '●' },
  '불가':     { color: '#f87171', border: '#ef4444', icon: '●' },
};

function stageLabel(pct) {
  if (pct < 10)  return 'INITIALIZING...';
  if (pct < 65)  return 'POLARIS RIO SIMULATION...';
  if (pct < 80)  return 'K-MEANS CLUSTERING...';
  if (pct < 100) return 'GENERATING REPORT...';
  return 'COMPLETE';
}

export default function AiAnalysisPanel() {
  const [checked, setChecked] = useState(DEFAULT_CHECKED);
  const [maxSim, setMaxSim] = useState(200);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState(null);
  const jobIdRef = useRef(null);
  const pollRef = useRef(null);

  const toggleRoute = useCallback((r) => {
    setChecked((prev) => ({ ...prev, [r]: !prev[r] }));
  }, []);

  const startAnalysis = useCallback(async () => {
    const routes = ROUTES.filter((r) => checked[r]);
    if (routes.length === 0) return;

    setRunning(true);
    setProgress(0);
    setStage('STARTING...');
    setResult(null);

    try {
      const res = await fetch('/ai-api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routes, max_simulations: maxSim }),
      });
      const data = await res.json();
      jobIdRef.current = data.job_id;

      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/ai-api/status/${data.job_id}`);
          const st = await sr.json();
          setProgress(st.progress);
          setStage(stageLabel(st.progress));

          if (st.status === 'completed') {
            clearInterval(pollRef.current);
            const rr = await fetch(`/ai-api/results/${data.job_id}`);
            const rd = await rr.json();
            setResult(rd);
            setRunning(false);
          } else if (st.status === 'failed') {
            clearInterval(pollRef.current);
            setStage('FAILED');
            setRunning(false);
          }
        } catch {
          clearInterval(pollRef.current);
          setRunning(false);
        }
      }, 800);
    } catch {
      setStage('CONNECTION ERROR');
      setRunning(false);
    }
  }, [checked, maxSim]);

  const downloadReport = useCallback(() => {
    if (jobIdRef.current) {
      window.open(`/ai-api/report/${jobIdRef.current}`, '_blank');
    }
  }, []);

  return (
    <div className="hud" style={{ minWidth: 280, maxWidth: 300 }}>
      <div className="hud-title">⚡ AI BATCH ANALYSIS</div>

      {/* Route checkboxes */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 4, letterSpacing: 1 }}>ROUTES</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ROUTES.map((r) => (
            <label key={r} style={{ fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
              <input
                type="checkbox"
                checked={checked[r]}
                onChange={() => toggleRoute(r)}
                style={{ accentColor: '#3b82f6' }}
              />
              {r}
            </label>
          ))}
        </div>
      </div>

      {/* Simulation count slider */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 2, letterSpacing: 1 }}>
          SIMULATIONS: <span style={{ color: '#93c5fd' }}>{maxSim}</span>
        </div>
        <input
          type="range"
          min={50} max={200} step={50}
          value={maxSim}
          onChange={(e) => setMaxSim(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#3b82f6' }}
        />
      </div>

      {/* Run button */}
      <button
        onClick={startAnalysis}
        disabled={running}
        style={{
          width: '100%',
          padding: '9px 0',
          background: running
            ? 'rgba(37,99,235,0.15)'
            : 'linear-gradient(135deg,#1e40af,#1d4ed8)',
          border: '1px solid #2563eb',
          borderRadius: 6,
          color: running ? '#6b89b0' : '#e0f0ff',
          fontSize: 13,
          fontFamily: "'Courier New', monospace",
          fontWeight: 'bold',
          cursor: running ? 'default' : 'pointer',
          letterSpacing: 0.5,
        }}
      >
        {running ? 'RUNNING...' : result ? '▶ RE-ANALYZE' : '▶ BATCH SIMULATION'}
      </button>

      {/* Progress bar */}
      {(running || progress > 0) && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            background: '#0f172a',
            borderRadius: 4,
            overflow: 'hidden',
            height: 5,
            border: '1px solid #1e3a8a',
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#6b89b0', marginTop: 3 }}>
            {progress}% — {stage}
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div style={{ marginTop: 10 }}>
          <div style={{
            fontSize: 10,
            color: '#6b89b0',
            borderBottom: '1px solid #1e3a8a',
            paddingBottom: 5,
            marginBottom: 6,
            letterSpacing: 1,
          }}>
            TOTAL {result.total} RUNS | SILHOUETTE {result.silhouette}
          </div>

          {result.clusters.map((c, i) => {
            const s = TIER_STYLE[c.tier] || TIER_STYLE['조건부'];
            return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)',
                borderRadius: 6,
                padding: '8px 10px',
                marginBottom: 5,
                borderLeft: `3px solid ${s.border}`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: s.color, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.icon} {c.tier}</span>
                  <span style={{ color: '#6b89b0', fontWeight: 'normal', fontSize: 11 }}>
                    {c.count} ({c.pct}%)
                  </span>
                </div>
                <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 3, lineHeight: 1.5 }}>
                  RIO {c.avg_rio.toFixed(3)} | {c.avg_transit_days}d | ${(c.avg_cost_usd / 1000).toFixed(0)}K | {c.avg_co2.toFixed(0)}t CO₂
                </div>
              </div>
            );
          })}

          <button
            onClick={downloadReport}
            style={{
              width: '100%',
              padding: '7px 0',
              marginTop: 4,
              background: 'rgba(37,99,235,0.15)',
              border: '1px solid #1e3a8a',
              borderRadius: 6,
              color: '#93c5fd',
              fontSize: 11,
              fontFamily: "'Courier New', monospace",
              cursor: 'pointer',
            }}
          >
            📄 DOWNLOAD REPORT
          </button>
        </div>
      )}
    </div>
  );
}
