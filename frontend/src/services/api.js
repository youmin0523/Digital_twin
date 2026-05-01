// ═══════════════════════════════════════════════════════════════
// API Service — calls the Node.js backend
// ═══════════════════════════════════════════════════════════════

const API_BASE = '/api';

/**
 * Fetch sea-ice concentration grid data for a given month.
 * @param {string} month - Month identifier or 'latest'
 * @returns {Promise<Object>} Ice concentration data
 */
export async function fetchIceConcentration(month = 'latest') {
  const res = await fetch(`${API_BASE}/ice/concentration?month=${encodeURIComponent(month)}`);
  if (!res.ok) throw new Error(`fetchIceConcentration failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch sea-ice thickness grid data for a given month.
 * @param {string} month - Month identifier or 'latest'
 * @returns {Promise<Object>} Ice thickness data
 */
export async function fetchIceThickness(month = 'latest') {
  const res = await fetch(`${API_BASE}/ice/thickness?month=${encodeURIComponent(month)}`);
  if (!res.ok) throw new Error(`fetchIceThickness failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch current iceberg positions.
 * @returns {Promise<Object>} Iceberg data
 */
export async function fetchIcebergs() {
  const res = await fetch(`${API_BASE}/icebergs/latest`);
  if (!res.ok) throw new Error(`fetchIcebergs failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Submit a route + vessel configuration for server-side POLARIS evaluation.
 * @param {Object} route  - Route waypoints or route key
 * @param {Object} vessel - Vessel parameters (iceClass, draft, beam, etc.)
 * @param {string} month  - Month for ice conditions
 * @returns {Promise<Object>} Evaluation result { status, reason, rioScore }
 */
export async function evaluateRoute(route, vessel, month) {
  const res = await fetch(`${API_BASE}/route/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, vessel, month }),
  });
  if (!res.ok) throw new Error(`evaluateRoute failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch real-time NSR weather data (파고·기온·가시거리).
 * Populated by weather_fetcher.py via Open-Meteo API.
 * @returns {Promise<Object>} Weather data { fetched_at, waypoints, route_summary }
 */
export async function fetchWeather() {
  const res = await fetch(`${API_BASE}/weather/latest`);
  if (!res.ok) throw new Error(`fetchWeather failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Trigger the data-ingestion pipeline on the backend.
 * @param {string} task - Pipeline task name ('all', 'ice', 'icebergs', 'weather', etc.)
 * @returns {Promise<Object>} Pipeline status response
 */
export async function triggerPipeline(task = 'all') {
  const res = await fetch(`${API_BASE}/pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!res.ok) throw new Error(`triggerPipeline failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * ML 연료 예측 서비스 헬스 체크.
 * @returns {Promise<Object>} { status, model_loaded, metrics }
 */
export async function fetchFuelHealth() {
  const res = await fetch(`${API_BASE}/fuel/health`);
  if (!res.ok) throw new Error(`fetchFuelHealth failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * 북극항로 vs 수에즈 운하 경제성 비교 (ML 연료 예측 기반).
 * @param {Object} params - 비교 요청 파라미터
 * @param {number} params.displacement - 배수량 (tons)
 * @param {number} params.draft - 흘수 (m)
 * @param {number} params.engine_power - 엔진 출력 (kW)
 * @param {number} params.ice_class_code - 내빙등급 코드 (0, 2, 4)
 * @param {number} params.nsr_ice_thickness - NSR 평균 빙하 두께 (m)
 * @param {number} params.nsr_ice_concentration - NSR 평균 빙하 농도 (0~1)
 * @param {number} params.nsr_distance_nm - NSR 총 거리 (nm)
 * @param {number} params.suez_distance_nm - 수에즈 총 거리 (nm)
 * @param {string} params.vessel_type - 선종 (container, lng, icebreaker)
 * @param {number} params.speed_knots - 운항 속도 (knots)
 * @returns {Promise<Object>} 비교 결과 { nsr, suez, comparison }
 */
export async function compareFuelCost(params) {
  const res = await fetch(`${API_BASE}/fuel/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`compareFuelCost failed: ${res.status} ${res.statusText}`);
  return res.json();
}

