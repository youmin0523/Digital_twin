/**
 * voyageTrace.js
 * ==============
 * 백엔드 simulate_voyage JSON(backend/data/simulations/*.json)을 로드·파싱해
 * 임의 시각 t(hours) 에 대한 선형 보간을 제공.
 *
 * 트레이스 포맷:
 *   {
 *     metadata: { route, ship, month, dt_hours, total_ticks, duration_hours },
 *     ticks: [{ t, ship:{position,rio,thickness_m,effective_thickness_m},
 *               icebreakers:[{id,position,status,escorting_ship_id}], events:[] }],
 *     summary: { icebreaker_calls, intercept_failed, total_escort_distance_km,
 *                max_rio_violation, completed, total_route_km }
 *   }
 */

export async function loadTrace(iceClass) {
  const cls = iceClass.toLowerCase();
  const url = `/simulations/nsr_month03_${cls}.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[VoyageTrace] fetch failed: ${url} (${res.status})`);
  }
  const trace = await res.json();
  const totalEvents = trace.ticks.reduce(
    (acc, tk) => acc + (tk.events ? tk.events.length : 0),
    0,
  );
  // eslint-disable-next-line no-console
  console.log(
    `[VoyageTrace] loaded ${url.split('/').pop()}: ${trace.ticks.length} ticks, ${totalEvents} events`,
  );
  return trace;
}

/**
 * 본선/쇄빙선 position 을 이진탐색 + 선형 보간으로 산출.
 * ticks 는 t 오름차순이라 가정 (백엔드 보장).
 */
export function interpolateAt(trace, tHours) {
  const ticks = trace.ticks;
  if (!ticks || ticks.length === 0) return null;
  const first = ticks[0];
  const last = ticks[ticks.length - 1];
  if (tHours <= first.t) return { a: first, b: first, frac: 0 };
  if (tHours >= last.t) return { a: last, b: last, frac: 0 };

  // 이진 탐색
  let lo = 0;
  let hi = ticks.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (ticks[mid].t <= tHours) lo = mid;
    else hi = mid;
  }
  const a = ticks[lo];
  const b = ticks[hi];
  const span = b.t - a.t;
  const frac = span > 0 ? (tHours - a.t) / span : 0;
  return { a, b, frac };
}

function lerp(a, b, f) {
  return a + (b - a) * f;
}

export function lerpPosition(pa, pb, f) {
  // 좌표 간격이 작은 경우(1h 스텝) 선형 lat/lon 근사로 충분.
  return {
    lat: lerp(pa.lat, pb.lat, f),
    lon: lerp(pa.lon, pb.lon, f),
  };
}

/**
 * 현재 시각의 본선 상태 보간.
 */
export function sampleShipAt(trace, tHours) {
  const win = interpolateAt(trace, tHours);
  if (!win) return null;
  const { a, b, frac } = win;
  return {
    position: lerpPosition(a.ship.position, b.ship.position, frac),
    rio: lerp(a.ship.rio, b.ship.rio, frac),
    thickness_m: lerp(a.ship.thickness_m, b.ship.thickness_m, frac),
    effective_thickness_m: lerp(
      a.ship.effective_thickness_m,
      b.ship.effective_thickness_m,
      frac,
    ),
    km_along_route: lerp(
      a.ship.km_along_route || 0,
      b.ship.km_along_route || 0,
      frac,
    ),
  };
}

/**
 * 현재 시각의 쇄빙선 5척 상태 보간.
 * status 는 보간하지 않고 a tick 의 값 사용 (이산 상태).
 */
export function sampleIcebreakersAt(trace, tHours) {
  const win = interpolateAt(trace, tHours);
  if (!win) return [];
  const { a, b, frac } = win;
  const out = [];
  for (let i = 0; i < a.icebreakers.length; i += 1) {
    const ia = a.icebreakers[i];
    const ib = b.icebreakers[i];
    out.push({
      id: ia.id,
      status: ia.status,
      escorting_ship_id: ia.escorting_ship_id,
      position: lerpPosition(ia.position, ib.position, frac),
    });
  }
  return out;
}

/**
 * [prevT, currT] 구간에 발생한 이벤트 목록 반환.
 * tick 경계의 이벤트는 tick.t 시점에 한 번 dispatch.
 */
export function eventsBetween(trace, prevT, currT) {
  if (currT <= prevT) return [];
  const out = [];
  for (const tk of trace.ticks) {
    if (tk.t > prevT && tk.t <= currT) {
      for (const ev of tk.events || []) {
        out.push({ ...ev, t: tk.t });
      }
    }
  }
  return out;
}

/**
 * 쇄빙선 id → name_ko 매핑.
 * 한국 유일의 쇄빙선 '아라온(Araon)' 1척만 운용.
 * 백엔드 INITIAL_ICEBREAKERS 와 동기화 유지 필수.
 */
export const ICEBREAKER_META = {
  'ib-araon': { name_ko: '아라온', home_port: 'Wrangel Is. (사전배치)' },
};
