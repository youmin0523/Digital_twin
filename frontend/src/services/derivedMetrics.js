/**
 * derivedMetrics.js
 * =================
 * Voyage trace + 파 데이터에서 직접 계측되지 않은 지표를 물리 기반 근사로 유도.
 *
 * ⚠️ 모든 반환값은 "추정(estimated)"이다. 실측 센서 데이터가 백엔드에 들어오면
 *    이 모듈을 우회하거나 교체할 것. UI 표시 시에는 "추정" 배지 필수.
 *
 * 제공 함수:
 *   deriveSpeedKn(trace, tHours)           — 위치 diff → 대지속도 (knots)
 *   deriveMotion(params)                   — pitch/roll/heave RMS 추정
 *   deriveIceResistanceKN(params)          — Lindqvist 기반 쇄빙 저항
 *   deriveFuelRateKgH(params)              — 저항·속도 기반 연료 소모율
 *   deriveForwardPreview(trace, tHours, n) — 전방 N개 tick 의 두께/RIO 시퀀스
 *
 * 참고:
 *   Lindqvist (1989) — Ice resistance of ships in level ice.
 *   파향이 없을 때는 roll/pitch 분리가 불가능하므로 scalar magnitude만 반환한다.
 */

import { sampleShipAt, interpolateAt } from './voyageTrace';

const KTS_PER_MS = 1.94384;
const DEG2RAD = Math.PI / 180;
const EARTH_R_KM = 6371.0;

// ── 지리 거리 ────────────────────────────────────────────────────────────
function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(a));
}

/**
 * 현재 시각 기준 대지속도 (knots) 유도.
 * trace tick 간 위치 차이 / 시간 차이.
 */
export function deriveSpeedKn(trace, tHours) {
  const ticks = trace?.ticks;
  if (!ticks || ticks.length < 2) return 0;
  const win = interpolateAt(trace, tHours);
  if (!win) return 0;
  const { a, b } = win;
  if (a === b) return 0;
  const dKm = haversineKm(
    a.ship.position.lat, a.ship.position.lon,
    b.ship.position.lat, b.ship.position.lon,
  );
  const dtH = b.t - a.t;
  if (dtH <= 0) return 0;
  const kmh = dKm / dtH;
  return (kmh / 3.6) * KTS_PER_MS; // km/h → m/s → knots
}

/**
 * 현재 선박 heading (deg, 0=북, 시계방향).
 * tick 간 위치 변화에서 유도. 이동량이 너무 작으면 null.
 */
export function deriveHeadingDeg(trace, tHours) {
  const win = interpolateAt(trace, tHours);
  if (!win) return null;
  const { a, b } = win;
  if (a === b) return null;
  const dLat = b.ship.position.lat - a.ship.position.lat;
  const dLon = (b.ship.position.lon - a.ship.position.lon) *
    Math.cos(((a.ship.position.lat + b.ship.position.lat) / 2) * DEG2RAD);
  if (Math.abs(dLat) < 1e-6 && Math.abs(dLon) < 1e-6) return null;
  const brgRad = Math.atan2(dLon, dLat); // 북=0
  return ((brgRad * 180) / Math.PI + 360) % 360;
}

/**
 * 선박 거동 scalar magnitude 추정.
 *
 * 입력:
 *   waveHeightM   — 유의파고 (m), nullable
 *   waveDirDeg    — 파향 (meteorological, 파가 오는 방향), nullable
 *   wavePeriodS   — 파주기 (s), nullable
 *   headingDeg    — 선박 침로 (deg)
 *   speedKn       — 선박 속도 (knots)
 *   thicknessM    — 현재 얼음 두께 (m)
 *
 * 반환:
 *   { rollRad, pitchRad, heaveM, magnitude, source }
 *   파향 있을 때: roll/pitch 축 분리
 *   파향 없을 때: magnitude 만 신뢰, roll/pitch 는 마그니튜드에서 임의 할당
 */
