"""
RL Iceberg Avoidance Pipeline -- FastAPI Server

Run: uvicorn server:app --reload --port 8001
(포트 8001: 기존 백엔드 8000과 충돌 방지)
"""
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import List
import logging

from modules.rl_trainer import RLTrainer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("rl-pipeline")

app = FastAPI(
    title="RL Iceberg Avoidance Pipeline",
    description="빙산 회피 강화학습 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── RL 트레이너 초기화 ────────────────────────────────────
rl_trainer = RLTrainer()


# ── Request Models ────────────────────────────────────────
class RLInferRequest(BaseModel):
    ship_state: dict        # {lon, lat, heading, speed_knots, ice_class, progress}
    icebergs: List[dict]    # [{lat, lon, length_m}, ...]
    ice_data: dict          # {concentration: float}
    weather: dict           # {visibility_km, wave_height_m}


class RLTrainRequest(BaseModel):
    difficulty: str = "medium"
    timesteps: int = 100_000
    curriculum: bool = False


# ── Endpoints ─────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "RL Iceberg Avoidance Pipeline", "docs": "/docs"}


@app.get("/api/rl/health")
async def health():
    return {"status": "ok", "model_loaded": rl_trainer.agent.model is not None}


@app.post("/api/rl/infer")
async def rl_infer(req: RLInferRequest):
    """RL 실시간 추론 — 선박 상태와 빙산 정보를 받아 회피 행동 반환"""
    try:
        result = rl_trainer.infer(
            ship_state=req.ship_state,
            icebergs=req.icebergs,
            ice_data=req.ice_data,
            weather=req.weather,
        )
        return result
    except Exception as e:
        logger.error(f"[RL] 추론 실패: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e), "fallback": True})


@app.post("/api/rl/train")
async def rl_train(req: RLTrainRequest, bg: BackgroundTasks):
    """RL 학습 시작 (비동기)"""
    logger.info(f"[API] RL 학습 요청: {req}")
    try:
        if rl_trainer.is_training:
            return JSONResponse(status_code=409, content={"error": "이미 학습이 진행 중입니다."})

        if req.curriculum:
            bg.add_task(rl_trainer.train_curriculum)
        else:
            bg.add_task(rl_trainer.train_single, req.difficulty, req.timesteps)

        return {"message": "학습 시작", "curriculum": req.curriculum,
                "difficulty": req.difficulty, "timesteps": req.timesteps}
    except Exception as e:
        logger.error(f"[API] 학습 시작 실패: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/api/rl/status")
async def rl_status():
    """학습 상태 및 메트릭 조회"""
    return rl_trainer.get_status()


@app.post("/api/rl/stop")
async def rl_stop():
    """진행 중인 학습 중단 요청"""
    if not rl_trainer.is_training:
        return JSONResponse(status_code=400, content={"error": "학습 중이 아닙니다."})
    rl_trainer.stop_requested = True
    return {"message": "학습 중단 요청됨"}


@app.post("/api/rl/evaluate")
async def rl_evaluate(n_episodes: int = 100, difficulty: str = "medium"):
    """학습된 모델 평가"""
    return rl_trainer.evaluate(n_episodes=n_episodes, difficulty=difficulty)
