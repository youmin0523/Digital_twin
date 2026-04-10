"""
rl_multi_model_trainer.py — 항로 × 빙급 × 선종 다중 모델 병렬 반복 학습

반복학습 시작 버튼 하나로 정의된 모든 (route, ice_class, ship_type) 조합을
ThreadPoolExecutor로 동시에 학습합니다.
"""
from __future__ import annotations

import logging
import threading
from concurrent.futures import ThreadPoolExecutor, Future
from dataclasses import dataclass
from typing import Optional

from .rl_ship_dynamics import ShipParams

logger = logging.getLogger(__name__)

# ── 지원 항로 ────────────────────────────────────────────────
ROUTES: list[str] = ["NSR", "NWP", "TSR"]

# ── 지원 빙급 ────────────────────────────────────────────────
ICE_CLASSES: list[str] = ["PC7", "PC6", "PC5", "PC4", "PC3", "IA Super", "IA"]

# ── 선종 정의 ─────────────────────────────────────────────────
#   max_speed_knots : 해당 선종의 최대 속력
#   ice_drag_factor : 해빙 농도 1.0일 때 속도 감소 비율
SHIP_TYPES: dict[str, dict] = {
    "bulk":      {"label": "벌크선",     "max_speed_knots": 12.0, "ice_drag_factor": 0.50},
    "tanker":    {"label": "탱커",       "max_speed_knots": 14.0, "ice_drag_factor": 0.45},
    "container": {"label": "컨테이너선", "max_speed_knots": 18.0, "ice_drag_factor": 0.35},
    "lng":       {"label": "LNG선",      "max_speed_knots": 16.0, "ice_drag_factor": 0.40},
}

# ── 전체 조합 ─────────────────────────────────────────────────
ALL_COMBINATIONS: list[tuple[str, str, str]] = [
    (r, ic, st)
    for r in ROUTES
    for ic in ICE_CLASSES
    for st in SHIP_TYPES
]


def _combo_key(route: str, ice_class: str, ship_type: str) -> str:
    return f"{route}_{ice_class}_{ship_type}".replace(" ", "_")


def _make_ship_params(ship_type: str) -> ShipParams:
    cfg = SHIP_TYPES[ship_type]
    return ShipParams(
        max_speed_knots=cfg["max_speed_knots"],
        ice_drag_factor=cfg["ice_drag_factor"],
    )


# ── 개별 모델 상태 ────────────────────────────────────────────
@dataclass
class ModelStatus:
    route: str
    ice_class: str
    ship_type: str
    label: str
    is_running: bool = False
    current_iteration: int = 0
    latest_metrics: dict = None
    converged: bool = False
    error: Optional[str] = None

    def __post_init__(self):
        if self.latest_metrics is None:
            self.latest_metrics = {}

    def to_dict(self) -> dict:
        return {
            "route": self.route,
            "ice_class": self.ice_class,
            "ship_type": self.ship_type,
            "ship_label": SHIP_TYPES[self.ship_type]["label"],
            "label": self.label,
            "is_running": self.is_running,
            "current_iteration": self.current_iteration,
            "latest_metrics": self.latest_metrics,
            "converged": self.converged,
            "error": self.error,
        }


