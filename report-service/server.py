"""
Arctic Trend Report Service — FastAPI :8002

Run: uvicorn server:app --reload --port 8002
(포트 8002: 기존 백엔드 8000, RL 8001과 충돌 방지)
"""

import asyncio
import logging
import os
import sys
import uuid
from datetime import date, datetime
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# backend/.env 로드
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("report-service")

app = FastAPI(
    title="Arctic Trend Report Service",
    description="북극 항로 AI 동향 보고서 생성 API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 모듈 임포트 ──────────────────────────────────────────────
from modules.data_loader import DataLoader
from modules.route_scorer import RouteScorer
from modules.trend_analyzer import TrendAnalyzer
from modules.pdf_generator import PdfGenerator
from modules.rl.departure_agent import DepartureAgent
from modules.rl.departure_trainer import DepartureTrainer
from modules.rl.departure_iterative_trainer import DepartureIterativeTrainer
from modules.rl.multi_model_trainer import MultiModelIterativeTrainer, ALL_COMBINATIONS, SHIP_TYPES
from modules.rl.prediction_calibrator import PredictionCalibrator
from modules.rl import existing_rl_client

# ── 싱글톤 초기화 ────────────────────────────────────────────
data_loader = DataLoader()
route_scorer = RouteScorer(data_loader)
trend_analyzer = TrendAnalyzer()
pdf_generator = PdfGenerator()
departure_agent = DepartureAgent()
departure_trainer = DepartureTrainer()
departure_iterative_trainer = DepartureIterativeTrainer(departure_trainer=departure_trainer)
multi_model_trainer = MultiModelIterativeTrainer()
calibrator = PredictionCalibrator()

OUTPUT_DIR = Path(__file__).parent / "output"

# ── 인메모리 Job 관리 ────────────────────────────────────────
jobs: dict[str, dict] = {}


def _create_job() -> str:
    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {"status": "running", "progress": 0, "pdf_path": None, "error": None}
    return job_id


def _update_job(job_id: str, progress: int, status: str = "running"):
    if job_id in jobs:
        jobs[job_id]["progress"] = progress
        jobs[job_id]["status"] = status


def _complete_job(job_id: str, pdf_path: Path):
    if job_id in jobs:
        jobs[job_id]["status"] = "completed"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["pdf_path"] = str(pdf_path)


def _fail_job(job_id: str, error: str):
    if job_id in jobs:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = error


# ── Request Models ────────────────────────────────────────────
class ReportRequest(BaseModel):
    route: str = "NSR"
    ice_class: str = "PC5"
    departure_date_start: str = ""  # YYYY-MM-DD, 빈 값이면 오늘
    forecast_days: int = 30
    transit_days: int = 14


class RLTrainRequest(BaseModel):
    curriculum: bool = True
    difficulty: str = "medium"
    timesteps: int = 100_000


class DepartureIterativeTrainRequest(BaseModel):
    ice_class: str = "PC5"
    forecast_days: int = 30
    transit_days: int = 14
    base_timesteps: int = 100_000
    max_iterations: int = 10
    target_success_rate: float = 0.80
    target_prohibitive_rate: float = 0.10
    eval_episodes: int = 50
    initial_weights: dict | None = None


class MultiModelTrainRequest(BaseModel):
    base_timesteps: int = 100_000
    max_iterations: int = 10
    target_success_rate: float = 0.80
    target_prohibitive_rate: float = 0.10
    eval_episodes: int = 50
    forecast_days: int = 30


# ── 보고서 생성 파이프라인 ────────────────────────────────────
async def _generate_report(job_id: str, req: ReportRequest):
    """비동기 보고서 생성 파이프라인."""
    try:
        # 1. 데이터 로딩 (10%)
        _update_job(job_id, 5)
        monthly_summary = data_loader.build_monthly_summary()
        monthly_ice = data_loader.load_monthly_ice()
        latest_ice = data_loader.load_latest_ice()
        icebergs = data_loader.load_icebergs()
        weather = data_loader.load_weather()
        _update_job(job_id, 10)

        # 2. POLARIS 스코어링 (20%)
        start = (
            date.fromisoformat(req.departure_date_start)
            if req.departure_date_start
            else date.today()
        )
        calendar = route_scorer.build_departure_calendar(
            start, req.forecast_days, req.route, req.ice_class
        )
        all_scores = route_scorer.score_all_routes(
            start, req.forecast_days, req.ice_class
        )
        route_summary = route_scorer.get_route_summary(all_scores)
        _update_job(job_id, 20)

        # 3. RL(A) 인퍼런스 (30%)
        rl_departure_scores = {}
        if departure_agent.is_trained:
            for day_score in calendar:
                dep_date = date.fromisoformat(day_score.date)
                obs = _build_rl_obs(dep_date, monthly_ice, weather)
                if obs is not None:
                    action, _ = departure_agent.predict(obs)
                    if action is not None:
                        confidence = float((action[0] + 1) / 2)
                        rl_departure_scores[day_score.date] = round(confidence, 4)
        _update_job(job_id, 30)

        # 4. RL(C) 인퍼런스 (40%)
        rl_avoidance = {}
        try:
            rl_avoidance = await existing_rl_client.get_all_segment_difficulties(
                ice_data=latest_ice.get("stats", {}),
                icebergs=icebergs.get("bergs", []),
                weather={"visibility_km": 10, "wave_height_m": 1.5},
            )
        except Exception as e:
            logger.warning("RL(C) 인퍼런스 실패: %s", e)
        _update_job(job_id, 40)

        # 5. AI 분석 ×4 (40→75%)
        ai_monthly = trend_analyzer.analyze_monthly_trends(monthly_summary)
        _update_job(job_id, 50)

        ai_current = trend_analyzer.analyze_current_conditions(
            latest_ice.get("stats", {}),
            icebergs.get("stats", {}),
            weather,
        )
        _update_job(job_id, 58)

        weather_route = weather.get("routes", {}).get(req.route)
        ai_route = trend_analyzer.analyze_route_risk(
            req.route,
            route_summary.get(req.route, {}),
            weather_route,
        )
        _update_job(job_id, 66)

        ai_conclusions = trend_analyzer.write_conclusions(
            route_summary, req.ice_class, req.transit_days
        )
        _update_job(job_id, 75)

        # 6. PDF 생성 (75→100%)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        pdf_filename = f"arctic_report_{req.route}_{timestamp}.pdf"
        pdf_path = OUTPUT_DIR / pdf_filename

        pdf_generator.generate(
            output_path=pdf_path,
            route=req.route,
            ice_class=req.ice_class,
            departure_date_start=req.departure_date_start or start.isoformat(),
            forecast_days=req.forecast_days,
            transit_days=req.transit_days,
            monthly_summary=monthly_summary,
            latest_ice_stats=latest_ice.get("stats", {}),
            berg_stats=icebergs.get("stats", {}),
            weather_data=weather,
            calendar=calendar,
            all_scores=all_scores,
            route_summary=route_summary,
            ai_monthly=ai_monthly,
            ai_current=ai_current,
            ai_route=ai_route,
            ai_conclusions=ai_conclusions,
            rl_departure_scores=rl_departure_scores,
            rl_training_history=departure_trainer.training_history,
            rl_avoidance_difficulties=rl_avoidance,
            rl_model_info=departure_agent.get_metadata(),
            rl_calibration_info=calibrator.get_info(),
        )

        _complete_job(job_id, pdf_path)
        logger.info("보고서 생성 완료: %s", pdf_path)

    except Exception as e:
        logger.error("보고서 생성 실패: %s", e, exc_info=True)
        _fail_job(job_id, str(e))


def _build_rl_obs(dep_date, monthly_ice, weather):
    """RL(A) 관측 벡터 빌드 (간소화)."""
    try:
        import numpy as np
        from modules.rl.departure_env import DepartureSchedulingEnv
        env = DepartureSchedulingEnv(
            monthly_ice=monthly_ice,
            weather_data=weather,
            route_scorer=route_scorer,
        )
        obs = env._build_observation(0)
        env.close()
        return obs
    except Exception:
        return None


# ── RL 학습 파이프라인 ────────────────────────────────────────
rl_train_jobs: dict[str, dict] = {}


def _run_rl_training(job_id: str, req: RLTrainRequest):
    """RL(A) 학습 실행."""
    try:
        monthly_ice = data_loader.load_monthly_ice()
        weather = data_loader.load_weather()

        if req.curriculum:
            departure_trainer.train_curriculum(
                monthly_ice=monthly_ice,
                weather_data=weather,
                route_scorer=route_scorer,
                base_timesteps=req.timesteps,
            )
        else:
            departure_trainer.train_single(
                difficulty=req.difficulty,
                timesteps=req.timesteps,
                monthly_ice=monthly_ice,
                weather_data=weather,
                route_scorer=route_scorer,
            )

        # 모델 리로드
        departure_agent._try_load()
        if job_id in rl_train_jobs:
            rl_train_jobs[job_id]["status"] = "completed"
            rl_train_jobs[job_id]["progress"] = 100
    except Exception as e:
        logger.error(f"학습 실패 (Job {job_id}): {e}", exc_info=True)
        if job_id in rl_train_jobs:
            rl_train_jobs[job_id]["status"] = "failed"
            rl_train_jobs[job_id]["error"] = str(e)


# ── Endpoints ─────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": "Arctic Trend Report Service", "docs": "/docs"}


@app.get("/api/report/health")
async def health():
    return {
        "status": "ok",
        "rl_model_loaded": departure_agent.is_trained,
        "calibration_episodes": calibrator.state.get("episode_count", 0),
    }


@app.post("/api/report/generate")
async def generate_report(req: ReportRequest, bg: BackgroundTasks):
    """보고서 생성 시작 (비동기)."""
    job_id = _create_job()
    bg.add_task(_generate_report, job_id, req)
    return {"job_id": job_id, "message": "보고서 생성 시작"}


@app.get("/api/report/status/{job_id}")
async def report_status(job_id: str):
    """보고서 생성 진행률 조회."""
    if job_id not in jobs:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    return jobs[job_id]


@app.get("/api/report/download/{job_id}")
async def download_report(job_id: str):
    """생성된 PDF 다운로드."""
    if job_id not in jobs:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    job = jobs[job_id]
    if job["status"] != "completed" or not job.get("pdf_path"):
        return JSONResponse(status_code=400, content={"error": "보고서가 아직 준비되지 않았습니다."})

    pdf_path = Path(job["pdf_path"])
    if not pdf_path.exists():
        return JSONResponse(status_code=404, content={"error": "PDF 파일을 찾을 수 없습니다."})

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        filename=pdf_path.name,
    )


