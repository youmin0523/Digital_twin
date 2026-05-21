import React, { useState, useRef, useCallback, useEffect } from 'react';

export default function SarTrainingPanel() {
  const [sarTraining, setSarTraining] = useState(false);
  const [sarProgress, setSarProgress] = useState(0);
  const [sarStage, setSarStage] = useState('');
  const [sarModelInfo, setSarModelInfo] = useState(null);
  const sarPollRef = useRef(null);

  useEffect(() => {
    fetch('/api/report/sar/model-info')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSarModelInfo(d); })
      .catch(() => {});
  }, [sarTraining]);

  const startSarTraining = useCallback(async () => {
    setSarTraining(true);
    setSarProgress(0);
    setSarStage('시작 중...');
    try {
      const res = await fetch('/api/report/sar/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epochs: 30, batch_size: 4, synthetic_count: 200, device: 'cpu' }),
      });
      if (!res.ok) {
        const err = await res.json();
        setSarStage(err.error || '시작 실패');
        setSarTraining(false);
        return;
      }

      sarPollRef.current = setInterval(async () => {
        try {
          const health = await fetch('/api/health/services').then(r => r.ok ? r.json() : null).catch(() => null);
          if (!health?.report) return;
          const sr = await fetch('/api/report/sar/train-status');
          const st = await sr.json();
          setSarProgress(st.progress || 0);
          setSarStage(st.stage || '');
          if (st.is_training) {
            console.log(`[Train YOLOv8] SAR 빙산 탐지 모델 학습 — ${st.progress ?? 0}% | 단계: ${st.stage ?? '—'}`);
          }
          if (!st.is_training && st.progress >= 100) {
            clearInterval(sarPollRef.current);
            setSarTraining(false);
            setSarStage('학습 완료!');
            console.log('[Train YOLOv8] SAR 빙산 탐지 모델 학습 완료 (100%)');
          } else if (!st.is_training && st.error) {
            clearInterval(sarPollRef.current);
            setSarTraining(false);
            setSarStage(`실패: ${st.error}`);
          }
        } catch {
          clearInterval(sarPollRef.current);
          setSarTraining(false);
        }
      }, 2000);
    } catch {
      setSarStage('API 연결 실패');
      setSarTraining(false);
    }
  }, []);

  return (
    <div style={{
      position: 'absolute',
      left: 980,
      top: 10,
      width: 280,
      zIndex: 290,
      background: 'rgba(13, 19, 41, 0.92)',
      border: '1px solid rgba(5,150,105,0.35)',
      borderRadius: 8,
      backdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>🛰️ SAR ICEBERG DETECTION</div>

      <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 8 }}>
        Sentinel-1 SAR 이미지에서 빙산을 탐지하는 YOLOv8 모델을 학습합니다.
      </div>

      {sarModelInfo && sarModelInfo.trained_at && (
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 6 }}>
          모델: {sarModelInfo.model || 'YOLOv8n'} | 에폭: {sarModelInfo.epochs || '?'} | {sarModelInfo.trained_at?.substring(0, 10)}
        </div>
      )}
      {sarModelInfo && !sarModelInfo.trained_at && !sarModelInfo.exists && (
        <div style={{ fontSize: 10, color: '#f87171', marginBottom: 6 }}>
          학습된 모델이 없습니다. 학습을 시작하세요.
        </div>
      )}

      <button
        onClick={startSarTraining}
        disabled={sarTraining}
        style={{
          width: '100%',
          padding: '9px 0',
          background: sarTraining
            ? 'rgba(16,185,129,0.15)'
            : 'linear-gradient(135deg,#047857,#059669)',
          border: '1px solid #059669',
          borderRadius: 6,
          color: sarTraining ? '#6b89b0' : '#d1fae5',
          fontSize: 13,
          fontFamily: "'Courier New', monospace",
          fontWeight: 'bold',
          cursor: sarTraining ? 'default' : 'pointer',
          letterSpacing: 0.5,
        }}
      >
        {sarTraining ? 'TRAINING...' : sarModelInfo?.trained_at ? '▶ RE-TRAIN MODEL' : '▶ TRAIN YOLOV8'}
      </button>

      {(sarTraining || sarProgress > 0) && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            background: '#0f172a',
            borderRadius: 4,
            overflow: 'hidden',
            height: 5,
            border: '1px solid #064e3b',
          }}>
            <div style={{
              width: `${sarProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg,#059669,#34d399)',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#6b89b0', marginTop: 3 }}>
            {sarProgress}% — {sarStage}
          </div>
        </div>
      )}
    </div>
  );
}
