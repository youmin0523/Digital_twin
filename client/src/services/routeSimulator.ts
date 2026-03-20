import { ArcticRoute, FeasibilityRating, FeasibilityResult, IceDataset, RouteSegmentResult, VesselProfile } from '../types';
import { sampleConcentration } from '../data/mockIceData';

const SAMPLE_POINTS_PER_SEGMENT = 20;
const NSR_BASELINE_NM = 7000;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function ratingFromMargin(conc: number, maxSafe: number): FeasibilityRating {
  const margin = maxSafe - conc;
  if (margin >= 0.2) return 'safe';
  if (margin >= 0) return 'caution';
  if (margin >= -0.15) return 'dangerous';
  return 'impossible';
}

function scoreToRating(score: number): FeasibilityRating {
  if (score >= 75) return 'safe';
  if (score >= 50) return 'caution';
  if (score >= 25) return 'dangerous';
  return 'impossible';
}

function getRecommendation(rating: FeasibilityRating, routeNameKo: string, days: number): string {
  switch (rating) {
    case 'safe':
      return `${routeNameKo} 운항 적합. 예상 소요: 약 ${days.toFixed(1)}일. 정상 항해 진행 권고.`;
    case 'caution':
      return `${routeNameKo} 조건부 운항. 예상 소요: 약 ${days.toFixed(1)}일. 쇄빙 지원 대기 권고.`;
    case 'dangerous':
      return `${routeNameKo} 위험 구간 다수. 예상 소요: 약 ${days.toFixed(1)}일. 쇄빙선 선도 없이 단독 운항 불가.`;
    case 'impossible':
      return `${routeNameKo} 현재 선박 등급으로 통과 불가. 출항 연기 또는 고등급 선박으로 교체 필요.`;
  }
}

export function calculateFeasibility(
  route: ArcticRoute,
  profile: VesselProfile,
  dataset: IceDataset
): FeasibilityResult {
  const segments: RouteSegmentResult[] = [];
  let totalConcentration = 0;
  let totalSamples = 0;

  for (let i = 0; i < route.waypoints.length - 1; i++) {
    const from = route.waypoints[i];
    const to = route.waypoints[i + 1];
    let segConc = 0;

    for (let s = 0; s < SAMPLE_POINTS_PER_SEGMENT; s++) {
      const t = s / (SAMPLE_POINTS_PER_SEGMENT - 1);
      const lon = from.lon + (to.lon - from.lon) * t;
      const lat = from.lat + (to.lat - from.lat) * t;
      const c = sampleConcentration(dataset, lon, lat);
      segConc += c;
      totalConcentration += c;
      totalSamples++;
    }

    const avgSegConc = segConc / SAMPLE_POINTS_PER_SEGMENT;

    segments.push({
      from,
      to,
      avgConcentration: avgSegConc,
      rating: ratingFromMargin(avgSegConc, profile.maxSafeConcentration),
    });
  }

  const avgConcentration = totalSamples > 0 ? totalConcentration / totalSamples : 0;

  // ── Scoring ──────────────────────────────────────────────────────────────
  // Ice score (weight 0.4): how well vessel handles average ice
  const capabilityGap = profile.maxSafeConcentration - avgConcentration;
  const iceScore = clamp((capabilityGap / profile.maxSafeConcentration) * 100, 0, 100);

  // Distance score (weight 0.3): shorter is better (baseline = NSR)
  const distanceScore = clamp((NSR_BASELINE_NM * 1.5 - route.totalDistanceNm) / (NSR_BASELINE_NM * 0.015), 0, 100);

  // Capability score (weight 0.3): PC1=100, PC7≈14
  const pcNum = parseInt(profile.iceClass.replace('PC', ''), 10);
  const capabilityScore = ((8 - pcNum) / 7) * 100;

  const scoreTotal = iceScore * 0.4 + distanceScore * 0.3 + capabilityScore * 0.3;
  const overallRating = scoreToRating(scoreTotal);

  // Estimated transit time with ice resistance penalty
  const effectiveSpeed = profile.speedKnots * (1 - avgConcentration * 0.6);
  const estimatedDays = effectiveSpeed > 0
    ? route.totalDistanceNm / effectiveSpeed / 24
    : 999;

  return {
    routeId: route.id,
    overallRating,
    scoreTotal,
    iceScore,
    distanceScore,
    capabilityScore,
    estimatedDays,
    avgConcentration,
    segments,
    recommendation: getRecommendation(overallRating, route.nameKo, estimatedDays),
  };
}

export function calculateAllRoutes(
  routes: ArcticRoute[],
  profile: VesselProfile,
  dataset: IceDataset
): FeasibilityResult[] {
  return routes.map((r) => calculateFeasibility(r, profile, dataset));
}
