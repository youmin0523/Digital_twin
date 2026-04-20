/**
 * VoyageInfoPanel.jsx
 * ===================
 * Voyage Playback 모드 전용 우측 상단 HUD 패널 두 블록:
 *
 *   A. 🧊 항로 상황 (Situation)
 *      - 현재 얼음 두께 / 유효 두께 / RIO / 진행률
 *   B. 🚢 아라온 (Icebreaker Status)
 *      - status / 호위 대상 / 본선까지 거리 / 누적 호위 거리
 *
 * 하단: 쇄빙 저항 · 연비 라인차트 (추정값, 회색 배경 배지)
 *
 * 위성 조감·선미 추적·수동 조종 어느 뷰에서도 렌더됨 — 뷰 독립적 HUD.
 */

import React from 'react';
import {
  sampleShipAt,
  sampleIcebreakersAt,
  ICEBREAKER_META,
} from '../../services/voyageTrace';
import {
  deriveSpeedKn,
  deriveResistanceSeries,
  deriveIceResistanceKN,
  deriveFuelRateKgH,
} from '../../services/derivedMetrics';

const DEG2RAD = Math.PI / 180;

function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

function rioBadge(rio) {
  if (rio === undefined || rio === null) return { color: '#9ca3af', label: '—' };
  if (rio >= 0) return { color: '#4ade80', label: 'PASS' };
  if (rio >= -3) return { color: '#facc15', label: 'CAUTION' };
  if (rio >= -6) return { color: '#fb923c', label: 'RESTRICT' };
  return { color: '#ef4444', label: 'BLOCKED' };
}

const STATUS_LABEL = {
  idle: '대기',
  dispatched: '출동',
  rendezvous: '접근',
  escorting: '호위 중',
  released: '해산',
};
const STATUS_COLOR = {
  idle: '#9ca3af',
  dispatched: '#facc15',
  rendezvous: '#fb923c',
  escorting: '#ef4444',
  released: '#3b82f6',
};

