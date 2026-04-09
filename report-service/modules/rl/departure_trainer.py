"""
departure_trainer.py — (A) 커리큘럼 학습 오케스트레이터
=====================================================
3단계 커리큘럼으로 출항 스케줄링 RL을 학습한다.

| 단계   | 조건              | 스텝  |
|--------|-------------------|-------|
| Easy   | 하절기(6-9월)     | 50K   |
| Medium | 춘추(4,5,10,11월) | 100K  |
| Hard   | 동절기(11-3월)    | 100K  |
"""

import logging
import time
from datetime import date

logger = logging.getLogger("report-service.rl.departure_trainer")

CURRICULUM = [
    {"difficulty": "easy", "timesteps": 50_000},
    {"difficulty": "medium", "timesteps": 100_000},
    {"difficulty": "hard", "timesteps": 100_000},
]


class DepartureTrainer:
    """출항 RL 커리큘럼 학습 관리자."""

    def __init__(self):
        self.is_training = False
        self.current_stage = ""
        self.progress = 0  # 0~100
        self.total_timesteps_done = 0
        self.total_timesteps_target = sum(c["timesteps"] for c in CURRICULUM)
        self.training_history = []
        self.start_time = None

    def train_curriculum(
        self,
        monthly_ice: dict,
        weather_data: dict,
        route_scorer,
        ice_class: str = "PC5",
        forecast_days: int = 30,
        transit_days: int = 14,
    ):
        """3단계 커리큘럼 학습 실행."""
        from modules.rl.departure_env import DepartureSchedulingEnv
        from modules.rl.departure_agent import DepartureAgent

        self.is_training = True
        self.progress = 0
        self.total_timesteps_done = 0
        self.start_time = time.time()

        agent = DepartureAgent()

        for i, stage in enumerate(CURRICULUM):
            self.current_stage = f"{stage['difficulty']} ({i+1}/{len(CURRICULUM)})"
            logger.info("커리큘럼 단계 시작: %s", self.current_stage)

            env = DepartureSchedulingEnv(
                monthly_ice=monthly_ice,
                weather_data=weather_data,
                route_scorer=route_scorer,
                ice_class=ice_class,
                forecast_days=forecast_days,
                transit_days=transit_days,
                start_date=date.today(),
                difficulty=stage["difficulty"],
            )

            try:
                agent.train(env, timesteps=stage["timesteps"])
                self.total_timesteps_done += stage["timesteps"]
                self.progress = int(
                    self.total_timesteps_done / self.total_timesteps_target * 100
                )
                self.training_history.append({
                    "stage": stage["difficulty"],
                    "timesteps": stage["timesteps"],
                    "completed": True,
                })
            except Exception as e:
                logger.error("학습 실패 (단계 %s): %s", stage["difficulty"], e)
                self.training_history.append({
                    "stage": stage["difficulty"],
                    "timesteps": stage["timesteps"],
                    "completed": False,
                    "error": str(e),
                })
            finally:
                env.close()

        self.is_training = False
        self.progress = 100
        elapsed = time.time() - self.start_time
        logger.info("커리큘럼 학습 완료 (%.1f초)", elapsed)

    def train_single(
        self,
        difficulty: str,
        timesteps: int,
        monthly_ice: dict,
        weather_data: dict,
        route_scorer,
        ice_class: str = "PC5",
    ):
        """단일 난이도 학습."""
        from modules.rl.departure_env import DepartureSchedulingEnv
        from modules.rl.departure_agent import DepartureAgent

        self.is_training = True
        self.current_stage = difficulty
        self.progress = 0

        env = DepartureSchedulingEnv(
            monthly_ice=monthly_ice,
            weather_data=weather_data,
            route_scorer=route_scorer,
            ice_class=ice_class,
            difficulty=difficulty,
        )

        try:
            agent = DepartureAgent()
            agent.train(env, timesteps=timesteps)
            self.progress = 100
        except Exception as e:
            logger.error("단일 학습 실패: %s", e)
        finally:
            env.close()
            self.is_training = False

    def get_status(self) -> dict:
        """학습 상태 조회."""
        elapsed = time.time() - self.start_time if self.start_time else 0
        return {
            "is_training": self.is_training,
            "current_stage": self.current_stage,
            "progress": self.progress,
            "total_timesteps_done": self.total_timesteps_done,
            "total_timesteps_target": self.total_timesteps_target,
            "elapsed_seconds": round(elapsed, 1),
            "history": self.training_history,
        }
