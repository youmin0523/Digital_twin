/**
 * rlConfig.js
 *
 * RL 빙산 회피 시스템 설정 및 정규화 상수.
 * 프론트엔드 추론(TF.js/ONNX) 시 관측 벡터 구성에 사용됩니다.
 */

// ── 관측 공간 정규화 상수 ──────────────────────────────────
export const OBS_NORMALIZATION = {
  LON_SCALE: 180.0,           // 경도 정규화 스케일
  LAT_SCALE: 90.0,            // 위도 정규화 스케일
  SPEED_SCALE: 15.0,          // 속도 정규화 (최대 15노트)
  DISTANCE_SCALE_WP: 100.0,   // 웨이포인트 거리 (km)
  DISTANCE_SCALE_WP_NORM: 200.0, // 방위/거리 정규화 (km)
  DISTANCE_SCALE_BERG: 50.0,  // 빙산 거리 (km)
  BEARING_SCALE: 180.0,       // 방위 정규화 (°)
  VISIBILITY_SCALE: 20.0,     // 시정 (km)
  WAVE_SCALE: 8.0,            // 파고 (m)
  DEVIATION_SCALE: 50.0,      // 교차 트랙 오류 (km)
};

// ── 행동 공간 범위 ────────────────────────────────────────
export const ACTION_RANGES = {
  HEADING_DELTA: { min: -15.0, max: 15.0 },  // 방향 변화 (°/스텝)
  SPEED_FACTOR: { min: 0.5, max: 1.0 },       // 속도 계수
};

// ── 빙급별 최대 안전 해빙 농도 ────────────────────────────
export const MAX_SAFE_CONCENTRATION = {
  PC2: 0.95,
  PC3: 0.9,
  PC4: 0.8,
  PC5: 0.7,
  PC6: 0.6,
  PC7: 0.5,
  'IA Super': 0.7,
  IA: 0.6,
  IB: 0.5,
  IC: 0.4,
  None: 0.3,
};

// ── RL 컨트롤러 설정 ──────────────────────────────────────
export const RL_CONTROLLER_CONFIG = {
  POLL_INTERVAL_MS: 2000,      // 폴링 주기 (ms)
  DETECTION_RADIUS_KM: 50,     // 빙산 감지 반경 (km)
  MIN_CONFIDENCE: 0.3,         // 최소 RL 신뢰도 (미만 시 A* 폴백)
  REROUTE_COOLDOWN_MS: 15000,  // 재경로 쿨다운 (ms)
  SAFETY_RADIUS_KM: 10,        // 기본 안전 반경 (km)
  LOOK_AHEAD_COUNT: 15,        // 전방 확인 웨이포인트 수
};

// ── API 설정 ──────────────────────────────────────────────
export const RL_API = {
  BASE_URL: '/api/rl',
  INFER_TIMEOUT_MS: 3000,
};