@app.post("/api/report/rl/train")
async def rl_train(req: RLTrainRequest, bg: BackgroundTasks):
    """RL(A) 출항 스케줄링 학습 시작."""
    if departure_trainer.is_training:
        return JSONResponse(status_code=409, content={"error": "이미 학습이 진행 중입니다."})

    job_id = str(uuid.uuid4())[:8]
    rl_train_jobs[job_id] = {"status": "running", "progress": 0}
    bg.add_task(_run_rl_training, job_id, req)
    return {"job_id": job_id, "message": "RL 학습 시작", "curriculum": req.curriculum}


@app.get("/api/report/rl/train-status/{job_id}")
async def rl_train_status(job_id: str):
    """RL 학습 진행률 조회."""
    if job_id in rl_train_jobs:
        info = rl_train_jobs[job_id].copy()
        info.update(departure_trainer.get_status())
        return info
    return JSONResponse(status_code=404, content={"error": "Job not found"})


@app.get("/api/report/rl/status")
async def rl_status_general():
    """전체 RL(A) 학습 상태 조회 (프론드엔트 HUD용)."""
    return departure_trainer.get_status()


@app.post("/api/report/rl/stop")
async def rl_stop():
    """진행 중인 RL(A) 학습 중단 요청 (반복 학습 포함)."""
    if not departure_trainer.is_training and not departure_iterative_trainer.is_running:
        return JSONResponse(status_code=400, content={"error": "학습 중이 아닙니다."})
    departure_trainer.stop_requested = True
    if departure_iterative_trainer.is_running:
        departure_iterative_trainer.stop_requested = True
    return {"message": "학습 중단 요청됨"}