# ── 다중 모델 트레이너 ─────────────────────────────────────────
class RLMultiModelTrainer:
    """
    모든 (route, ice_class, ship_type) 조합을 ThreadPoolExecutor로 동시 학습.
    각 조합은 독립된 IcebergAvoidanceAgent + IterativeTrainer를 사용합니다.
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._statuses: dict[str, ModelStatus] = {}
        self._futures: dict[str, Future] = {}
        self._trainers: dict[str, object] = {}
        self._executor: Optional[ThreadPoolExecutor] = None
        self.is_running = False
        self.stop_requested = False

    # ── 학습 시작 ─────────────────────────────────────────────
    def start(self,
              max_iterations: int = 10,
              target_success_rate: float = 0.85,
              target_collision_rate: float = 0.05,
              eval_episodes: int = 100,
              eval_difficulty: str = "hard",
              base_timesteps: int = 500_000) -> None:
        """ALL_COMBINATIONS 전체를 동시에 학습 시작."""
        if self.is_running:
            raise RuntimeError("이미 다중 모델 학습이 진행 중입니다.")

        self.stop_requested = False
        self.is_running = True

        with self._lock:
            self._statuses.clear()
            self._futures.clear()
            self._trainers.clear()
            for r, ic, st in ALL_COMBINATIONS:
                key = _combo_key(r, ic, st)
                self._statuses[key] = ModelStatus(
                    route=r, ice_class=ic, ship_type=st,
                    label=f"{r} / {ic} / {SHIP_TYPES[st]['label']}",
                )

        n = len(ALL_COMBINATIONS)
        self._executor = ThreadPoolExecutor(max_workers=n, thread_name_prefix="rl_multi")
        logger.info("[RLMultiModel] 학습 시작: %d개 조합", n)

        for r, ic, st in ALL_COMBINATIONS:
            key = _combo_key(r, ic, st)
            future = self._executor.submit(
                self._train_one,
                route=r, ice_class=ic, ship_type=st,
                max_iterations=max_iterations,
                target_success_rate=target_success_rate,
                target_collision_rate=target_collision_rate,
                eval_episodes=eval_episodes,
                eval_difficulty=eval_difficulty,
                base_timesteps=base_timesteps,
            )
            with self._lock:
                self._futures[key] = future

        threading.Thread(target=self._watch_all, daemon=True).start()

    # ── 개별 조합 학습 ────────────────────────────────────────
    def _train_one(self, route: str, ice_class: str, ship_type: str,
                   max_iterations: int, target_success_rate: float,
                   target_collision_rate: float, eval_episodes: int,
                   eval_difficulty: str, base_timesteps: int) -> None:
        from .rl_trainer import RLTrainer
        from .rl_iterative_trainer import IterativeTrainer

        key = _combo_key(route, ice_class, ship_type)
        ship_params = _make_ship_params(ship_type)

        with self._lock:
            self._statuses[key].is_running = True

        logger.info("[RLMultiModel] 시작: %s", key)

        base_trainer = RLTrainer(
            model_key=key,
            fixed_route=route,
            fixed_ice_class=ice_class,
            ship_params=ship_params,
        )
        iterative_trainer = IterativeTrainer(
            base_trainer=base_trainer,
            route=route,
            ice_class=ice_class,
            ship_type=ship_type,
        )

        with self._lock:
            self._trainers[key] = iterative_trainer

        # 진행 상황 실시간 반영
        original_save = iterative_trainer._save_history

        def _patched_save():
            original_save()
            with self._lock:
                st = self._statuses.get(key)
                if st and iterative_trainer.history:
                    last = iterative_trainer.history[-1]
                    st.current_iteration = last.iteration
                    st.latest_metrics = last.post_metrics
                    st.converged = last.converged

        iterative_trainer._save_history = _patched_save

        try:
            iterative_trainer.run(
                max_iterations=max_iterations,
                target_success_rate=target_success_rate,
                target_collision_rate=target_collision_rate,
                eval_episodes=eval_episodes,
                eval_difficulty=eval_difficulty,
                base_timesteps=base_timesteps,
            )
        except Exception as e:
            logger.error("[RLMultiModel] 오류 (%s): %s", key, e, exc_info=True)
            with self._lock:
                if key in self._statuses:
                    self._statuses[key].error = str(e)
        finally:
            with self._lock:
                if key in self._statuses:
                    self._statuses[key].is_running = False
            logger.info("[RLMultiModel] 완료: %s", key)

    # ── 전체 완료 감시 ────────────────────────────────────────
    def _watch_all(self):
        if self._executor:
            self._executor.shutdown(wait=True)
        self.is_running = False
        logger.info("[RLMultiModel] 전체 학습 완료")

    # ── 중단 ─────────────────────────────────────────────────
    def stop(self) -> None:
        self.stop_requested = True
        with self._lock:
            for trainer in self._trainers.values():
                try:
                    trainer.stop()
                except Exception:
                    pass
        logger.info("[RLMultiModel] 중단 요청 전파 완료")

    # ── 상태 조회 ─────────────────────────────────────────────
    def get_status(self) -> dict:
        with self._lock:
            models = {k: v.to_dict() for k, v in self._statuses.items()}
            running_count  = sum(1 for v in self._statuses.values() if v.is_running)
            converged_count = sum(1 for v in self._statuses.values() if v.converged)

        return {
            "is_running": self.is_running,
            "total_models": len(ALL_COMBINATIONS),
            "running_models": running_count,
            "converged_models": converged_count,
            "routes": ROUTES,
            "ice_classes": ICE_CLASSES,
            "ship_types": {k: v["label"] for k, v in SHIP_TYPES.items()},
            "models": models,
        }
