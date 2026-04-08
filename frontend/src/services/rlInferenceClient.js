/**
 * rlInferenceClient.js
 *
 * RL 모델 추론 클라이언트.
 * 1차: 백엔드 FastAPI 서버 HTTP 호출
 * 2차: TF.js 브라우저 로컬 추론 (폴백)
 */

const RL_API_BASE = '/api/rl';
const INFER_TIMEOUT_MS = 3000;

/**
 * 백엔드 RL 추론 API 호출.
 *
 * @param {Object} shipState - {lon, lat, heading, speed_knots, ice_class, progress, next_waypoint}
 * @param {Array}  icebergs  - [{lat, lon, length_m}, ...]
 * @param {Object} iceData   - {concentration: number}
 * @param {Object} weather   - {visibility_km, wave_height_m}
 * @returns {Promise<Object>} - {action, heading_delta, speed_factor, confidence, projected_path, fallback}
 */
export async function rlInfer(shipState, icebergs, iceData, weather) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INFER_TIMEOUT_MS);

  try {
    const response = await fetch(`${RL_API_BASE}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ship_state: shipState,
        icebergs,
        ice_data: iceData,
        weather,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.warn('[RL] 추론 API 오류:', response.status, err);
      return { fallback: true, error: err.error || `HTTP ${response.status}` };
    }

    return await response.json();
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      console.warn('[RL] 추론 타임아웃 (3초)');
    } else {
      console.warn('[RL] 추론 요청 실패:', e.message);
    }
    return { fallback: true, error: e.message };
  }
}

/**
 * RL 학습 상태 조회.
 */
export async function rlGetStatus() {
  try {
    const res = await fetch(`${RL_API_BASE}/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * RL 학습 시작 요청.
 */
export async function rlStartTraining(options = {}) {
  const { difficulty = 'medium', timesteps = 100000, curriculum = false } = options;
  try {
    const res = await fetch(`${RL_API_BASE}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ difficulty, timesteps, curriculum }),
    });
    return await res.json();
  } catch (e) {
    return { error: e.message };
  }
}