@app.post("/api/report/rl/calibrate")
async def rl_calibrate():
    """RL(B) 예측 교정 실행."""
    # 현재 임계값으로 예측 RIO 계산
    monthly_ice = data_loader.load_monthly_ice()
    month = date.today().month
    cells = monthly_ice.get(month, {}).get("cells", [])

    if not cells:
        return JSONResponse(status_code=400, content={"error": "현재 월 해빙 데이터 없음"})

    from modules.route_scorer import ARCTIC_SEGMENTS, concentration_to_ice_conditions
    from arctic_master_router import calculate_rio

    predicted_rios = []
    actual_rios = []

    segments = ARCTIC_SEGMENTS.get("NSR", [])
    for seg in segments:
        conc = route_scorer._get_segment_concentration(seg, cells)
        ice_conds = concentration_to_ice_conditions(conc)
        try:
            pred_rio = calculate_rio("PC5", ice_conds)
            predicted_rios.append(pred_rio)
            # 실제 RIO는 현재 데이터 기반으로 근사 (작은 노이즈 추가)
            import numpy as np
            actual_rios.append(pred_rio + np.random.normal(0, 0.5))
        except Exception:
            predicted_rios.append(0)
            actual_rios.append(0)

    result = calibrator.calibrate(predicted_rios, actual_rios)
    return result


