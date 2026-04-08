"""
rl_reward.py -- 보상 함수

RL 에이전트의 보상을 계산합니다.
다중 목표: 충돌 회피, 경로 유지, 부드러운 조종, 연료 효율, 해빙 회피
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .config import MAX_SAFE_CONCENTRATION, ICE_CLASS_FACTORS


@dataclass
class RewardWeights:
    """보상 함수 가중치 (튜닝 가능)"""
    collision: float = -100.0
    proximity: float = -2.0
    route_deviation: float = -0.5
    progress: float = 2.0
    smoothness: float = -0.3
    fuel: float = -0.1
    ice_concentration: float = -0.5
    episode_success: float = 50.0


@dataclass
class RewardContext:
    """보상 계산에 필요한 환경 정보"""
    ship_lat: float
    ship_lon: float
    ship_speed_knots: float
    heading_change_deg: float
    speed_factor: float
    iceberg_distances_km: list
    iceberg_sizes_m: list
    cross_track_error_km: float
    along_track_progress: float
    max_allowed_deviation_km: float = 30.0
    ice_concentration: float = 0.0
    max_safe_concentration: float = 0.7
    visibility_km: float = 10.0
    wave_height_m: float = 1.0
    collision: bool = False
    episode_done_success: bool = False


def compute_dynamic_safety_radius(
    base_radius_km: float,
    speed_knots: float,
    visibility_km: float,
    ice_class_factor: float = 1.0,
) -> float:
    """
    동적 안전 반경 계산.
    속도가 빠를수록, 시정이 나쁠수록 안전 반경이 넓어집니다.
    """
    speed_scale = max(0.5, speed_knots / 12.0)
    visibility_scale = 1.0 / max(visibility_km, 1.0)
    return base_radius_km * speed_scale * (1.0 + visibility_scale) * ice_class_factor


def compute_reward(ctx: RewardContext, weights: RewardWeights | None = None) -> tuple[float, dict]:
    """
    보상 계산.

    Returns:
        (total_reward, component_dict)
    """
    if weights is None:
        weights = RewardWeights()

    components = {}

    # 1. 충돌 패널티
    components["collision"] = weights.collision if ctx.collision else 0.0

    # 2. 빙산 근접 패널티 (가우시안 감쇠)
    safety_radius = compute_dynamic_safety_radius(
        base_radius_km=10.0,
        speed_knots=ctx.ship_speed_knots,
        visibility_km=ctx.visibility_km,
    )
    proximity_penalty = 0.0
    for i, dist_km in enumerate(ctx.iceberg_distances_km):
        if dist_km < safety_radius * 3:
            size_m = ctx.iceberg_sizes_m[i] if i < len(ctx.iceberg_sizes_m) else 5000.0
            size_factor = min(2.0, size_m / 5000.0)
            proximity_penalty += math.exp(-(dist_km / safety_radius) ** 2) * size_factor
    components["proximity"] = weights.proximity * proximity_penalty

    # 3. 경로 이탈 패널티
    deviation_ratio = min(1.0, abs(ctx.cross_track_error_km) / ctx.max_allowed_deviation_km)
    components["route_deviation"] = weights.route_deviation * deviation_ratio ** 2

    # 4. 전진 보상
    components["progress"] = weights.progress * max(0.0, ctx.along_track_progress)

    # 5. 부드러움 패널티
    turn_ratio = abs(ctx.heading_change_deg) / 15.0
    components["smoothness"] = weights.smoothness * min(1.0, turn_ratio)

    # 6. 연료 효율 패널티
    components["fuel"] = weights.fuel * (1.0 - ctx.speed_factor)

    # 7. 해빙 농도 패널티
    if ctx.max_safe_concentration > 0:
        ice_ratio = ctx.ice_concentration / ctx.max_safe_concentration
        components["ice_concentration"] = weights.ice_concentration * min(1.0, ice_ratio)
    else:
        components["ice_concentration"] = 0.0

    # 8. 에피소드 성공 보너스
    components["episode_success"] = weights.episode_success if ctx.episode_done_success else 0.0

    total = sum(components.values())
    return total, components
