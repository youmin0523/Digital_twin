/**
 * rlAvoidanceController.js
 *
 * RL 기반 빙산 회피 오케스트레이터.
 * - 2초마다 선박 상태를 확인하고 빙산 근접 시 RL 추론 실행
 * - RL 결과를 부드러운 우회 경로로 변환하여 기존 경로에 병합
 * - RL 실패 시 기존 A* 시스템으로 자동 폴백
 */

import { rlInfer } from './rlInferenceClient';
import { checkRouteAhead, rerouteAroundIceberg } from './icebergAvoidance';
import { mergeDetourSmooth, rlPositionsToWaypoints } from './smoothPathGenerator';
import { buildTimings, routePos } from './shipSimulator';

const POLL_INTERVAL_MS = 2000;     // 2초마다 확인
const DETECTION_RADIUS_KM = 50;    // 50km 이내 빙산 감지
const MIN_RL_CONFIDENCE = 0.3;     // RL 최소 신뢰도 (미만 시 A* 폴백)
const DEG_TO_KM = 111.32;

function approxDistKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG_TO_KM;
  const dLon = (lon2 - lon1) * DEG_TO_KM * Math.cos(((lat1 + lat2) / 2) * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/**
 * RL 회피 컨트롤러 생성.
 *
 * @param {Object} options
 * @param {Function} options.getShipState    - () => {lon, lat, heading, speed_knots}
 * @param {Function} options.getIcebergs     - () => [{lat, lon, length_m}, ...]
 * @param {Function} options.getActiveWps    - () => [{lon, lat, label}, ...]
 * @param {Function} options.getProgress     - () => number (0~1)
 * @param {Function} options.getIceData      - () => {concentration, cells} | null
 * @param {Function} options.getWeather      - () => {visibility_km, wave_height_m}
 * @param {Function} options.getIceClass     - () => string (e.g., "PC5")
 * @param {Function} options.dispatch        - React dispatch 함수
 * @param {Function} options.showToast       - 토스트 메시지 표시 함수
 * @returns {Object} - {start, stop, isActive}
 */
export function createRLAvoidanceController(options) {
  const {
    getShipState,
    getIcebergs,
    getActiveWps,
    getProgress,
    getIceData,
    getWeather,
    getIceClass,
    dispatch,
    showToast,
  } = options;

  let intervalId = null;
  let isProcessing = false;
  let lastRerouteTime = 0;
  const REROUTE_COOLDOWN_MS = 15000; // 재경로 설정 쿨다운 15초

  async function tick() {
    if (isProcessing) return;

    const now = Date.now();
    if (now - lastRerouteTime < REROUTE_COOLDOWN_MS) return;

    const ship = getShipState();
    const icebergs = getIcebergs();
    if (!ship || !icebergs || icebergs.length === 0) return;

    // 전방 50km 이내 빙산 필터링
    const nearbyBergs = icebergs.filter((berg) => {
      const dist = approxDistKm(ship.lat, ship.lon, berg.lat, berg.lon);
      return dist < DETECTION_RADIUS_KM;
    });

    if (nearbyBergs.length === 0) return;

    // 기존 경로에서 위험 구간 확인
    const wps = getActiveWps();
    const progress = getProgress();
    const currentSeg = Math.floor(progress * (wps.length - 1));

    const { blocked, dangerIdx } = checkRouteAhead(
      wps, currentSeg, nearbyBergs, 10, 15,
    );

    if (!blocked) return;

    // 위험 감지 — 회피 경로 계산 시작
    isProcessing = true;

    try {
      dispatch({ type: 'SET_REROUTING', payload: true });
      showToast('🧊 빙산 감지! RL 우회 경로 계산 중...', 5000);

      const iceData = getIceData();
      const weather = getWeather() || { visibility_km: 10, wave_height_m: 1 };
      const iceClass = getIceClass() || 'PC5';

      // 1차: RL 추론 시도
      const rlResult = await rlInfer(
        {
          lon: ship.lon,
          lat: ship.lat,
          heading: ship.heading || 0,
          speed_knots: ship.speed_knots || 14,
          ice_class: iceClass,
          progress,
          next_waypoint: dangerIdx < wps.length
            ? { lon: wps[dangerIdx].lon, lat: wps[dangerIdx].lat }
            : null,
        },
        nearbyBergs.map((b) => ({
          lat: b.lat, lon: b.lon, length_m: b.length_m || 5000,
        })),
        { concentration: iceData?.concentration || 0 },
        weather,
      );

      let newWaypoints = null;
      let newProgress = progress;
      let method = 'unknown';

      if (!rlResult.fallback && rlResult.confidence >= MIN_RL_CONFIDENCE && rlResult.projected_path?.length > 0) {
        // RL 성공 — 예측 경로를 웨이포인트로 변환
        method = 'RL';
        const margin = 5;
        const insertStart = Math.max(0, dangerIdx - margin);
        const insertEnd = Math.min(wps.length - 1, dangerIdx + margin);
        const startWp = wps[insertStart];
        const endWp = wps[insertEnd];

        const detourWps = rlPositionsToWaypoints(
          rlResult.projected_path.map((p) => [p.lon, p.lat]),
          startWp,
          endWp,
        );

        const merged = mergeDetourSmooth(
          wps, detourWps, progress, insertStart, insertEnd,
        );
        newWaypoints = merged.newWaypoints;
        newProgress = merged.newProgress;
      } else {
        // 2차: A* 폴백
        method = 'A*';
        console.warn('[RL] 폴백 → A*', rlResult.error || `confidence=${rlResult.confidence}`);

        if (iceData) {
          const { rerouted, newWaypoints: astarWps } = await rerouteAroundIceberg(
            wps, dangerIdx, iceData, nearbyBergs,
          );
          if (rerouted) {
            // A* 결과도 스무딩 적용
            const margin = 5;
            const insertStart = Math.max(0, dangerIdx - margin);
            const insertEnd = Math.min(wps.length - 1, dangerIdx + margin);

            // A* 결과에서 새로 삽입된 구간 추출
            const beforeLen = insertStart;
            const afterLen = wps.length - insertEnd - 1;
            const detourPortion = astarWps.slice(
              beforeLen,
              astarWps.length - afterLen,
            );

            if (detourPortion.length > 2) {
              const smoothed = mergeDetourSmooth(
                wps, detourPortion, progress, insertStart, insertEnd,
              );
              newWaypoints = smoothed.newWaypoints;
              newProgress = smoothed.newProgress;
            } else {
              newWaypoints = astarWps;
            }
          }
        }
      }

      if (newWaypoints) {
        dispatch({
          type: 'SET_GENERATED_WAYPOINTS_WITH_PROGRESS',
          payload: {
            waypoints: newWaypoints,
            progress: newProgress,
            elapsed: newProgress * 14 * 86400, // 14일 항해 기준
          },
        });
        lastRerouteTime = Date.now();
        showToast(`빙산 우회 경로 적용 완료 (${method})`, 3000);
        console.log(`[RL Controller] ${method} 우회 경로 적용: ${newWaypoints.length}개 웨이포인트`);
      } else {
        showToast('우회 경로 탐색 실패 — 현재 경로 유지', 3000);
      }
    } catch (e) {
      console.error('[RL Controller] 오류:', e);
      showToast('우회 경로 계산 중 오류 발생', 3000);
    } finally {
      isProcessing = false;
      dispatch({ type: 'SET_REROUTING', payload: false });
    }
  }

  return {
    start() {
      if (intervalId) return;
      intervalId = setInterval(tick, POLL_INTERVAL_MS);
      console.log('[RL Controller] 시작 (2초 간격)');
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
        console.log('[RL Controller] 중지');
      }
    },

    get isActive() {
      return intervalId !== null;
    },

    get isProcessing() {
      return isProcessing;
    },

    /** 수동으로 즉시 확인 실행 */
    async checkNow() {
      await tick();
    },
  };
}