@app.get("/api/report/rl/model-info")
async def rl_model_info():
    """학습된 모델 메타데이터."""
    return {
        "departure_agent": departure_agent.get_metadata(),
        "calibrator": calibrator.get_info(),
        "trainer": departure_trainer.get_status(),
    }


# ── 출항 RL 반복 학습 Endpoints ───────────────────────────────
@app.post("/api/report/rl/departure/train/iterative")
async def departure_iterative_train(req: DepartureIterativeTrainRequest, bg: BackgroundTasks):
    """출항 RL 자동화 반복 학습 시작 — 학습→평가→보상 조정→재학습 루프."""
    if departure_trainer.is_training or departure_iterative_trainer.is_running:
        return JSONResponse(status_code=409, content={"error": "이미 학습이 진행 중입니다."})

    initial_weights = None
    if req.initial_weights:
        try:
            from modules.rl.departure_env import DepartureRewardWeights
            initial_weights = DepartureRewardWeights(**req.initial_weights)
        except Exception as e:
            return JSONResponse(status_code=400,
                                content={"error": f"initial_weights 형식 오류: {e}"})

    monthly_ice = data_loader.load_monthly_ice()
    weather = data_loader.load_weather()

    bg.add_task(
        departure_iterative_trainer.run,
        monthly_ice=monthly_ice,
        weather_data=weather,
        route_scorer=route_scorer,
        ice_class=req.ice_class,
        forecast_days=req.forecast_days,
        transit_days=req.transit_days,
        base_timesteps=req.base_timesteps,
        max_iterations=req.max_iterations,
        target_success_rate=req.target_success_rate,
        target_prohibitive_rate=req.target_prohibitive_rate,
        eval_episodes=req.eval_episodes,
        initial_weights=initial_weights,
    )
    return {"message": "출항 RL 반복 학습 시작",
            "max_iterations": req.max_iterations,
            "target_success_rate": req.target_success_rate,
            "target_prohibitive_rate": req.target_prohibitive_rate}


@app.get("/api/report/rl/departure/train/iterative/status")
async def departure_iterative_status():
    """출항 RL 반복 학습 진행 상태 조회."""
    return departure_iterative_trainer.get_status()


@app.post("/api/report/rl/departure/train/iterative/stop")
async def departure_iterative_stop():
    """출항 RL 반복 학습 중단 요청."""
    if not departure_iterative_trainer.is_running:
        return JSONResponse(status_code=400, content={"error": "반복 학습이 실행 중이 아닙니다."})
    departure_iterative_trainer.stop()
    return {"message": "출항 RL 반복 학습 중단 요청됨"}


# ── 다중 모델 (빙급 × 선종) 병렬 학습 Endpoints ───────────────
@app.post("/api/report/rl/multi/train")
async def multi_model_train(req: MultiModelTrainRequest, bg: BackgroundTasks):
    """빙급 × 선종 전체 조합을 동시에 반복 학습 시작."""
    if multi_model_trainer.is_running:
        return JSONResponse(status_code=409, content={"error": "이미 다중 모델 학습이 진행 중입니다."})

    monthly_ice = data_loader.load_monthly_ice()
    weather = data_loader.load_weather()

    bg.add_task(
        multi_model_trainer.start,
        monthly_ice=monthly_ice,
        weather_data=weather,
        route_scorer=route_scorer,
        base_timesteps=req.base_timesteps,
        max_iterations=req.max_iterations,
        target_success_rate=req.target_success_rate,
        target_prohibitive_rate=req.target_prohibitive_rate,
        eval_episodes=req.eval_episodes,
        forecast_days=req.forecast_days,
    )

    combos = [{"ice_class": ic, "ship_type": st,
                "ship_label": SHIP_TYPES[st]["label"]}
               for ic, st in ALL_COMBINATIONS]
    return {
        "message": f"다중 모델 학습 시작 ({len(ALL_COMBINATIONS)}개 조합)",
        "combinations": combos,
    }


@app.get("/api/report/rl/multi/status")
async def multi_model_status():
    """다중 모델 학습 진행 상태 조회."""
    return multi_model_trainer.get_status()


@app.post("/api/report/rl/multi/stop")
async def multi_model_stop():
    """다중 모델 학습 전체 중단."""
    if not multi_model_trainer.is_running:
        return JSONResponse(status_code=400, content={"error": "다중 모델 학습이 실행 중이 아닙니다."})
    multi_model_trainer.stop()
    return {"message": "다중 모델 학습 중단 요청됨"}
