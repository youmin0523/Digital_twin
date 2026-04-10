"""
departure_iterative_trainer.py — 출항 RL 자동화 반복 학습 파이프라인

학습 완료 후 성능 분석 → 보상 가중치 자동 조정 → 재학습을 반복해
출항 성공률과 통행 불가 구간 비율이 목표치에 도달할 때까지 모델을 개선합니다.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Optional

from modules.rl.departure_env import DepartureRewardWeights

logger = logging.getLogger("report-service.rl.departure_iterative_trainer")

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
HISTORY_PATH = DATA_DIR / "departure_iterative_history.json"
MODEL_DIR = DATA_DIR / "departure_rl_model"

# ── 보상 가중치 Clamping 범위 ─────────────────────────────
WEIGHT_BOUNDS: dict[str, tuple[float, float]] = {
    "prohibitive_penalty": (-100.0, -5.0),
    "success_bonus":       (20.0,   200.0),
    "efficiency_penalty":  (-20.0,  -1.0),
}


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _apply_bounds(w: DepartureRewardWeights) -> DepartureRewardWeights:
    d = dataclasses.asdict(w)
    for key, (lo, hi) in WEIGHT_BOUNDS.items():
        if key in d:
            d[key] = _clamp(d[key], lo, hi)
    return DepartureRewardWeights(**d)


# ── 분석 및 조정 클래스 ────────────────────────────────────
class DepartureRewardAdjuster:
    """출항 RL 평가 메트릭을 분석해 보상 가중치를 자동 조정합니다."""

    def analyze(self, metrics: dict) -> list[str]:
        """메트릭 → 활성 시그널 목록 반환."""
        signals: list[str] = []
        sr = metrics.get("success_rate", 0.0)
        pr = metrics.get("prohibitive_rate", 1.0)
        td = metrics.get("mean_transit_days", 0.0)

        if pr > 0.30:
            signals.append("high_prohibitive")

        if sr < 0.40:
            signals.append("low_success")
        elif sr < 0.70:
            signals.append("moderate_success")

        if td > 20.0:
            signals.append("slow_transit")

        if sr >= 0.70 and pr <= 0.10:
            signals.append("converging")

        # 우선순위 기준 최대 3개
        priority = [
            "high_prohibitive",
            "low_success", "moderate_success",
            "slow_transit", "converging",
        ]
        ordered = [s for s in priority if s in signals]
        return ordered[:3]

    def adjust(self, weights: DepartureRewardWeights, signals: list[str]) -> DepartureRewardWeights:
        """시그널에 따라 가중치를 조정하고 clamping 적용."""
        d = dataclasses.asdict(weights)

        for sig in signals:
            if sig == "high_prohibitive":
                d["prohibitive_penalty"] *= 1.4
            elif sig == "low_success":
                d["success_bonus"] *= 1.3
            elif sig == "moderate_success":
                d["success_bonus"] *= 1.15
            elif sig == "slow_transit":
                d["efficiency_penalty"] *= 1.25
            elif sig == "converging":
                d["efficiency_penalty"] *= 0.95

        return _apply_bounds(DepartureRewardWeights(**d))

    def check_plateau(self, history: list[dict], field: str = "prohibitive_rate",
                      threshold: float = 0.03, window: int = 2) -> bool:
        """최근 window 회 연속으로 field 개선이 threshold 미만이면 True."""
        if len(history) < window + 1:
            return False
        improvements = [
            abs(history[-(i+1)]["post_metrics"].get(field, 0) -
                history[-(i+2)]["post_metrics"].get(field, 0))
            for i in range(window)
        ]
        return all(imp < threshold for imp in improvements)


# ── 반복 학습 기록 ─────────────────────────────────────────
@dataclass
class DepartureIterationRecord:
    iteration: int
    weights: dict
    pre_metrics: dict
    post_metrics: dict
    signals: list[str]
    duration_seconds: float
    converged: bool


# ── 평가 유틸 ─────────────────────────────────────────────
def _evaluate_agent(agent, monthly_ice: dict, weather_data: dict,
                    route_scorer, ice_class: str,
                    n_episodes: int = 50) -> dict:
    """에이전트 성능 평가 — success_rate, prohibitive_rate, mean_rio, mean_transit_days 반환."""
    from modules.rl.departure_env import DepartureSchedulingEnv

    if agent.model is None:
        return {"success_rate": 0.0, "prohibitive_rate": 1.0,
                "mean_rio": -999.0, "mean_transit_days": 30.0}

    successes, prohibitives = 0, 0
    total_rio, total_transit = 0.0, 0.0
    completed = 0

    for _ in range(n_episodes):
        # 랜덤 난이도 섞어서 평가
        difficulty = ["easy", "medium", "hard"][_ % 3]
        env = DepartureSchedulingEnv(
            monthly_ice=monthly_ice,
            weather_data=weather_data,
            route_scorer=route_scorer,
            ice_class=ice_class,
            difficulty=difficulty,
        )
        try:
            obs, _ = env.reset()
            action, _ = agent.predict(obs)
            if action is None:
                env.close()
                continue
            obs, reward, terminated, truncated, info = env.step(action)

            # 성공 판단: 보상이 success_bonus 기준 이상이면 통행 불가 없음
            # route_scorer 없는 환경에선 reward > 0으로 판단
            if reward > 0:
                successes += 1
            else:
                prohibitives += 1

            total_rio += reward
            total_transit += env.transit_days
            completed += 1
        except Exception:
            pass
        finally:
            env.close()

    if completed == 0:
        return {"success_rate": 0.0, "prohibitive_rate": 1.0,
                "mean_rio": -999.0, "mean_transit_days": 30.0}

    return {
        "success_rate": successes / completed,
        "prohibitive_rate": prohibitives / completed,
        "mean_rio": total_rio / completed,
        "mean_transit_days": total_transit / completed,
    }


# ── 메인 반복 학습기 ───────────────────────────────────────
class DepartureIterativeTrainer:
    """출항 RL 학습→평가→보상 조정→재학습 루프를 자동으로 실행합니다."""

    def __init__(self, departure_trainer, history_path: Path | None = None):
        self.departure_trainer = departure_trainer
        self.history_path = history_path or HISTORY_PATH
        self.history: list[DepartureIterationRecord] = []
        self.is_running = False
        self.stop_requested = False
        self.current_iteration = 0
        self.current_weights: Optional[DepartureRewardWeights] = None
        self.adjuster = DepartureRewardAdjuster()
        self._agent = None  # 반복 간 에이전트 유지

    def _converged(self, metrics: dict,
                   target_success: float,
                   target_prohibitive: float) -> bool:
        return (metrics.get("success_rate", 0.0) >= target_success and
                metrics.get("prohibitive_rate", 1.0) <= target_prohibitive)

    def _save_history(self):
        self.history_path.parent.mkdir(parents=True, exist_ok=True)
        data = [dataclasses.asdict(r) for r in self.history]
        tmp = self.history_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.history_path)

    def _save_versioned_model(self, iteration: int):
        """현재 에이전트 모델을 버전별로 저장."""
        if self._agent is None or self._agent.model is None:
            return
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        versioned_path = MODEL_DIR / f"departure_sac_v{iteration}"
        self._agent.model.save(str(versioned_path))
        logger.info("[DepartureIterative] 버전 모델 저장: %s", versioned_path)

    def run(self,
            monthly_ice: dict,
            weather_data: dict,
            route_scorer,
            ice_class: str = "PC5",
            forecast_days: int = 30,
            transit_days: int = 14,
            base_timesteps: int = 100_000,
            max_iterations: int = 10,
            target_success_rate: float = 0.80,
            target_prohibitive_rate: float = 0.10,
            eval_episodes: int = 50,
            initial_weights: DepartureRewardWeights | None = None) -> dict:

        from modules.rl.departure_agent import DepartureAgent

        self.is_running = True
        self.stop_requested = False
        self.history = []
        self.departure_trainer.stop_requested = False
        current_weights = initial_weights or DepartureRewardWeights()
        self.current_weights = current_weights

        # 에이전트를 반복 간 유지 (가중치 축적)
        if self._agent is None:
            self._agent = DepartureAgent()

        logger.info("[DepartureIterative] 반복 학습 시작 (max=%d, "
                    "target_success=%.2f, target_prohibitive=%.2f)",
                    max_iterations, target_success_rate, target_prohibitive_rate)

        try:
            for i in range(1, max_iterations + 1):
                if self.stop_requested:
                    logger.info("[DepartureIterative] 중단 요청으로 종료")
                    break

                self.current_iteration = i
                logger.info("[DepartureIterative] ===== 반복 %d/%d =====", i, max_iterations)
                logger.info("[DepartureIterative] 현재 가중치: %s",
                            dataclasses.asdict(current_weights))

                iter_start = time.time()

                # 1. 학습 전 평가
                pre_metrics: dict = {}
                if self._agent.model is not None:
                    logger.info("[DepartureIterative] 학습 전 평가 중...")
                    pre_metrics = _evaluate_agent(
                        self._agent, monthly_ice, weather_data,
                        route_scorer, ice_class, eval_episodes)
                    logger.info("[DepartureIterative] 사전 평가: %s", pre_metrics)

                    if self._converged(pre_metrics, target_success_rate, target_prohibitive_rate):
                        logger.info("[DepartureIterative] 이미 수렴 조건 달성 — 조기 종료")
                        record = DepartureIterationRecord(
                            iteration=i, weights=dataclasses.asdict(current_weights),
                            pre_metrics=pre_metrics, post_metrics=pre_metrics,
                            signals=[], duration_seconds=0.0, converged=True)
                        self.history.append(record)
                        self._save_history()
                        break

                # 2. 커리큘럼 학습 — departure_trainer를 직접 호출하되
                #    내부 에이전트 대신 self._agent를 사용해 상태 유지
                logger.info("[DepartureIterative] 커리큘럼 학습 시작...")
                self._run_curriculum_with_agent(
                    monthly_ice, weather_data, route_scorer, ice_class,
                    forecast_days, transit_days, base_timesteps, current_weights)

                # 3. 학습 후 평가
                logger.info("[DepartureIterative] 학습 후 평가 중...")
                post_metrics = _evaluate_agent(
                    self._agent, monthly_ice, weather_data,
                    route_scorer, ice_class, eval_episodes)
                logger.info("[DepartureIterative] 사후 평가: %s", post_metrics)

                # 4. 버전 저장
                self._save_versioned_model(i)

                # 5. 시그널 분석 및 가중치 조정
                signals = self.adjuster.analyze(post_metrics)

                # Plateau 감지
                if "high_prohibitive" in signals:
                    if self.adjuster.check_plateau(
                            [dataclasses.asdict(r) for r in self.history],
                            field="prohibitive_rate"):
                        logger.info("[DepartureIterative] Plateau 감지: prohibitive 시그널 조정")
                        signals = [s for s in signals if s != "high_prohibitive"]
                        d = dataclasses.asdict(current_weights)
                        d["prohibitive_penalty"] *= 1.15
                        current_weights = _apply_bounds(DepartureRewardWeights(**d))
                        next_weights = current_weights
                    else:
                        next_weights = self.adjuster.adjust(current_weights, signals)
                else:
                    next_weights = self.adjuster.adjust(current_weights, signals)

                converged = self._converged(
                    post_metrics, target_success_rate, target_prohibitive_rate)
                elapsed = time.time() - iter_start

                record = DepartureIterationRecord(
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

                logger.info(
                    "[DepartureIterative] 반복 %d 완료 | "
                    "success=%.3f | prohibitive=%.3f | signals=%s | converged=%s",
                    i, post_metrics.get("success_rate", 0),
                    post_metrics.get("prohibitive_rate", 0),
                    signals, converged)

                if converged:
                    logger.info("[DepartureIterative] 수렴 조건 달성 — 학습 종료")
                    break

                current_weights = next_weights
                self.current_weights = current_weights

        finally:
            # 반복 학습 중단/완료/예외 모든 케이스에서 모델 및 히스토리 저장
            if self._agent is not None and self._agent.model is not None:
                try:
                    self._agent.save()
                    logger.info("[DepartureIterative] 중단 시점 모델 자동 저장 완료")
                except Exception as e:
                    logger.error("[DepartureIterative] 모델 저장 실패: %s", e)
            if self.history:
                try:
                    self._save_history()
                    logger.info("[DepartureIterative] 중단 시점 히스토리 자동 저장 완료")
                except Exception as e:
                    logger.error("[DepartureIterative] 히스토리 저장 실패: %s", e)
            self.is_running = False
            self.current_iteration = 0

        final_metrics = self.history[-1].post_metrics if self.history else {}
        return {
            "iterations_completed": len(self.history),
            "converged": self.history[-1].converged if self.history else False,
            "final_metrics": final_metrics,
            "final_weights": dataclasses.asdict(self.current_weights or DepartureRewardWeights()),
            "history_path": str(self.history_path),
        }

    def _run_curriculum_with_agent(self, monthly_ice, weather_data, route_scorer,
                                   ice_class, forecast_days, transit_days,
                                   base_timesteps, reward_weights):
        """self._agent를 유지하며 3단계 커리큘럼 학습."""
        from modules.rl.departure_env import DepartureSchedulingEnv
        import time as _time

        stages = [
            {"difficulty": "easy",   "timesteps": int(base_timesteps * 0.5)},
            {"difficulty": "medium", "timesteps": base_timesteps},
            {"difficulty": "hard",   "timesteps": base_timesteps},
        ]

        for stage in stages:
            if self.stop_requested:
                break
            env = DepartureSchedulingEnv(
                monthly_ice=monthly_ice,
                weather_data=weather_data,
                route_scorer=route_scorer,
                ice_class=ice_class,
                forecast_days=forecast_days,
                transit_days=transit_days,
                start_date=date.today(),
                difficulty=stage["difficulty"],
                reward_weights=reward_weights,
            )
            try:
                self._agent.train(env, timesteps=stage["timesteps"])
            except Exception as e:
                logger.error("[DepartureIterative] 스테이지 %s 실패: %s",
                             stage["difficulty"], e, exc_info=True)
            finally:
                env.close()

    def stop(self):
        self.stop_requested = True
        self.departure_trainer.stop_requested = True

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
