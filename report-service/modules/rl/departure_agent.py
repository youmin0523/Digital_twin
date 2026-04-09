"""
departure_agent.py — (A) SAC 에이전트 래퍼
==========================================
Stable-Baselines3 SAC를 사용한 출항 스케줄링 에이전트.
"""

import logging
from pathlib import Path

logger = logging.getLogger("report-service.rl.departure_agent")

MODEL_DIR = Path(__file__).resolve().parents[1] / ".." / "data" / "departure_rl_model"


class DepartureAgent:
    """출항 스케줄링 SAC 에이전트."""

    def __init__(self):
        self.model = None
        self.model_path = MODEL_DIR / "departure_sac"
        self.is_trained = False
        self._try_load()

    def _try_load(self):
        """기존 학습 모델 로드 시도."""
        zip_path = self.model_path.with_suffix(".zip")
        if zip_path.exists():
            try:
                from stable_baselines3 import SAC
                self.model = SAC.load(str(self.model_path))
                self.is_trained = True
                logger.info("출항 RL 모델 로드 완료: %s", zip_path)
            except Exception as e:
                logger.warning("출항 RL 모델 로드 실패: %s", e)

    def create_model(self, env):
        """새 SAC 모델 생성."""
        from stable_baselines3 import SAC
        self.model = SAC(
            "MlpPolicy",
            env,
            learning_rate=3e-4,
            buffer_size=50000,
            batch_size=256,
            gamma=0.99,
            tau=0.005,
            verbose=0,
        )
        return self.model

    def train(self, env, timesteps: int = 100_000, callback=None):
        """학습 실행."""
        if self.model is None:
            self.create_model(env)
        else:
            self.model.set_env(env)
        self.model.learn(total_timesteps=timesteps, callback=callback)
        self.save()
        self.is_trained = True

    def save(self):
        """모델 저장."""
        MODEL_DIR.mkdir(parents=True, exist_ok=True)
        self.model.save(str(self.model_path))
        logger.info("출항 RL 모델 저장: %s", self.model_path)

    def predict(self, obs):
        """추론."""
        if self.model is None:
            return None, None
        action, state = self.model.predict(obs, deterministic=True)
        return action, state

    def get_metadata(self) -> dict:
        """모델 메타데이터."""
        zip_path = self.model_path.with_suffix(".zip")
        return {
            "model_exists": zip_path.exists(),
            "model_path": str(zip_path),
            "is_trained": self.is_trained,
        }