// ── 차트 컴포넌트 (SVG 기반, 라이브러리 의존 없음) ─────────────────────
function MiniLineChart({ data, getY, color, unit, yMax }) {
  if (!data || data.length === 0) return null;
  const W = 260;
  const H = 60;
  const pad = 4;
  const xs = data.map((_, i) => pad + (i / Math.max(1, data.length - 1)) * (W - 2 * pad));
  const max = yMax || Math.max(...data.map(getY), 1);
  const path = data
    .map((d, i) => {
      const y = H - pad - (getY(d) / max) * (H - 2 * pad);
      return `${i === 0 ? 'M' : 'L'}${xs[i].toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = getY(data[data.length - 1]);
  return (
    <div style={{ position: 'relative' }}>
      <svg width={W} height={H} style={{ display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} fill="rgba(15,23,42,0.5)" rx={3} />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
      <span
        style={{
          position: 'absolute',
          top: 2,
          right: 6,
          fontSize: 9,
          color,
          fontFamily: 'monospace',
        }}
      >
        {last.toFixed(1)} {unit}
      </span>
    </div>
  );
}

// hud 문자열 → number 안전 파싱
function parseNum(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return isFinite(s) ? s : null;
  const m = String(s).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

export default function VoyageInfoPanel({
  trace,
  tHours,
  active,
  shipSpecs,
  liveShipState,
  liveHud,
  liveManual, // { manualMode, manualSpeed, manualHeading }
  sampleIceFn,
  araonDisplayPos, // App.jsx 에서 계산된 통합 아라온 위치 (Cesium marker 와 동일)
  onClose,
}) {
  // ── Voyage / Live 통합 snapshot — useMemo 우회, 매 렌더마다 직접 계산 ──
  // 이유: 매 tick 마다 트레이스에서 보간해 읽어야 하고, 계산량이 가벼워
  //       memo 비용(의존성 비교) 보다 직접 호출이 저렴하고 staleness 없음.
  let snapshot = null;
  let voyIbs = [];
  let voySeries = [];

  if (active && trace) {
    const voyShip = sampleShipAt(trace, tHours);
    if (voyShip) {
      const voySpeedKn = deriveSpeedKn(trace, tHours);
      voyIbs = sampleIcebreakersAt(trace, tHours);
      voySeries = deriveResistanceSeries(trace, tHours, 12, shipSpecs || {});
      snapshot = {
        source: 'voyage',
        position: voyShip.position,
        thickness_m: voyShip.thickness_m,
        effective_thickness_m: voyShip.effective_thickness_m,
        sic: null,
        rio: voyShip.rio,
        speedKn: voySpeedKn,
        km_along_route: voyShip.km_along_route,
      };
    }
  }

  if (!snapshot && liveShipState && typeof liveShipState.lat === 'number') {
    const sic = sampleIceFn
      ? sampleIceFn(liveShipState.lon, liveShipState.lat)
      : null;
    const isManualLive = !!liveManual?.manualMode;
    const spd = isManualLive
      ? Math.abs(liveManual?.manualSpeed || 0)
      : (parseNum(liveHud?.speed) || 0);
    snapshot = {
      source: 'live',
      position: { lat: liveShipState.lat, lon: liveShipState.lon },
      thickness_m: null,
      effective_thickness_m: null,
      sic,
      rio: parseNum(liveHud?.rfi),
      speedKn: spd,
      km_along_route: null,
    };
  }

  if (!snapshot) return null;
  const isVoyage = snapshot.source === 'voyage';

  // ── 아라온 ───────────────────────────────────────────────────
  const voyAraon = voyIbs.find((x) => x.id === 'ib-araon');
  const araonMeta = ICEBREAKER_META['ib-araon'] || { name_ko: '아라온' };
  let araon;
  if (isVoyage) {
    araon = voyAraon;
  } else if (araonDisplayPos) {
    // Live 모드: App.jsx 에서 계산된 araonDisplayPos 그대로 사용
    // → Cesium marker 위치와 정확히 일치 (항로-따라 샘플링, 비-북극 항로 숨김 등)
    araon = {
      id: 'ib-araon',
      status: araonDisplayPos.status,
      position: { lat: araonDisplayPos.lat, lon: araonDisplayPos.lon },
      escorting_ship_id:
        araonDisplayPos.status === 'escorting' ? '본선' : null,
    };
  } else {
    // 비-북극 항로: 아라온 표시 안 함
    araon = null;
  }
  const distToShip = araon
    ? haversineKm(
        araon.position.lat, araon.position.lon,
        snapshot.position.lat, snapshot.position.lon,
      )
    : null;
  const escortTarget = araon?.escorting_ship_id;

  // 진행률 — voyage 모드에서만
  const totalKm = isVoyage ? (trace.summary?.total_route_km || 0) : 0;
  const progressPct = isVoyage && totalKm > 0
    ? Math.min(100, Math.max(0, ((snapshot.km_along_route || 0) / totalKm) * 100))
    : null;

  const rio = rioBadge(snapshot.rio);
  const speedKn = snapshot.speedKn;

  // ── 저항/연비 ─────────────────────────────────────────────
  // Voyage: trace.effective_thickness_m 사용
  // Live: 해빙 농도 proxy (0→0.3m, 1→2.3m) — "추정" 라벨 필수
  const liveProxyThickness = snapshot.sic !== null
    ? 0.3 + Math.max(0, Math.min(1, snapshot.sic)) * 2.0
    : 0;
  const resistanceInputH = isVoyage
    ? snapshot.effective_thickness_m
    : liveProxyThickness;
  const currentR = deriveIceResistanceKN({
    effectiveThicknessM: resistanceInputH,
    speedKn,
    beamM: shipSpecs?.beam_m || 28,
  });
  const currentFuel = deriveFuelRateKgH({ resistanceKN: currentR, speedKn });

  const series = isVoyage ? voySeries : [];

  return (
    <div
      style={{
        position: 'absolute',
        top: 70,
        right: 10,
        zIndex: 170,
        width: 300,
        color: '#e2e8f0',
        fontFamily: 'monospace',
        fontSize: 11,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* ── A. 항로 상황 ────────────────────────────────── */}
      <section
        style={{
          background: 'rgba(5,10,20,0.82)',
          border: '1px solid rgba(34,211,238,0.35)',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
            borderBottom: '1px solid rgba(34,211,238,0.25)',
            paddingBottom: 4,
          }}
        >
          <span style={{ color: '#22d3ee', fontWeight: 700, letterSpacing: 1 }}>
            🧊 항로 상황
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 9, color: '#64748b' }}>
              {isVoyage ? `t=${tHours.toFixed(1)}h` : '실시간'}
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="패널 닫기"
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(148,163,184,0.4)',
                  borderRadius: 3,
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: 10,
                  fontWeight: 700,
                  width: 18,
                  height: 18,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </span>
        </header>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 3, columnGap: 8 }}>
          {isVoyage ? (
            <>
              <div style={{ color: '#94a3b8' }}>얼음 두께</div>
              <div style={{ textAlign: 'right' }}>
                {(snapshot.thickness_m || 0).toFixed(2)} m
              </div>
              <div style={{ color: '#94a3b8' }}>유효 두께</div>
              <div style={{ textAlign: 'right' }}>
                {(snapshot.effective_thickness_m || 0).toFixed(2)} m
              </div>
            </>
          ) : (
            <>
              <div style={{ color: '#94a3b8' }}>해빙 농도</div>
              <div style={{ textAlign: 'right' }}>
                {snapshot.sic !== null
                  ? `${(snapshot.sic * 100).toFixed(0)}%`
                  : '—'}
              </div>
              <div style={{ color: '#94a3b8' }}>추정 두께</div>
              <div style={{ textAlign: 'right', color: '#64748b' }}>
                ≈ {liveProxyThickness.toFixed(2)} m
              </div>
            </>
          )}
          <div style={{ color: '#94a3b8' }}>속도</div>
          <div style={{ textAlign: 'right' }}>{speedKn.toFixed(1)} kn</div>
          <div style={{ color: '#94a3b8' }}>RIO</div>
          <div style={{ textAlign: 'right' }}>
            {snapshot.rio !== null && snapshot.rio !== undefined ? (
              <>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 3,
                    background: rio.color,
                    color: '#0a0f1c',
                    fontWeight: 700,
                    fontSize: 9,
                    marginRight: 4,
                  }}
                >
                  {rio.label}
                </span>
                {snapshot.rio.toFixed(1)}
              </>
            ) : (
              <span style={{ color: '#64748b' }}>—</span>
            )}
          </div>
          <div style={{ color: '#94a3b8' }}>위치</div>
          <div style={{ textAlign: 'right', fontSize: 10 }}>
            {snapshot.position.lat.toFixed(2)}°, {snapshot.position.lon.toFixed(2)}°
          </div>
          {progressPct !== null && (
            <>
              <div style={{ color: '#94a3b8' }}>진행률</div>
              <div style={{ textAlign: 'right' }}>
                {progressPct.toFixed(1)}% · {(snapshot.km_along_route || 0).toFixed(0)} km
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── B. 아라온 ───────────────────────────────────── */}
      <section
        style={{
          background: 'rgba(5,10,20,0.82)',
          border: '1px solid rgba(250,204,21,0.35)',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
            borderBottom: '1px solid rgba(250,204,21,0.25)',
            paddingBottom: 4,
          }}
        >
          <span style={{ color: '#facc15', fontWeight: 700, letterSpacing: 1 }}>
            🚢 {araonMeta.name_ko}
          </span>
          {araon && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 3,
                background: STATUS_COLOR[araon.status] || '#9ca3af',
                color: '#0a0f1c',
                fontWeight: 700,
                fontSize: 9,
              }}
            >
              {STATUS_LABEL[araon.status] || araon.status}
            </span>
          )}
        </header>
        {araon ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 3, columnGap: 8 }}>
            <div style={{ color: '#94a3b8' }}>호위 대상</div>
            <div style={{ textAlign: 'right' }}>
              {escortTarget ? escortTarget : '—'}
            </div>
            <div style={{ color: '#94a3b8' }}>본선까지</div>
            <div style={{ textAlign: 'right' }}>
              {distToShip !== null ? `${distToShip.toFixed(0)} km` : '—'}
            </div>
            <div style={{ color: '#94a3b8' }}>누적 호위</div>
            <div style={{ textAlign: 'right' }}>
              {isVoyage
                ? `${(trace.summary?.total_escort_distance_km || 0).toFixed(0)} km`
                : '—'}
            </div>
            <div style={{ color: '#94a3b8' }}>출동 횟수</div>
            <div style={{ textAlign: 'right' }}>
              {isVoyage ? (trace.summary?.icebreaker_calls ?? '—') : '—'}
            </div>
            {!isVoyage && (
              <>
                <div style={{ color: '#94a3b8' }}>상태</div>
                <div
                  style={{
                    textAlign: 'right',
                    fontSize: 10,
                    color: araon.status === 'escorting' ? '#ef4444' : '#64748b',
                  }}
                >
                  {araon.status === 'escorting' ? '본선 호위 중' : 'Wrangel 정박'}
                </div>
              </>
            )}
          </div>
        ) : (
          <div style={{ color: '#64748b' }}>데이터 없음</div>
        )}
      </section>

      {/* ── C. 쇄빙 저항 / 연비 라인차트 ────────────────── */}
      <section
        style={{
          background: 'rgba(5,10,20,0.82)',
          border: '1px solid rgba(148,163,184,0.25)',
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          <span style={{ color: '#cbd5e1', fontWeight: 700, letterSpacing: 1 }}>
            ⚙ 성능 (추정)
          </span>
          <span
            style={{
              fontSize: 8,
              color: '#64748b',
              border: '1px solid #475569',
              padding: '1px 4px',
              borderRadius: 2,
            }}
          >
            {isVoyage ? 'Lindqvist 기반' : '실시간 스냅샷'}
          </span>
        </header>
        <div style={{ marginBottom: 4, color: '#94a3b8', fontSize: 9 }}>
          쇄빙 저항 (kN) · 현재 {currentR.toFixed(0)}
        </div>
        {isVoyage ? (
          <MiniLineChart
            data={series}
            getY={(d) => d.resistanceKN}
            color="#fb923c"
            unit="kN"
          />
        ) : (
          <div
            style={{
              height: 60,
              background: 'rgba(15,23,42,0.5)',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fb923c',
              fontSize: 18,
              fontFamily: 'monospace',
            }}
          >
            {currentR.toFixed(0)} <span style={{ fontSize: 10, marginLeft: 4 }}>kN</span>
          </div>
        )}
        <div style={{ marginTop: 6, marginBottom: 4, color: '#94a3b8', fontSize: 9 }}>
          연료 소모율 (kg/h) · 현재 {currentFuel.toFixed(0)}
        </div>
        {isVoyage ? (
          <MiniLineChart
            data={series}
            getY={(d) => d.fuelKgH}
            color="#38bdf8"
            unit="kg/h"
          />
        ) : (
          <div
            style={{
              height: 60,
              background: 'rgba(15,23,42,0.5)',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              fontSize: 18,
              fontFamily: 'monospace',
            }}
          >
            {currentFuel.toFixed(0)} <span style={{ fontSize: 10, marginLeft: 4 }}>kg/h</span>
          </div>
        )}
      </section>
    </div>
  );
}
