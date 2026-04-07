// ═══════════════════════════════════════════════════════════════
// POLARIS RIO (Risk Index Outcome) Calculator
// Extracted from arctic-hybrid.html lines 2324-2570
// KR Polar Code Implementation Guide + IMO MSC.1/Circ.1519
// ═══════════════════════════════════════════════════════════════

import { ICE_CLASS_DATA, RIV_TABLE } from '../data/iceClassData.js';

/**
 * Calculate the Risk Index Outcome (RIO) for a given ice class and ice conditions.
 *
 * @param {string} iceClass       - Polar class key (e.g. 'PC1'..'PC7', 'NONE', 'IA Super', etc.)
 * @param {Array}  iceConditions  - Array of { type: string, concentration_tenths: number }
 * @returns {number} RIO score (positive = safe, negative = dangerous)
 */
export function calculateRIO(iceClass, iceConditions) {
  const classRivs = RIV_TABLE[iceClass] || RIV_TABLE['NONE'];
  let rio = 0;
  for (const entry of iceConditions) {
    const riv = classRivs[entry.type];
    if (riv === undefined) continue; // 알 수 없는 빙질은 건너뜀
    rio += entry.concentration_tenths * riv;
  }
  return Math.round(rio * 10000) / 10000;
}

/**
 * Derive POLARIS ice_conditions array from position and ice concentration.
 * Uses latitude-based heuristics to distribute ice types.
 *
 * @param {number}   lon                   - Longitude
 * @param {number}   lat                   - Latitude
 * @param {Function} sampleIceConcentration - Function(lon,lat) => 0..1 concentration
 * @returns {Array} Array of { type: string, concentration_tenths: number }
 */
export function deriveIceConditions(lon, lat, sampleIceConcentration) {
  const conc = Math.max(0, Math.min(1, sampleIceConcentration(lon, lat) || 0));
  const openWater = Math.max(0, 1 - conc);
  const conditions = [];

  if (lat > 82) {
    // 극고위도: 다년생 빙(MY) + 압퇴빙 지배
    if (conc * 0.6 > 0)
      conditions.push({
        type: 'Multi-Year (MY)',
        concentration_tenths: conc * 0.6,
      });
    if (conc * 0.3 > 0)
      conditions.push({
        type: 'Ridged/Hummocked',
        concentration_tenths: conc * 0.3,
      });
    if (conc * 0.1 > 0)
      conditions.push({
        type: 'Thick First-Year (FY)',
        concentration_tenths: conc * 0.1,
      });
  } else if (lat > 78) {
    // 고위도: 후기 1년생 + 다년생
    if (conc * 0.5 > 0)
      conditions.push({
        type: 'Thick First-Year (FY)',
        concentration_tenths: conc * 0.5,
      });
    if (conc * 0.35 > 0)
      conditions.push({
        type: 'Multi-Year (MY)',
        concentration_tenths: conc * 0.35,
      });
    if (conc * 0.15 > 0)
      conditions.push({
        type: 'Ridged/Hummocked',
        concentration_tenths: conc * 0.15,
      });
  } else if (lat > 74) {
    // 중위도: 중간 두께 1년생 빙 지배
    if (conc * 0.6 > 0)
      conditions.push({
        type: 'Medium First-Year (FY)',
        concentration_tenths: conc * 0.6,
      });
    if (conc * 0.3 > 0)
      conditions.push({
        type: 'Thin First-Year (FY)',
        concentration_tenths: conc * 0.3,
      });
    if (conc * 0.1 > 0)
      conditions.push({
        type: 'Grey-White Ice',
        concentration_tenths: conc * 0.1,
      });
  } else if (lat > 68) {
    // 저위도 북극 주변부: 얇은 1년생 빙
    if (conc * 0.7 > 0)
      conditions.push({
        type: 'Thin First-Year (FY)',
        concentration_tenths: conc * 0.7,
      });
    if (conc * 0.2 > 0)
      conditions.push({
        type: 'Grey-White Ice',
        concentration_tenths: conc * 0.2,
      });
    if (conc * 0.1 > 0)
      conditions.push({ type: 'Grey Ice', concentration_tenths: conc * 0.1 });
  } else {
    // 개빙수역
    if (conc * 0.5 > 0)
      conditions.push({ type: 'Grey Ice', concentration_tenths: conc * 0.5 });
    if (conc * 0.5 > 0)
      conditions.push({
        type: 'Grey-White Ice',
        concentration_tenths: conc * 0.5,
      });
  }

  if (openWater > 0)
    conditions.push({ type: 'Open Water', concentration_tenths: openWater });
  return conditions;
}

