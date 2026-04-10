"""
rl_iterative_trainer.py -- 자동화 반복 학습 파이프라인

학습 완료 후 성능 분석 → 보상 가중치 자동 조정 → 재학습을 반복해
성공률과 충돌 회피율이 목표치에 도달할 때까지 모델을 개선합니다.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .rl_reward import RewardWeights
from .rl_trainer import RLTrainer

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
HISTORY_PATH = MODEL_DIR / "iterative_history.json"

# ── 보상 가중치 Clamping 범위 ─────────────────────────────
WEIGHT_BOUNDS: dict[str, tuple[float, float]] = {
    "collision":         (-500.0, -50.0),
    "proximity":         (-10.0,  -0.5),
    "route_deviation":   (-5.0,   -0.1),
    "progress":          (0.5,    10.0),
    "smoothness":        (-2.0,   -0.05),
    "fuel":              (-1.0,   -0.01),
    "ice_concentration": (-5.0,   -0.1),
    "episode_success":   (10.0,   200.0),
}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _apply_bounds(w: RewardWeights) -> RewardWeights:
    d = dataclasses.asdict(w)
    for key, (lo, hi) in WEIGHT_BOUNDS.items():
        if key in d:
            d[key] = _clamp(d[key], lo, hi)
    return RewardWeights(**d)


# ── 분석 및 조정 클래스 ────────────────────────────────────
class RewardAdjuster:
    """평가 메트릭을 분석해 보상 가중치를 자동 조정합니다."""

    def analyze(self, metrics: dict) -> list[str]:
        """메트릭 → 활성 시그널 목록 반환 (우선순위 순)."""
        signals: list[str] = []
        cr = metrics.get("collision_rate", 1.0)
        sr = metrics.get("success_rate", 0.0)
        dev = metrics.get("mean_max_deviation_km", 0.0)

        if cr > 0.20:
            signals.append("critical_collision")
        elif cr > 0.10:
            signals.append("high_collision")

        if sr < 0.40:
            signals.append("low_success")
        elif sr < 0.70:
            signals.append("moderate_success")

        if dev > 30.0:
            signals.append("high_deviation")

        if cr <= 0.05 and sr >= 0.70:
            signals.append("converging")

        # 우선순위 기준 최대 3개
        priority = [
            "critical_collision", "high_collision",
            "low_success", "moderate_success",
            "high_deviation", "converging",
        ]
        ordered = [s for s in priority if s in signals]
        return ordered[:3]

    def adjust(self, weights: RewardWeights, signals: list[str]) -> RewardWeights:
        """시그널에 따라 가중치를 조정하고 clamping 적용."""
        d = dataclasses.asdict(weights)

        for sig in signals:
            if sig == "critical_collision":
                d["collision"] *= 1.5
                d["proximity"] *= 1.3
            elif sig == "high_collision":
                d["collision"] *= 1.25
                d["proximity"] *= 1.15
            elif sig == "low_success":
                d["episode_success"] *= 1.3
                d["progress"] *= 1.2
            elif sig == "moderate_success":
                d["episode_success"] *= 1.15
            elif sig == "high_deviation":
                d["route_deviation"] *= 1.3
                d["progress"] *= 0.9
            elif sig == "converging":
                d["smoothness"] *= 0.95
                d["fuel"] *= 0.95

        new_w = RewardWeights(**d)
        return _apply_bounds(new_w)

    def check_plateau(self, history: list[dict], field: str = "collision_rate",
                      threshold: float = 0.03, window: int = 2) -> bool:
        """최근 window 회 연속으로 field 개선이 threshold 미만이면 True."""
        if len(history) < window + 1:
            return False
        improvements = [
            abs(history[-(i+1)]["post_metrics"][field] -
                history[-(i+2)]["post_metrics"][field])
            for i in range(window)
        ]
        return all(imp < threshold for imp in improvements)


# ── 반복 학습 기록 ─────────────────────────────────────────
@dataclass
class IterationRecord:
    iteration: int
    weights: dict
    pre_metrics: dict
    post_metrics: dict
    signals: list[str]
    duration_seconds: float
    converged: bool


# ── 메인 반복 학습기 ───────────────────────────────────────
class IterativeTrainer:
    """학습→평가→보상 조정→재학습 루프를 자동으로 실행합니다."""

    def __init__(self, base_trainer: RLTrainer,
                 history_path: Path | None = None):
        self.base_trainer = base_trainer
        self.history_path = history_path or HISTORY_PATH
        self.history: list[IterationRecord] = []
        self.is_running = False
        self.stop_requested = False
        self.current_iteration = 0
        self.current_weights: Optional[RewardWeights] = None
        self.adjuster = RewardAdjuster()

    # ── 수렴 판단 ─────────────────────────────────────────
    def _converged(self, metrics: dict,
                   target_success: float,
                   target_collision: float) -> bool:
        return (metrics.get("success_rate", 0.0) >= target_success and
                metrics.get("collision_rate", 1.0) <= target_collision)

    # ── 히스토리 저장 (crash-safe) ────────────────────────
    def _save_history(self):
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        data = [dataclasses.asdict(r) for r in self.history]
        tmp = self.history_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.history_path)

    # ── 메인 루프 ─────────────────────────────────────────
    def run(self,
            max_iterations: int = 10,
            target_success_rate: float = 0.85,
            target_collision_rate: float = 0.05,
            eval_episodes: int = 100,
            eval_difficulty: str = "hard",
            initial_weights: RewardWeights | None = None) -> dict:

        self.is_running = True
        self.stop_requested = False
        self.history = []
        current_weights = initial_weights or RewardWeights()
        self.current_weights = current_weights

        logger.info(f"[IterativeTrainer] 반복 학습 시작 (max={max_iterations}, "
                    f"target_success={target_success_rate}, "
                    f"target_collision={target_collision_rate})")

        try:
            for i in range(1, max_iterations + 1):
                if self.stop_requested:
                    logger.info("[IterativeTrainer] 중단 요청으로 종료")
                    break

                self.current_iteration = i
                logger.info(f"[IterativeTrainer] ===== 반복 {i}/{max_iterations} =====")
                logger.info(f"[IterativeTrainer] 현재 가중치: {dataclasses.asdict(current_weights)}")

                iter_start = time.time()

                # 1. 학습 전 평가 (iteration 1이고 모델이 없으면 스킵)
                pre_metrics: dict = {}
                if self.base_trainer.agent.model is not None:
                    logger.info("[IterativeTrainer] 학습 전 평가 중...")
                    pre_metrics = self.base_trainer.evaluate(
                        n_episodes=eval_episodes, difficulty=eval_difficulty)
                    logger.info(f"[IterativeTrainer] 사전 평가: {pre_metrics}")

                    if self._converged(pre_metrics, target_success_rate, target_collision_rate):
                        logger.info("[IterativeTrainer] 이미 수렴 조건 달성 — 조기 종료")
                        record = IterationRecord(
                            iteration=i, weights=dataclasses.asdict(current_weights),
                            pre_metrics=pre_metrics, post_metrics=pre_metrics,
                            signals=[], duration_seconds=0.0, converged=True)
                        self.history.append(record)
                        self._save_history()
                        break

                # 2. 커리큘럼 학습
                logger.info("[IterativeTrainer] 커리큘럼 학습 시작...")
                self.base_trainer.train_curriculum(reward_weights=current_weights)

                # 3. 학습 후 평가
                logger.info("[IterativeTrainer] 학습 후 평가 중...")
                post_metrics = self.base_trainer.evaluate(
                    n_episodes=eval_episodes, difficulty=eval_difficulty)
                logger.info(f"[IterativeTrainer] 사후 평가: {post_metrics}")

                # 4. 시그널 분석 및 가중치 조정
                signals = self.adjuster.analyze(post_metrics)

                # Plateau 감지 — collision이 개선 없으면 proximity만 강화
                if ("critical_collision" in signals or "high_collision" in signals):
                    if self.adjuster.check_plateau(
                            [dataclasses.asdict(r) for r in self.history],
                            field="collision_rate"):
                        logger.info("[IterativeTrainer] Plateau 감지: collision 시그널 억제, proximity만 강화")
                        signals = [s for s in signals
                                   if s not in ("critical_collision", "high_collision")]
                        # proximity 직접 조정
                        d = dataclasses.asdict(current_weights)
                        d["proximity"] *= 1.2
                        current_weights = _apply_bounds(RewardWeights(**d))
                        next_weights = current_weights
                    else:
                        next_weights = self.adjuster.adjust(current_weights, signals)
                else:
                    next_weights = self.adjuster.adjust(current_weights, signals)

                converged = self._converged(
                    post_metrics, target_success_rate, target_collision_rate)
                elapsed = time.time() - iter_start

                record = IterationRecord(
                    iteration=i,
                    weights=dataclasses.asdict(current_weights),
                    pre_metrics=pre_metrics,
                    post_metrics=post_metrics,
                    signals=signals,
                    duration_seconds=elapsed,
                    converged=converged,
                )
                self.history.append(record)
                self._save_history()

                logger.info(f"[IterativeTrainer] 반복 {i} 완료 | "
                            f"success={post_metrics.get('success_rate', 0):.3f} | "
                            f"collision={post_metrics.get('collision_rate', 0):.3f} | "
                            f"signals={signals} | converged={converged}")

                if converged:
                    logger.info("[IterativeTrainer] 수렴 조건 달성 — 학습 종료")
                    break

                current_weights = next_weights
                self.current_weights = current_weights

        finally:
            self.is_running = False
            self.current_iteration = 0

        final_metrics = self.history[-1].post_metrics if self.history else {}
        return {
            "iterations_completed": len(self.history),
            "converged": self.history[-1].converged if self.history else False,
            "final_metrics": final_metrics,
            "final_weights": dataclasses.asdict(self.current_weights or RewardWeights()),
            "history_path": str(self.history_path),
        }

    def stop(self):
        self.stop_requested = True
        self.base_trainer.stop_requested = True

    def get_status(self) -> dict:
        return {
            "is_running": self.is_running,
            "current_iteration": self.current_iteration,
            "current_weights": (dataclasses.asdict(self.current_weights)
                                if self.current_weights else {}),
            "latest_metrics": (self.history[-1].post_metrics
                               if self.history else {}),
            "history": [dataclasses.asdict(r) for r in self.history[-5:]],
        }
