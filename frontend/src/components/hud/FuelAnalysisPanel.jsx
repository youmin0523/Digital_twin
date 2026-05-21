import React, { useState, useCallback } from 'react';

const ROUTES = ['NSR', 'NWP', 'TSR'];
const VESSEL_TYPES = [
  { key: 'icebreaker', label: '쇄빙선 (PC2)', iceCode: 2, disp: 20000, draft: 8.5, power: 32000 },
  { key: 'lng',        label: 'LNG 운반선 (PC4)', iceCode: 4, disp: 95000, draft: 12.0, power: 37000 },
  { key: 'container',  label: '컨테이너선 (NONE)', iceCode: 0, disp: 55000, draft: 14.2, power: 28000 },
];

const ROUTE_DISTANCE = { NSR: 7200, NWP: 8100, TSR: 6600 };

function analysisStage(pct) {
  if (pct < 15)  return 'LOADING MODEL...';
  if (pct < 40)  return 'NSR FUEL PREDICTION...';
  if (pct < 60)  return 'SUEZ FUEL PREDICTION...';
  if (pct < 80)  return 'COST CALCULATION...';
  if (pct < 100) return 'COMPARISON ANALYSIS...';
  return 'COMPLETE';
}

export default function FuelAnalysisPanel({ open, onToggle, currentRoute, shipSpecs }) {
  if (!open) return null;

  // 선종
  const [vesselIdx, setVesselIdx] = useState(() => {
    const idx = VESSEL_TYPES.findIndex((v) => v.key === shipSpecs?.type);
    return idx >= 0 ? idx : 2;
  });
  const vessel = VESSEL_TYPES[vesselIdx];

  // 파라미터
  const [route, setRoute] = useState(currentRoute || 'NSR');
  const [displacement, setDisplacement] = useState(vessel.disp);
  const [draft, setDraft] = useState(vessel.draft);
  const [enginePower, setEnginePower] = useState(vessel.power);
  const [speed, setSpeed] = useState(14.0);
  const [iceThickness, setIceThickness] = useState(1.0);
  const [iceConcentration, setIceConcentration] = useState(0.3);

  // 분석 상태
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  // 선종 변경 시 제원 자동 반영
  const handleVesselChange = (idx) => {
    setVesselIdx(idx);
    const v = VESSEL_TYPES[idx];
    setDisplacement(v.disp);
    setDraft(v.draft);
    setEnginePower(v.power);
  };

  // 분석 실행
  const startAnalysis = useCallback(async () => {
    setRunning(true);
    setProgress(0);
    setStage('STARTING...');
    setResult(null);
    setError('');

    // 시뮬레이션 프로그레스 (UX)
    let pct = 0;
    const ticker = setInterval(() => {
      pct = Math.min(pct + 8, 90);
      setProgress(pct);
      setStage(analysisStage(pct));
    }, 200);

    try {
      const res = await fetch('/api/fuel/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displacement,
          draft,
          engine_power: enginePower,
          ice_class_code: vessel.iceCode,
          nsr_ice_thickness: iceThickness,
          nsr_ice_concentration: iceConcentration,
          nsr_distance_nm: ROUTE_DISTANCE[route] || 7200,
          suez_distance_nm: 12400,
          vessel_type: vessel.key,
          speed_knots: speed,
        }),
      });
      const data = await res.json();
      clearInterval(ticker);

      if (data.error) {
        setError(data.error);
        setProgress(0);
        setStage('FAILED');
      } else {
        setResult(data);
        setProgress(100);
        setStage('COMPLETE');
      }
    } catch (err) {
      clearInterval(ticker);
      setError('ML 서버 연결 실패 — 서버가 실행 중인지 확인하세요.');
      setStage('CONNECTION ERROR');
    }
    setRunning(false);
  }, [displacement, draft, enginePower, vessel, route, speed, iceThickness, iceConcentration]);

  const cmp = result?.comparison;

  return (
    <>
      {/* 딤 배경 */}
      <div
        onClick={onToggle}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.45)',
          zIndex: 499,
          backdropFilter: 'blur(2px)',
        }}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 380,
        maxHeight: '85vh',
        overflowY: 'auto',
        zIndex: 500,
        background: 'rgba(10, 15, 35, 0.97)',
        border: '1px solid #92400e',
        borderRadius: 10,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        padding: '12px 16px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 'bold', color: '#fbbf24', letterSpacing: 1 }}>
            ML FUEL COST ANALYSIS
          </div>
          <span
            onClick={onToggle}
            style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 16, lineHeight: 1 }}
          >
            ×
          </span>
        </div>
        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 10 }}>
          XGBoost 회귀 모델 기반 · 빙하 저항 연료 소모량 예측 · 북극항로 vs 수에즈 경제성 비교
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
                  flex: 1, padding: '4px 0',
                  background: route === r ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${route === r ? '#f59e0b' : '#1e3a8a'}`,
                  borderRadius: 4,
                  color: route === r ? '#fbbf24' : '#6b89b0',
                  fontSize: 11, cursor: 'pointer',
                }}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {/* Vessel type */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>VESSEL TYPE</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {VESSEL_TYPES.map((v, i) => (
              <button
                key={v.key}
                onClick={() => handleVesselChange(i)}
                style={{
                  flex: 1, padding: '4px 2px',
                  background: vesselIdx === i ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${vesselIdx === i ? '#f59e0b' : '#1e3a8a'}`,
                  borderRadius: 4,
                  color: vesselIdx === i ? '#fbbf24' : '#6b89b0',
                  fontSize: 9, cursor: 'pointer', lineHeight: 1.3,
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Ship specs */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
          marginBottom: 8,
        }}>
          {[
            { label: '배수량 (t)', value: displacement, set: setDisplacement, step: 1000 },
            { label: '흘수 (m)', value: draft, set: setDraft, step: 0.5 },
            { label: '엔진 (kW)', value: enginePower, set: setEnginePower, step: 1000 },
          ].map(({ label, value, set, step }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: '#6b89b0', marginBottom: 2 }}>{label}</div>
              <input
                type="number" value={value} step={step}
                onChange={(e) => set(parseFloat(e.target.value) || 0)}
                style={{
                  width: '100%', padding: '3px 4px', boxSizing: 'border-box',
                  background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: 4,
                  color: '#93c5fd', fontSize: 11, textAlign: 'center',
                }}
              />
            </div>
          ))}
        </div>

        {/* Ice conditions */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6,
          marginBottom: 8,
        }}>
          <div>
            <div style={{ fontSize: 9, color: '#6b89b0', marginBottom: 2 }}>빙하 두께 (m)</div>
            <input
              type="number" value={iceThickness} step={0.1} min={0} max={3}
              onChange={(e) => setIceThickness(parseFloat(e.target.value) || 0)}
              style={{
                width: '100%', padding: '3px 4px', boxSizing: 'border-box',
                background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: 4,
                color: '#93c5fd', fontSize: 11, textAlign: 'center',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#6b89b0', marginBottom: 2 }}>빙하 농도 (0~1)</div>
            <input
              type="number" value={iceConcentration} step={0.05} min={0} max={1}
              onChange={(e) => setIceConcentration(parseFloat(e.target.value) || 0)}
              style={{
                width: '100%', padding: '3px 4px', boxSizing: 'border-box',
                background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: 4,
                color: '#93c5fd', fontSize: 11, textAlign: 'center',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#6b89b0', marginBottom: 2 }}>운항속도 (kt)</div>
            <input
              type="number" value={speed} step={0.5} min={5} max={25}
              onChange={(e) => setSpeed(parseFloat(e.target.value) || 14)}
              style={{
                width: '100%', padding: '3px 4px', boxSizing: 'border-box',
                background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: 4,
                color: '#93c5fd', fontSize: 11, textAlign: 'center',
              }}
            />
          </div>
        </div>

        {/* Analyze button */}
        <button
          onClick={startAnalysis}
          disabled={running}
          style={{
            width: '100%', padding: '9px 0',
            background: running
              ? 'rgba(245,158,11,0.15)'
              : 'linear-gradient(135deg,#92400e,#b45309)',
            border: '1px solid #d97706',
            borderRadius: 6,
            color: running ? '#6b89b0' : '#fef3c7',
            fontSize: 13,
            fontFamily: "'Courier New', monospace",
            fontWeight: 'bold',
            cursor: running ? 'default' : 'pointer',
            letterSpacing: 0.5,
          }}
        >
          {running ? 'ANALYZING...' : result ? 'RE-ANALYZE' : 'FUEL COST ANALYSIS'}
        </button>

        {/* Progress */}
        {(running || progress > 0) && (
          <div style={{ marginTop: 8 }}>
            <div style={{
              background: '#0f172a', borderRadius: 4, overflow: 'hidden',
              height: 5, border: '1px solid #1e3a8a',
            }}>
              <div style={{
                width: `${progress}%`, height: '100%',
                background: progress >= 100
                  ? 'linear-gradient(90deg,#059669,#34d399)'
                  : 'linear-gradient(90deg,#d97706,#fbbf24)',
                transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 10, color: '#6b89b0', marginTop: 3 }}>
              {progress}% — {stage}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 8, padding: '6px 8px', borderRadius: 4,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#f87171', fontSize: 10,
          }}>
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ marginTop: 10 }}>
            {/* 절감 요약 배지 */}
            <div style={{
              padding: '8px 10px', borderRadius: 6, marginBottom: 10,
              textAlign: 'center', fontWeight: 'bold',
              background: cmp.nsr_is_cheaper
                ? 'rgba(52,211,153,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${cmp.nsr_is_cheaper
                ? 'rgba(52,211,153,0.35)' : 'rgba(239,68,68,0.35)'}`,
              color: cmp.nsr_is_cheaper ? '#34d399' : '#f87171',
            }}>
              <div style={{ fontSize: 14, marginBottom: 2 }}>
                {cmp.nsr_is_cheaper
                  ? `${route} 항로가 $${(Math.abs(cmp.cost_saving_usd) / 1000).toFixed(0)}K 저렴`
                  : `SUEZ 우회가 $${(Math.abs(cmp.cost_saving_usd) / 1000).toFixed(0)}K 저렴`}
              </div>
              <div style={{ fontSize: 10, opacity: 0.8 }}>
                시간 {cmp.time_saving_days > 0 ? '단축' : '증가'}: {Math.abs(cmp.time_saving_days)}일
                {' · '}연료 {cmp.fuel_saving_tons > 0 ? '절감' : '추가'}: {Math.abs(cmp.fuel_saving_tons).toFixed(1)}t
              </div>
            </div>

            {/* 비교 테이블 */}
            <table style={{
              width: '100%', borderCollapse: 'collapse', fontSize: 11,
              color: '#cbd5e1',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e3a8a' }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b89b0', fontSize: 10 }}></th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: '#38bdf8', fontSize: 10 }}>{route}</th>
                  <th style={{ textAlign: 'right', padding: '4px 6px', color: '#fb923c', fontSize: 10 }}>SUEZ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b' }}>항로 거리</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.nsr.distance_nm.toLocaleString()} nm</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.suez.distance_nm.toLocaleString()} nm</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b' }}>운항일수</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.nsr.transit_days}일</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.suez.transit_days}일</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b' }}>유효속력</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.nsr.effective_speed_knots} kt</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{speed} kt</td>
                </tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td style={{ padding: '3px 6px', color: '#64748b' }}>연료 소모</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.nsr.total_fuel_tons.toLocaleString()} t</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>{result.suez.total_fuel_tons.toLocaleString()} t</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b' }}>연료비</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>${(result.nsr.fuel_cost_usd / 1000).toFixed(0)}K</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px' }}>${(result.suez.fuel_cost_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <td colSpan={3} style={{ padding: '4px 6px', color: '#f59e0b', fontSize: 10, fontWeight: 'bold' }}>
                    부대비용 상세
                  </td>
                </tr>
                {result.nsr.escort_cost_usd > 0 && (
                  <tr>
                    <td style={{ padding: '3px 6px', color: '#64748b', fontSize: 10 }}>쇄빙 에스코트</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10 }}>${(result.nsr.escort_cost_usd / 1000).toFixed(0)}K</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#64748b' }}>-</td>
                  </tr>
                )}
                {result.nsr.escort_cost_usd === 0 && (
                  <tr>
                    <td style={{ padding: '3px 6px', color: '#64748b', fontSize: 10 }}>쇄빙 에스코트</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#34d399' }}>면제</td>
                    <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#64748b' }}>-</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b', fontSize: 10 }}>보험료</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10 }}>${(result.nsr.insurance_cost_usd / 1000).toFixed(0)}K</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#64748b' }}>-</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b', fontSize: 10 }}>운하 통행료</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#64748b' }}>-</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10 }}>${(result.suez.toll_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr>
                  <td style={{ padding: '3px 6px', color: '#64748b', fontSize: 10 }}>보안비</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, color: '#64748b' }}>-</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10 }}>${(result.suez.security_cost_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <td style={{ padding: '3px 6px', color: '#64748b', fontSize: 10 }}>부대비 소계</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 'bold' }}>${(result.nsr.additional_cost_usd / 1000).toFixed(0)}K</td>
                  <td style={{ textAlign: 'right', padding: '3px 6px', fontSize: 10, fontWeight: 'bold' }}>${(result.suez.additional_cost_usd / 1000).toFixed(0)}K</td>
                </tr>
                <tr style={{ borderTop: '2px solid #1e3a8a' }}>
                  <td style={{ padding: '5px 6px', fontWeight: 'bold', color: '#e2e8f0' }}>총 비용</td>
                  <td style={{
                    textAlign: 'right', padding: '5px 6px', fontWeight: 'bold', fontSize: 13,
                    color: cmp.nsr_is_cheaper ? '#34d399' : '#f87171',
                  }}>
                    ${(result.nsr.total_cost_usd / 1000).toFixed(0)}K
                  </td>
                  <td style={{
                    textAlign: 'right', padding: '5px 6px', fontWeight: 'bold', fontSize: 13,
                    color: !cmp.nsr_is_cheaper ? '#34d399' : '#f87171',
                  }}>
                    ${(result.suez.total_cost_usd / 1000).toFixed(0)}K
                  </td>
                </tr>
              </tbody>
            </table>

            {/* 벙커유 단가 참조 */}
            <div style={{
              marginTop: 8, fontSize: 9, color: '#475569',
              borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 6,
            }}>
              벙커유(VLSFO) 단가: ${result.fuel_price_usd_per_ton}/ton
              {' · '}선종: {vessel.label}
              {' · '}빙하 저항 모델: XGBoost Regression (R² log: 0.989)
            </div>
          </div>
        )}
      </div>
    </>
  );
}