export function deriveMotion({
  waveHeightM,
  waveDirDeg,
  wavePeriodS,
  headingDeg,
  speedKn,
  thicknessM,
}) {
  const Hs = Math.max(0, waveHeightM || 0);
  const T = Math.max(1, wavePeriodS || 6); // 기본 주기 6s
  const kn = Math.max(0, speedKn || 0);
  const ice = Math.max(0, thicknessM || 0);

  // 공진 계수: 선박 고유 주기 ~8s 가정, 가까울수록 증폭
  const resonance = 1 / (1 + Math.abs(T - 8) * 0.25);

  // 얼음 충격 성분: 두께·속도 결합 → pitch 성분으로 돌출
  const iceImpact = Math.min(0.8, ice * 0.6 * Math.min(1, kn / 10));

  let rollRad = 0;
  let pitchRad = 0;
  let source = 'wave+ice';

  if (
    waveDirDeg !== null && waveDirDeg !== undefined &&
    headingDeg !== null && headingDeg !== undefined
  ) {
    // 상대각 — 파가 오는 방향 대비 뱃머리
    const rel = ((waveDirDeg - headingDeg + 540) % 360) - 180; // -180..180
    const relRad = rel * DEG2RAD;
    // 횡파(beam)에서 roll 최대, 종파(head)에서 pitch 최대
    const rollCoef = Math.abs(Math.sin(relRad));
    const pitchCoef = Math.abs(Math.cos(relRad));
    rollRad = Hs * 0.04 * rollCoef * resonance;
    pitchRad = Hs * 0.03 * pitchCoef * resonance + iceImpact * 0.5;
    source = 'wave(directed)+ice';
  } else {
    // 파향 없음 — 스칼라로만. 절반씩 나눠서 임의 축 할당.
    const mag = Hs * 0.035 * resonance;
    rollRad = mag * 0.7;
    pitchRad = mag * 0.5 + iceImpact * 0.5;
    source = 'wave(scalar)+ice';
  }

  const heaveM = Hs * 0.5 * resonance;
  const magnitude = Math.sqrt(rollRad * rollRad + pitchRad * pitchRad);

  return { rollRad, pitchRad, heaveM, magnitude, source };
}

/**
 * 쇄빙 저항 (kN) — Lindqvist 간이식.
 *
 * R = C_f · B · h^1.5 · (1 + k·v)
 *   B: 선폭 (m)
 *   h: 유효 얼음 두께 (m)
 *   v: 속도 (m/s)
 *
 * 상수는 선급/선형에 맞춰 튜닝 필요. 절대값보다 "상대 추이" 신뢰.
 */
export function deriveIceResistanceKN({
  effectiveThicknessM,
  speedKn,
  beamM = 28,
  cf = 180,
  kv = 0.15,
}) {
  const h = Math.max(0, effectiveThicknessM || 0);
  if (h <= 0) return 0;
  const v = Math.max(0, (speedKn || 0) / KTS_PER_MS);
  const R = cf * beamM * Math.pow(h, 1.5) * (1 + kv * v);
  return R / 1000; // N → kN
}

/**
 * 연료 소모율 (kg/h) — 저항·속도 기반.
 *
 * 간이식:
 *   P_required_kW ≈ R_kN · v_ms / η_prop
 *   fuel_kg_h     ≈ P_required_kW · SFOC_g_kWh / 1000
 *
 * SFOC (Specific Fuel Oil Consumption) 기본 185 g/kWh,
 * 프로펠러 효율 0.7 가정.
 */
export function deriveFuelRateKgH({
  resistanceKN,
  speedKn,
  propEff = 0.7,
  sfocGPerKWh = 185,
  baseLoadKw = 1500, // 호텔/보조 부하 상수
}) {
  const v = Math.max(0, (speedKn || 0) / KTS_PER_MS);
  const P = (resistanceKN || 0) * v / Math.max(0.1, propEff); // kW
  const totalKw = P + baseLoadKw;
  return (totalKw * sfocGPerKWh) / 1000; // g/h → kg/h
}

/**
 * 전방 프리뷰 — 현재 tick 이후 N 개 tick 의 얼음·RIO 시퀀스.
 *
 * 반환: [{ t, kmAhead, thickness_m, effective_thickness_m, rio, position }]
 * kmAhead 는 현재 위치 기준 누적 거리.
 */