// //* [Modified Code] UI 가이드 및 재사용을 위해 핵심 기항 상수를 상단으로 추출 및 Export
export const NSR_MAX_DRAFT = 12.5;
export const NSR_MAX_BEAM = 35.0;
export const MIN_RESCUE_DAYS = 5;
export const MIN_TEMP_MARGIN = 10.0;

/**
 * 5-step sequential routing decision tree.
 * Returns { status, reason, rioScore }.
 *
 * @param {Object} shipData - Ship evaluation input:
 *   isSanctionedCountry, hasNsraPermit, hasPwom,
 *   fuelType, hasHfoExemption,
 *   draft, beam,
 *   maxRescueDays, isTempBelowMinus10, designTempMargin,
 *   hasWinterization, hasZeroDischarge, hasPolarComms, hasIceNavigator,
 *   latitude, commsType,
 *   shipType, waveHeight, visibilityKm,
 *   iceClass, iceConditions
 * @returns {Object} { status: string, reason: string, rioScore: number|null }
 */
export function evaluateRouting(shipData) {
  // ── Step 1: 지정학·행정·환경 규제 필터 ─────────────────────────────
  if (shipData.isSanctionedCountry) {
    return {
      status: 'REROUTE_CAPE',
      reason:
        '[Step 1a] 선박 국적이 대러시아 제재 참여국입니다. NSR 통과 시 국제 제재 위반 및 선박·화물 압류 위험 → 희망봉(CAPE) 우회.',
      rioScore: null,
    };
  }
  if (!shipData.hasNsraPermit) {
    return {
      status: 'REROUTE_SUEZ',
      reason:
        '[Step 1b] NSRA(러시아 북극항로청) 사전 운항 허가 미취득. NSR은 45일 전 신청 필수 → 수에즈 우회.',
      rioScore: null,
    };
  }
  if (!shipData.hasPwom) {
    return {
      status: 'REROUTE_SUEZ',
      reason:
        '[Step 1b] 극지해역 운항 매뉴얼(PWOM) 미비치. IMO Polar Code 필수 문서 → 수에즈 우회.',
      rioScore: null,
    };
  }
  const fuelType = shipData.fuelType || 'MGO';
  const hasHfoExemption = shipData.hasHfoExemption || false;
  if (fuelType === 'HFO' && !hasHfoExemption) {
    return {
      status: 'REROUTE_SUEZ',
      reason:
        '[Step 1c] HFO(중질유) 사용·적재 선박으로 IMO 북극해 HFO 금지 규정(MARPOL Annex I) 위반. 면제 인증 미보유 → 수에즈 우회.',
      rioScore: null,
    };
  }

  // ── Step 2: 물리적 크기 필터 ─────────────────────────────────────
  if (shipData.draft > NSR_MAX_DRAFT) {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 2a] 흘수 ${shipData.draft.toFixed(1)}m > NSR 수심 제한 ${NSR_MAX_DRAFT}m (빌키츠키·사니코프 해협). 수에즈 우회.`,
      rioScore: null,
    };
  }
  if (shipData.beam > NSR_MAX_BEAM) {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 2b] 선폭 ${shipData.beam.toFixed(1)}m > 쇄빙선 수로 허용 ${NSR_MAX_BEAM}m. 에스코트 불가 → 수에즈 우회.`,
      rioScore: null,
    };
  }

  // ── Step 3: Polar Code 생존·설비·통신 기준 ───────────────────────
  if (shipData.maxRescueDays < MIN_RESCUE_DAYS) {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 3a] 생존 장비 ${shipData.maxRescueDays}일 < KR Polar Code 최소 기준 ${MIN_RESCUE_DAYS}일. SAR 대응 지연 시 승무원 안전 불보장 → 수에즈 우회.`,
      rioScore: null,
    };
  }
  if (
    shipData.isTempBelowMinus10 &&
    shipData.designTempMargin < MIN_TEMP_MARGIN
  ) {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 3b] 저온 해역(-10°C↓) 운항 시 설계 온도 여유 ${shipData.designTempMargin}°C < 권고 기준 ${MIN_TEMP_MARGIN}°C. 구조 취성 파괴 위험 → 수에즈 우회.`,
      rioScore: null,
    };
  }
  const missing = [];
  if (!shipData.hasWinterization) missing.push('방한 설비');
  if (!shipData.hasZeroDischarge) missing.push('무배출 탱크');
  if (!shipData.hasPolarComms) missing.push('극지 통신');
  if (!shipData.hasIceNavigator) missing.push('극지 항해사');
  if (missing.length > 0) {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 3c] Polar Code 필수 설비/인력 미비: ${missing.join(', ')}. KR 이행 가이드 9~12장 요건 미충족 → 수에즈 우회.`,
      rioScore: null,
    };
  }
  const latitude = shipData.latitude ?? 70.0;
  const commsType = shipData.commsType || 'GEO';
  if (latitude >= 75.0 && commsType !== 'LEO') {
    return {
      status: 'REROUTE_SUEZ',
      reason: `[Step 3d] 항로 최고 위도 ${latitude.toFixed(1)}°N ≥ 75° — GEO 위성 앙각 부족으로 통신 불가 구간 발생. Iridium/Starlink 등 LEO 통신 필수 (현재: ${commsType}) → 수에즈 우회.`,
      rioScore: null,
    };
  }

  // ── Step 4: 선종별 특화 기상 필터 ────────────────────────────────
  const shipType = shipData.shipType || 'General';
  const waveHeight = shipData.waveHeight ?? 0.0;
  const visibilityKm = shipData.visibilityKm ?? 10.0;
  let weatherWarning = '';

  if (shipType === 'Container Ship') {
    if (waveHeight > 4.0) {
      return {
        status: 'REROUTE_SUEZ',
        reason: `[Step 4a] 컨테이너선 한계 파고 초과: 유의 파고 ${waveHeight.toFixed(1)}m > 4.0m. 갑판 적재 컨테이너 유실(Cargo Loss) 및 구조 손상 위험 → 수에즈 우회.`,
        rioScore: null,
      };
    }
    if (shipData.isTempBelowMinus10 && waveHeight > 2.5) {
      return {
        status: 'REROUTE_SUEZ',
        reason: `[Step 4b] 컨테이너선 착빙(Vessel Icing) 위험: 기온 -10°C 미만 + 파고 ${waveHeight.toFixed(1)}m > 2.5m. 치명적 선체 착빙 예상, 복원력 상실 위험 → 수에즈 우회.`,
        rioScore: null,
      };
    }
  } else if (shipType === 'LNG Carrier') {
    if (waveHeight > 6.0) {
      weatherWarning += `[LNG선 경고: 파고 ${waveHeight.toFixed(1)}m > 6.0m — 슬로싱·BOG 증가. 감속·가스 관리 주의 운항] `;
    }
  } else if (shipType === 'Icebreaker') {
    if (waveHeight > 8.0) {
      weatherWarning += `[쇄빙선 경고: 파고 ${waveHeight.toFixed(1)}m > 8.0m — 황천 해역 호송 임무 제한. 독립 항행 전환 검토] `;
    }
  }
  if (visibilityKm < 1.0) {
    weatherWarning += `[가시거리 경고: ${visibilityKm.toFixed(1)}km 미만 — 해무/극야 조건. 속도 50% 이상 감속 및 연속 레이더 감시 필수] `;
  }
  weatherWarning = weatherWarning.trim();

  // ── Step 5: POLARIS RIO 평가 ─────────────────────────────────────
  const rio = calculateRIO(shipData.iceClass, shipData.iceConditions);

  if (rio >= 0) {
    const baseReason = `[Step 5a] POLARIS RIO +${rio.toFixed(2)}. 모든 기준 충족, 현재 빙상 조건에서 NSR 정상 통과 승인.`;
    if (weatherWarning) {
      return {
        status: 'NSR_RESTRICTED',
        reason: `${baseReason} | ${weatherWarning}`,
        rioScore: rio,
      };
    }
    return { status: 'NSR_APPROVED', reason: baseReason, rioScore: rio };
  }
  if (rio >= -10) {
    const baseReason = `[Step 5b] RIO ${rio.toFixed(2)} (경계: -10≤RIO<0). 고위험 빙해역 — 쇄빙선 에스코트 필수, 권고 속도 준수, 24h 빙상 감시 조건부 통과.`;
    return {
      status: 'NSR_RESTRICTED',
      reason: weatherWarning ? `${baseReason} | ${weatherWarning}` : baseReason,
      rioScore: rio,
    };
  }
  return {
    status: 'REROUTE_SUEZ',
    reason: `[Step 5c] RIO ${rio.toFixed(2)} < -10. POLARIS 특별 고려 대상 해역(빙하·다년생 빙 지배). 선박 설계 한계 초과, 안전 항해 계획 불가 → 수에즈 우회.`,
    rioScore: rio,
  };
}
