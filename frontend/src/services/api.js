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
  const res = await fetch(`${API_BASE}/ice-concentration?month=${encodeURIComponent(month)}`);
  if (!res.ok) throw new Error(`fetchIceConcentration failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch sea-ice thickness grid data for a given month.
 * @param {string} month - Month identifier or 'latest'
 * @returns {Promise<Object>} Ice thickness data
 */
export async function fetchIceThickness(month = 'latest') {
  const res = await fetch(`${API_BASE}/ice-thickness?month=${encodeURIComponent(month)}`);
  if (!res.ok) throw new Error(`fetchIceThickness failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Fetch current iceberg positions.
 * @returns {Promise<Object>} Iceberg data
 */
export async function fetchIcebergs() {
  const res = await fetch(`${API_BASE}/icebergs`);
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
  const res = await fetch(`${API_BASE}/evaluate-route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ route, vessel, month }),
  });
  if (!res.ok) throw new Error(`evaluateRoute failed: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * Trigger the data-ingestion pipeline on the backend.
 * @param {string} task - Pipeline task name ('all', 'ice', 'icebergs', etc.)
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