export function deriveForwardPreview(trace, tHours, nTicks = 20) {
  const ticks = trace?.ticks;
  if (!ticks || ticks.length === 0) return [];
  const cur = sampleShipAt(trace, tHours);
  if (!cur) return [];

  // 현재 tick 이후 인덱스 탐색
  let start = 0;
  while (start < ticks.length && ticks[start].t <= tHours) start += 1;

  const out = [];
  let accKm = 0;
  let prevLat = cur.position.lat;
  let prevLon = cur.position.lon;

  for (let i = start; i < ticks.length && out.length < nTicks; i += 1) {
    const tk = ticks[i];
    const pos = tk.ship.position;
    accKm += haversineKm(prevLat, prevLon, pos.lat, pos.lon);
    out.push({
      t: tk.t,
      kmAhead: accKm,
      thickness_m: tk.ship.thickness_m,
      effective_thickness_m: tk.ship.effective_thickness_m,
      rio: tk.ship.rio,
      position: pos,
    });
    prevLat = pos.lat;
    prevLon = pos.lon;
  }
  return out;
}

/**
 * 전방 프리뷰에서 통과 가능성 배지 유도.
 * RIO·두께 복합 판단.
 */
export function derivePassBadge(preview) {
  if (!preview || preview.length === 0) {
    return { level: 'unknown', label: 'NO DATA', color: '#9ca3af' };
  }
  const maxH = Math.max(...preview.map((p) => p.effective_thickness_m || 0));
  const minRio = Math.min(...preview.map((p) => (p.rio !== undefined ? p.rio : 0)));

  if (minRio < -6 || maxH > 1.8) {
    return { level: 'blocked', label: 'BLOCKED', color: '#ef4444' };
  }
  if (minRio < -3 || maxH > 1.2) {
    return { level: 'marginal', label: 'MARGINAL', color: '#facc15' };
  }
  return { level: 'pass', label: 'PASS', color: '#4ade80' };
}

/**
 * weather_latest.json 구조에서 (lat, lon) 최근접 waypoint 의 파 데이터 조회.
 *
 * weatherData 형식:
 *   { routes: { NSR: { waypoints: [{lat, lon, wave_height_m, wave_direction_deg, wave_period_s}, ...] }, ... } }
 *
 * 반환: { height, direction, period, distKm } | null
 */
export function nearestWaveAt(weatherData, lat, lon, maxDistKm = 1500) {
  if (!weatherData || !weatherData.routes) return null;
  let best = null;
  let bestD = Infinity;
  for (const routeKey of Object.keys(weatherData.routes)) {
    const route = weatherData.routes[routeKey];
    const wps = route?.waypoints;
    if (!wps) continue;
    for (const wp of wps) {
      if (typeof wp.lat !== 'number' || typeof wp.lon !== 'number') continue;
      if (wp.wave_height_m === null || wp.wave_height_m === undefined) continue;
      const d = haversineKm(lat, lon, wp.lat, wp.lon);
      if (d < bestD) {
        bestD = d;
        best = wp;
      }
    }
  }
  if (!best || bestD > maxDistKm) return null;
  return {
    height: best.wave_height_m,
    direction: best.wave_direction_deg ?? null, // 없으면 스칼라 모드
    period: best.wave_period_s ?? null,
    distKm: bestD,
  };
}

/**
 * 쇄빙 저항 / 연비 시계열 — 과거 N 시간 이력.
 * VoyageInfoPanel 의 라인차트 소스.
 */
export function deriveResistanceSeries(trace, currentTHours, windowH = 12, specs = {}) {
  const ticks = trace?.ticks;
  if (!ticks || ticks.length === 0) return [];
  const beamM = specs.beam_m || 28;
  const out = [];
  const tMin = Math.max(0, currentTHours - windowH);

  for (let i = 0; i < ticks.length; i += 1) {
    const tk = ticks[i];
    if (tk.t < tMin || tk.t > currentTHours) continue;
    // 속도 — 인접 tick 간 거리
    let speedKn = 0;
    const prev = ticks[Math.max(0, i - 1)];
    if (prev !== tk) {
      const dKm = haversineKm(
        prev.ship.position.lat, prev.ship.position.lon,
        tk.ship.position.lat, tk.ship.position.lon,
      );
      const dtH = Math.max(1e-6, tk.t - prev.t);
      speedKn = (dKm / dtH / 3.6) * KTS_PER_MS;
    }
    const R = deriveIceResistanceKN({
      effectiveThicknessM: tk.ship.effective_thickness_m,
      speedKn,
      beamM,
    });
    const fuel = deriveFuelRateKgH({ resistanceKN: R, speedKn });
    out.push({
      t: tk.t,
      resistanceKN: R,
      fuelKgH: fuel,
      speedKn,
      thicknessM: tk.ship.effective_thickness_m,
      rio: tk.ship.rio,
    });
  }
  return out;
}
