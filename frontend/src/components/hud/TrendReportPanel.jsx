import React, { useState, useRef, useCallback } from 'react';

const ROUTES = ['NSR', 'NWP', 'TSR'];
const ICE_CLASSES = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'IA Super', 'IA', 'IB', 'IC'];
const FORECAST_OPTIONS = [30, 45, 60];

function stageLabel(pct) {
  if (pct < 10)  return 'LOADING DATA...';
  if (pct < 20)  return 'POLARIS RIO SCORING...';
  if (pct < 30)  return 'RL DEPARTURE ANALYSIS...';
  if (pct < 40)  return 'RL AVOIDANCE ANALYSIS...';
  if (pct < 75)  return 'AI ANALYSIS (CLAUDE)...';
  if (pct < 100) return 'GENERATING PDF...';
  return 'COMPLETE';
}

function rlStageLabel(pct) {
  if (pct < 20)  return 'EASY (하절기)...';
  if (pct < 60)  return 'MEDIUM (춘추)...';
  if (pct < 100) return 'HARD (동절기)...';
  return 'COMPLETE';
}

export default function TrendReportPanel() {
  const [collapsed, setCollapsed] = useState(true);
  const [route, setRoute] = useState('NSR');
  const [iceClass, setIceClass] = useState('PC5');
  const [departureDate, setDepartureDate] = useState('');
  const [forecastDays, setForecastDays] = useState(30);
  const [transitDays, setTransitDays] = useState(14);

  // 보고서 생성 상태
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStage, setGenStage] = useState('');
  const [genComplete, setGenComplete] = useState(false);
  const genJobRef = useRef(null);
  const genPollRef = useRef(null);

  // RL 학습 상태
  const [training, setTraining] = useState(false);
  const [trainProgress, setTrainProgress] = useState(0);
  const [trainStage, setTrainStage] = useState('');
  const [rlTrained, setRlTrained] = useState(false);
  const trainJobRef = useRef(null);
  const trainPollRef = useRef(null);

  // RL 학습 시작
  const startTraining = useCallback(async () => {
    setTraining(true);
    setTrainProgress(0);
    setTrainStage('STARTING...');

    try {
      const res = await fetch('/api/report/rl/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curriculum: true }),
      });
      const data = await res.json();
      trainJobRef.current = data.job_id;

      trainPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/report/rl/train-status/${data.job_id}`);
          const st = await sr.json();
          const pct = st.progress || 0;
          setTrainProgress(pct);
          setTrainStage(rlStageLabel(pct));

          if (st.status === 'completed' || (!st.is_training && pct >= 100)) {
            clearInterval(trainPollRef.current);
            setTraining(false);
            setRlTrained(true);
            setTrainStage('COMPLETE');
          } else if (st.status === 'failed') {
            clearInterval(trainPollRef.current);
            setTraining(false);
            setTrainStage('FAILED');
          }
        } catch {
          clearInterval(trainPollRef.current);
          setTraining(false);
        }
      }, 2000);
    } catch {
      setTrainStage('CONNECTION ERROR');
      setTraining(false);
    }
  }, []);

  // 보고서 생성 시작
  const startGeneration = useCallback(async () => {
    setGenerating(true);
    setGenProgress(0);
    setGenStage('STARTING...');
    setGenComplete(false);

    try {
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route,
          ice_class: iceClass,
          departure_date_start: departureDate,
          forecast_days: forecastDays,
          transit_days: transitDays,
        }),
      });
      const data = await res.json();
      genJobRef.current = data.job_id;

      genPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/report/status/${data.job_id}`);
          const st = await sr.json();
          const pct = st.progress || 0;
          setGenProgress(pct);
          setGenStage(stageLabel(pct));

          if (st.status === 'completed') {
            clearInterval(genPollRef.current);
            setGenerating(false);
            setGenComplete(true);
          } else if (st.status === 'failed') {
            clearInterval(genPollRef.current);
            setGenerating(false);
            setGenStage('FAILED: ' + (st.error || ''));
          }
        } catch {
          clearInterval(genPollRef.current);
          setGenerating(false);
        }
      }, 800);
    } catch {
      setGenStage('CONNECTION ERROR');
      setGenerating(false);
    }
  }, [route, iceClass, departureDate, forecastDays, transitDays]);

  // PDF 다운로드
  const downloadPdf = useCallback(() => {
    if (genJobRef.current) {
      window.open(`/api/report/download/${genJobRef.current}`, '_blank');
    }
  }, []);

  if (collapsed) {
    return (
      <div
        onClick={() => setCollapsed(false)}
        style={{
          position: 'absolute',
          right: 10,
          top: 320,
          zIndex: 400,
          background: 'rgba(13, 19, 41, 0.92)',
          border: '1px solid #1a2a4a',
          borderRadius: 8,
          padding: '8px 14px',
          cursor: 'pointer',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          fontFamily: "'Segoe UI', system-ui, sans-serif",
          fontSize: 12,
          color: '#93c5fd',
          letterSpacing: 0.5,
        }}
      >
        TREND REPORT
      </div>
    );
  }

  return (
    <div style={{
      position: 'absolute',
      right: 10,
      top: 320,
      width: 290,
      zIndex: 400,
      background: 'rgba(13, 19, 41, 0.92)',
      border: '1px solid #1a2a4a',
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#93c5fd', letterSpacing: 1 }}>
          TREND REPORT
        </div>
        <span
          onClick={() => setCollapsed(true)}
          style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 16, lineHeight: 1 }}
        >
          ×
        </span>
      </div>

      {/* Route selection */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>ROUTE</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {ROUTES.map((r) => (
            <button
              key={r}
              onClick={() => setRoute(r)}
              style={{
                flex: 1,
                padding: '4px 0',
                background: route === r ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${route === r ? '#2563eb' : '#1e3a8a'}`,
                borderRadius: 4,
                color: route === r ? '#93c5fd' : '#6b89b0',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Ice class */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>ICE CLASS</div>
        <select
          value={iceClass}
          onChange={(e) => setIceClass(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 6px',
            background: '#0f172a',
            border: '1px solid #1e3a8a',
            borderRadius: 4,
            color: '#93c5fd',
            fontSize: 11,
          }}
        >
          {ICE_CLASSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Departure date */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>DEPARTURE DATE</div>
        <input
          type="date"
          value={departureDate}
          onChange={(e) => setDepartureDate(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 6px',
            background: '#0f172a',
            border: '1px solid #1e3a8a',
            borderRadius: 4,
            color: '#93c5fd',
            fontSize: 11,
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Forecast days */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>
          FORECAST: <span style={{ color: '#93c5fd' }}>{forecastDays}d</span>
          {' | '}TRANSIT: <span style={{ color: '#93c5fd' }}>{transitDays}d</span>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {FORECAST_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setForecastDays(d)}
              style={{
                flex: 1,
                padding: '3px 0',
                background: forecastDays === d ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${forecastDays === d ? '#2563eb' : '#1e3a8a'}`,
                borderRadius: 4,
                color: forecastDays === d ? '#93c5fd' : '#6b89b0',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* RL Model Status & Train button */}
      <div style={{
        marginBottom: 8,
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 4,
        border: '1px solid #1e3a8a',
      }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 4, letterSpacing: 1 }}>
          RL MODEL: <span style={{ color: rlTrained ? '#34d399' : '#f59e0b' }}>
            {rlTrained ? 'TRAINED' : training ? 'TRAINING...' : 'NOT TRAINED'}
          </span>
        </div>
        <button
          onClick={startTraining}
          disabled={training}
          style={{
            width: '100%',
            padding: '5px 0',
            background: training
              ? 'rgba(37,99,235,0.1)'
              : 'linear-gradient(135deg,#065f46,#047857)',
            border: '1px solid #059669',
            borderRadius: 4,
            color: training ? '#6b89b0' : '#d1fae5',
            fontSize: 11,
            fontWeight: 'bold',
            cursor: training ? 'default' : 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {training ? 'TRAINING...' : 'RL MODEL TRAIN'}
        </button>

        {/* RL Training progress */}
        {(training || trainProgress > 0) && (
          <div style={{ marginTop: 5 }}>
            <div style={{
              background: '#0f172a',
              borderRadius: 3,
              overflow: 'hidden',
              height: 4,
              border: '1px solid #1e3a8a',
            }}>
              <div style={{
                width: `${trainProgress}%`,
                height: '100%',
                background: 'linear-gradient(90deg,#059669,#34d399)',
                transition: 'width 0.5s',
              }} />
            </div>
            <div style={{ fontSize: 9, color: '#6b89b0', marginTop: 2 }}>
              {trainProgress}% — {trainStage}
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <button
        onClick={startGeneration}
        disabled={generating}
        style={{
          width: '100%',
          padding: '9px 0',
          background: generating
            ? 'rgba(37,99,235,0.15)'
            : 'linear-gradient(135deg,#1e40af,#1d4ed8)',
          border: '1px solid #2563eb',
          borderRadius: 6,
          color: generating ? '#6b89b0' : '#e0f0ff',
          fontSize: 13,
          fontFamily: "'Courier New', monospace",
          fontWeight: 'bold',
          cursor: generating ? 'default' : 'pointer',
          letterSpacing: 0.5,
        }}
      >
        {generating ? 'GENERATING...' : genComplete ? 'RE-GENERATE' : 'GENERATE REPORT'}
      </button>

      {/* Generation progress */}
      {(generating || genProgress > 0) && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            background: '#0f172a',
            borderRadius: 4,
            overflow: 'hidden',
            height: 5,
            border: '1px solid #1e3a8a',
          }}>
            <div style={{
              width: `${genProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#6b89b0', marginTop: 3 }}>
            {genProgress}% — {genStage}
          </div>
        </div>
      )}

      {/* Download button */}
      {genComplete && (
        <button
          onClick={downloadPdf}
          style={{
            width: '100%',
            marginTop: 8,
            padding: '8px 0',
            background: 'linear-gradient(135deg,#065f46,#047857)',
            border: '1px solid #059669',
            borderRadius: 6,
            color: '#d1fae5',
            fontSize: 12,
            fontWeight: 'bold',
            cursor: 'pointer',
            letterSpacing: 0.5,
          }}
        >
          DOWNLOAD PDF
        </button>
      )}
    </div>
  );
}
