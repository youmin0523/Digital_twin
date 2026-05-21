"""
departure_agent.py — (A) SAC 에이전트 래퍼
==========================================
Stable-Baselines3 SAC를 사용한 출항 스케줄링 에이전트.
"""

import logging
from pathlib import Path

logger = logging.getLogger("report-service.rl.departure_agent")

MODEL_DIR = Path(__file__).resolve().parents[1] / ".." / "data" / "departure_rl_model"


class _StopTraining(Exception):
    """중단 요청 시 model.learn()을 강제 종료하는 sentinel 예외."""
    pass


def _make_model_key(ice_class: str, ship_type: str) -> str:
    """(ice_class, ship_type) → 파일명용 키 (공백·특수문자 제거)."""
    return f"{ice_class}_{ship_type}".replace(" ", "_").replace("/", "_")


class DepartureAgent:
    """출항 스케줄링 SAC 에이전트.

    ice_class / ship_type 조합마다 별도 모델 파일을 사용합니다.
    기본값(ice_class="PC5", ship_type="default")은 기존 경로와 호환됩니다.
    """

    def __init__(self, ice_class: str = "PC5", ship_type: str = "default"):
        self.ice_class = ice_class
        self.ship_type = ship_type
        self.model_key = _make_model_key(ice_class, ship_type)

        # 기존 단일 모델과 호환: default 키는 departure_sac 그대로 사용
        if ship_type == "default" and ice_class == "PC5":
            self.model_path = MODEL_DIR / "departure_sac"
        else:
            self.model_path = MODEL_DIR / f"departure_sac_{self.model_key}"

        self.model = None
        self.is_trained = False
        self._model_version = self._detect_version()
        self._try_load()

    def _detect_version(self) -> int:
        """이 모델 키에 해당하는 버전 파일에서 최대 버전 번호 감지."""
        prefix = self.model_path.stem  # e.g. departure_sac_PC5_bulk
        versions = sorted(MODEL_DIR.glob(f"{prefix}_v*.zip"))
        if not versions:
            return 0
        try:
            return max(int(p.stem.split("_v")[-1]) for p in versions)
        except (ValueError, IndexError):
            return len(versions)

    def _cleanup_checkpoints(self, keep: int = 3):
        """오래된 체크포인트 삭제 — 최근 keep개만 유지."""
        ckpt_dir = MODEL_DIR / "checkpoints"
        if not ckpt_dir.exists():
            return
        ckpts = sorted(ckpt_dir.glob("departure_ckpt_*.zip"))
        for old in ckpts[:-keep]:
            try:
                old.unlink()
            except Exception:
                pass

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

        try:
            from stable_baselines3.common.callbacks import CheckpointCallback, CallbackList
            checkpoint_cb = CheckpointCallback(
                save_freq=5_000,
                save_path=str(MODEL_DIR / "checkpoints"),
                name_prefix="departure_ckpt",
                verbose=0,
            )
            cb = CallbackList([checkpoint_cb, callback]) if callback else checkpoint_cb
            self.model.learn(total_timesteps=timesteps, callback=cb)
        except _StopTraining:
            logger.info("출항 RL 중단 요청으로 학습 종료")
        finally:
            # 정상 완료, 중단, 서버 종료 모든 케이스에서 저장
            self.save()
            self.is_trained = True
            self._cleanup_checkpoints(keep=3)
            logger.info("출항 RL 모델 자동 저장 완료")

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
            "ice_class": self.ice_class,
            "ship_type": self.ship_type,
            "model_key": self.model_key,
        }
