"""
sar_server.py — SAR YOLOv8 빙산 탐지 전용 서버 (포트 8003)

RL 서버(8001, 8002)와 완전히 분리된 프로세스로 실행.
SAR 학습이 이벤트루프를 오래 점유하더라도 RL 서버에 영향 없음.

Run: python sar_server.py
"""
import logging
import sys
from pathlib import Path

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# backend pipeline trainers 경로 추가
_BASE = Path(__file__).parent
_PIPELINE_TRAINERS = _BASE / "backend" / "pipeline" / "trainers"
if str(_PIPELINE_TRAINERS) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_TRAINERS))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sar-server")

app = FastAPI(
    title="SAR Iceberg Detection Training Server",
    description="YOLOv8 빙산 탐지 모델 학습 전용 서버 (포트 8003)",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 상태 ──────────────────────────────────────────────────────
_state: dict = {
    "is_training": False,
    "progress": 0,
    "stage": "대기 중",
    "result": None,
    "error": None,
    "started_at": None,
}


class SarTrainRequest(BaseModel):
    epochs: int = 30
    batch_size: int = 4
    synthetic_count: int = 200
    device: str = "cpu"


# ── 동기 학습 함수 (스레드에서 실행) ─────────────────────────
def _train_sync(req: SarTrainRequest) -> None:
    from datetime import datetime
    _state.update(
        is_training=True, progress=0,
        stage="데이터셋 생성 중...", result=None, error=None,
        started_at=datetime.now().isoformat(),
    )
    try:
        logger.info("SAR 학습 시작: epochs=%d, synthetic=%d", req.epochs, req.synthetic_count)

        # 1. 합성 데이터셋 생성
        from sar_dataset_builder import build_dataset
        _state["progress"] = 5
        yaml_path = build_dataset(synthetic_count=req.synthetic_count)
        _state.update(progress=30, stage=f"YOLOv8 학습 중 ({req.epochs} epoch)...")
        logger.info("데이터셋 생성 완료: %s", yaml_path)

        # 2. YOLOv8 학습
        from iceberg_model_trainer import IcebergModelTrainer
        trainer = IcebergModelTrainer(
            dataset_yaml=yaml_path,
            epochs=req.epochs,
            batch_size=req.batch_size,
            device=req.device,
        )
        result = trainer.train()
        _state.update(progress=100, stage="완료", result=result)
        logger.info("SAR 학습 완료: %s", result.get("weights_path", "N/A"))

    except Exception as e:
        logger.error("SAR 학습 실패: %s", e, exc_info=True)
        _state.update(error=str(e), stage="실패")
    finally:
        _state["is_training"] = False


# ── 엔드포인트 ────────────────────────────────────────────────
@app.get("/")
async def health():
    return {"service": "SAR Training Server", "port": 8003, "is_training": _state["is_training"]}


@app.post("/api/sar/train")
async def start_training(req: SarTrainRequest, bg: BackgroundTasks):
    if _state["is_training"]:
        return JSONResponse(status_code=409, content={"error": "이미 SAR 학습 진행 중"})
    # BackgroundTasks로 스레드 실행 — asyncio.get_event_loop() 불필요
    # run_in_executor는 Future를 반환해 BackgroundTasks와 호환 안 됨
    bg.add_task(_train_sync, req)
    return {
        "message": "SAR YOLOv8 학습 시작",
        "epochs": req.epochs,
        "synthetic_count": req.synthetic_count,
        "device": req.device,
    }


@app.get("/api/sar/status")
async def get_status():
    return _state


@app.get("/api/sar/model-info")
async def model_info():
    meta_path = _BASE / "backend" / "pipeline" / "models" / "iceberg_yolov8_meta.json"
    if not meta_path.exists():
        return JSONResponse(status_code=404, content={"error": "모델 메타데이터 없음"})
    import json
    return json.loads(meta_path.read_text(encoding="utf-8"))


# ── 실행 ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003, log_level="info")
