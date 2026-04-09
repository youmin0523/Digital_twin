"""
rl_agent.py -- SAC 에이전트 설정 및 추론

stable-baselines3의 SAC 알고리즘을 래핑하여
빙산 회피 모델의 학습/추론/저장/로드를 관리합니다.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import numpy as np

try:
    from stable_baselines3 import SAC
    from stable_baselines3.common.callbacks import BaseCallback
    HAS_SB3 = True
except ImportError:
    HAS_SB3 = False
    SAC = None

    # SB3 미설치 시 더미 BaseCallback (서버 기동용)
    class BaseCallback:
        def __init__(self, verbose=0): pass
        def _on_step(self): return True

from gymnasium.wrappers import RecordEpisodeStatistics
from .rl_environment import IcebergAvoidanceEnv

logger = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "sac_iceberg"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_HYPERPARAMS = {
    "learning_rate": 3e-4,
    "buffer_size": 500_000,
    "batch_size": 256,
    "gamma": 0.99,
    "tau": 0.005,
    "ent_coef": "auto",
    "train_freq": 1,
    "gradient_steps": 1,
    "learning_starts": 10_000,
    "policy_kwargs": {
        "net_arch": [256, 256],
    },
}


class TrainingMetricsCallback(BaseCallback):
    """학습 중 메트릭 수집 콜백"""

    def __init__(self, log_interval: int = 1000, verbose: int = 0):
        super().__init__(verbose)
        self.log_interval = log_interval
        self.episode_rewards = []
        self.episode_lengths = []
        self.collision_count = 0
        self.success_count = 0
        self.total_episodes = 0
        self.metrics_history = []

    def _on_step(self) -> bool:
        infos = self.locals.get("infos", [])
        for info in infos:
            if "episode" in info:
                self.total_episodes += 1
                self.episode_rewards.append(info["episode"]["r"])
                self.episode_lengths.append(info["episode"]["l"])
            if info.get("collision", False):
                self.collision_count += 1
            if info.get("success", False):
                self.success_count += 1

        if self.num_timesteps % self.log_interval == 0 and self.total_episodes > 0:
            recent_rewards = self.episode_rewards[-100:]
            metrics = {
                "timestep": self.num_timesteps,
                "episodes": self.total_episodes,
                "mean_reward_100": float(np.mean(recent_rewards)) if recent_rewards else 0,
                "collision_rate": self.collision_count / max(1, self.total_episodes),
                "success_rate": self.success_count / max(1, self.total_episodes),
            }
            self.metrics_history.append(metrics)
            logger.info(
                f"[RL] Step {self.num_timesteps}: "
                f"reward={metrics['mean_reward_100']:.2f}, "
                f"collision={metrics['collision_rate']:.3f}, "
                f"success={metrics['success_rate']:.3f}"
            )
        return True

    def get_latest_metrics(self) -> dict:
        if self.metrics_history:
            return self.metrics_history[-1]
        return {"timestep": 0, "episodes": 0, "mean_reward_100": 0,
                "collision_rate": 0, "success_rate": 0}


class IcebergAvoidanceAgent:
    """빙산 회피 SAC 에이전트"""

    def __init__(self, hyperparams: dict | None = None):
        self.hyperparams = {**DEFAULT_HYPERPARAMS, **(hyperparams or {})}
        self.model: Optional[SAC] = None
        self.env: Optional[IcebergAvoidanceEnv] = None
        self.callback = TrainingMetricsCallback()
        self._model_version = 0

    def create_env(self, difficulty: str = "medium"):
        raw_env = IcebergAvoidanceEnv(difficulty=difficulty)
        self.env = RecordEpisodeStatistics(raw_env)
        return self.env

    def build_model(self, difficulty: str = "medium"):
        if not HAS_SB3:
            raise ImportError(
                "stable-baselines3가 설치되지 않았습니다. "
                "pip install stable-baselines3[extra] torch 를 실행하세요."
            )
        if self.env is None:
            self.create_env(difficulty)

        self.model = SAC(
            "MlpPolicy",
            self.env,
            learning_rate=self.hyperparams["learning_rate"],
            buffer_size=self.hyperparams["buffer_size"],
            batch_size=self.hyperparams["batch_size"],
            gamma=self.hyperparams["gamma"],
            tau=self.hyperparams["tau"],
            ent_coef=self.hyperparams["ent_coef"],
            train_freq=self.hyperparams["train_freq"],
            gradient_steps=self.hyperparams["gradient_steps"],
            learning_starts=self.hyperparams["learning_starts"],
            policy_kwargs=self.hyperparams["policy_kwargs"],
            verbose=1,
        )
        logger.info("[RL] SAC 모델 생성 완료")
        return self.model

    def train(self, total_timesteps: int = 500_000, extra_callback=None) -> dict:
        if self.model is None:
            self.build_model()

        self.callback = TrainingMetricsCallback(log_interval=5000)
        logger.info(f"[RL] 학습 시작: {total_timesteps} 스텝")

        from stable_baselines3.common.callbacks import CallbackList
        callbacks = CallbackList([self.callback, extra_callback]) if extra_callback else self.callback

        self.model.learn(
            total_timesteps=total_timesteps,
            callback=callbacks,
            progress_bar=False,
        )

        self._model_version += 1
        self.save()

        metrics = self.callback.get_latest_metrics()
        logger.info(f"[RL] 학습 완료: {metrics}")
        return metrics

    def predict(self, obs: np.ndarray, deterministic: bool = True) -> tuple[np.ndarray, float]:
        if self.model is None:
            raise RuntimeError("모델이 로드되지 않았습니다.")

        action, _states = self.model.predict(obs, deterministic=deterministic)

        try:
            import torch
            obs_tensor = self.model.policy.obs_to_tensor(obs.reshape(1, -1))[0]
            with torch.no_grad():
                q_values = self.model.critic(
                    obs_tensor,
                    torch.tensor(action.reshape(1, -1), dtype=torch.float32),
                )
                value_estimate = float(min(q.item() for q in q_values))
        except Exception:
            value_estimate = 0.0

        return action, value_estimate

    def predict_sequence(
        self,
        initial_obs: np.ndarray,
        env: IcebergAvoidanceEnv,
        n_steps: int = 20,
        deterministic: bool = True,
    ) -> list[dict]:
        if self.model is None:
            raise RuntimeError("모델이 로드되지 않았습니다.")

        sequence = []
        obs = initial_obs.copy()

        for _ in range(n_steps):
            action, value = self.predict(obs, deterministic=deterministic)
            obs, reward, terminated, truncated, info = env.step(action)

            state = env.get_ship_state()
            sequence.append({
                "lon": state["lon"],
                "lat": state["lat"],
                "heading": state["heading"],
                "speed_knots": state["speed_knots"],
                "action": action.tolist(),
                "value": value,
                "reward": float(reward),
            })

            if terminated or truncated:
                break

        return sequence

    def save(self, path: str | None = None):
        if self.model is None:
            return
        save_path = path or str(MODEL_DIR / f"sac_v{self._model_version}")
        self.model.save(save_path)

        meta = {
            "version": self._model_version,
            "hyperparams": {k: str(v) for k, v in self.hyperparams.items()},
            "metrics": self.callback.get_latest_metrics(),
        }
        with open(f"{save_path}_meta.json", "w") as f:
            json.dump(meta, f, indent=2)

        logger.info(f"[RL] 모델 저장: {save_path}")

    def load(self, path: str | None = None) -> bool:
        if path:
            load_path = path
        else:
            versions = sorted(MODEL_DIR.glob("sac_v*.zip"))
            if not versions:
                logger.warning("[RL] 저장된 모델 없음")
                return False
            load_path = str(versions[-1]).replace(".zip", "")

        try:
            if self.env is None:
                self.create_env()
            self.model = SAC.load(load_path, env=self.env)
            logger.info(f"[RL] 모델 로드: {load_path}")
            return True
        except Exception as e:
            logger.error(f"[RL] 모델 로드 실패: {e}")
            return False

    def get_training_status(self) -> dict:
        return {
            "model_loaded": self.model is not None,
            "version": self._model_version,
            "metrics": self.callback.get_latest_metrics(),
            "metrics_history": self.callback.metrics_history[-50:],
        }
