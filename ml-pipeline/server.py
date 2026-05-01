"""
ML Fuel Prediction Pipeline -- FastAPI Server

Run: uvicorn server:app --reload --port 8003
(포트 8003: 백엔드 8000, RL 8001, Report 8002 와 충돌 방지)
"""

import os
import logging

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-pipeline")

app = FastAPI(
    title="ML Fuel Prediction Pipeline",
    description="빙하 저항 기반 연료 소모량 예측 API (XGBoost)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 모델 로드 ───────────────────────────────────────────────
# V7c (선종별 3개 모델) 우선, fallback으로 옛 V4 단일 모델 지원
V7C_PATH = os.path.join(os.path.dirname(__file__), "models", "fuel_xgb_model_v7c.pkl")
LEGACY_PATH = os.path.join(os.path.dirname(__file__), "models", "fuel_xgb_model.pkl")
artifact = None
IS_V7C = False  # V7c bundle 여부

# V7c 학습 분포 (외삽 경고용)
V7C_BOUNDS = {
    "ice_thickness":     (0.0, 2.831),
    "ice_concentration": (0.0, 1.0),
    "displacement":      (15000, 30000),
    "engine_power":      (20000, 45000),
    "draft":             (6.0, 11.0),
}
V7C_VESSELS = ("icebreaker", "container", "lng")


@app.on_event("startup")
def load_model():
    global artifact, IS_V7C
    if os.path.exists(V7C_PATH):
        artifact = joblib.load(V7C_PATH)
        IS_V7C = isinstance(artifact, dict) and "models" in artifact
        if IS_V7C:
            logger.info(f"[ML] V7c 번들 로드 완료 (선종별 3개 모델): {V7C_PATH}")
            logger.info(f"[ML] 메트릭: {artifact.get('metrics_per_vessel', artifact.get('metrics', {}))}")
            return
    if os.path.exists(LEGACY_PATH):
        artifact = joblib.load(LEGACY_PATH)
        IS_V7C = False
        logger.info(f"[ML] 옛 단일 모델 로드 (V7c fallback): {LEGACY_PATH}")
        logger.info(f"[ML] 모델 성능: {artifact.get('metrics', {})}")
        return
    logger.warning("[ML] 모델 파일 없음. train_fuel_model.py 또는 V7c 번들이 필요합니다.")


def _predict_v7c(vessel_type: str, displacement: float, draft: float,
                 engine_power: float, ice_thickness: float, ice_concentration: float):
    """V7c bundle을 사용한 단일 예측. (값, 학습범위 OK 여부, 범위밖 항목)"""
    if vessel_type not in V7C_VESSELS:
        # 기본은 가장 보수적인 결과 (icebreaker)
        vessel_type = "icebreaker"
    inputs = {
        "displacement": displacement, "draft": draft, "engine_power": engine_power,
        "ice_thickness": ice_thickness, "ice_concentration": ice_concentration,
    }
    oor = []
    for k, v in inputs.items():
        lo, hi = V7C_BOUNDS[k]
        if v < lo or v > hi:
            oor.append(f"{k}={v} (training range {lo}-{hi})")
    feature_cols = artifact["feature_columns"]
    Xq = pd.DataFrame([[inputs[c] for c in feature_cols]], columns=feature_cols)
    pred_log = float(artifact["models"][vessel_type].predict(Xq)[0])
    return float(np.exp(pred_log)), len(oor) == 0, oor


def _predict_legacy(displacement, draft, engine_power, ice_thickness,
                    ice_concentration, ice_class_code):
    """옛 V4 단일 모델용 fallback."""
    X = np.array([[displacement, draft, engine_power, ice_thickness,
                   ice_concentration, ice_class_code]])
    y_log = artifact["model"].predict(X)
    return (float(np.exp(y_log[0])) if artifact.get("log_transformed")
            else float(y_log[0])), True, []


# ── Request / Response Models ───────────────────────────────

class FuelPredictRequest(BaseModel):
    displacement: float       # 배수량 (tons)
    draft: float              # 흘수 (m)
    engine_power: float       # 엔진 출력 (kW)
    ice_thickness: float      # 빙하 두께 (m), 0~3
    ice_concentration: float  # 빙하 농도 (0~1)
    ice_class_code: int = 0   # (V7c는 무시) 옛 V4 호환용 — 0=없음, 2=PC2, 4=PC4
    vessel_type: str = "icebreaker"  # V7c 라우팅 — icebreaker | container | lng


class RouteCompareRequest(BaseModel):
    """북극항로 vs 수에즈 비교 요청"""
    displacement: float
    draft: float
    engine_power: float
    ice_class_code: int
    # 북극항로 구간별 빙하 조건 (평균값)
    nsr_ice_thickness: float   # NSR 평균 빙하 두께
    nsr_ice_concentration: float  # NSR 평균 빙하 농도
    nsr_distance_nm: float     # NSR 총 거리 (해리)
    suez_distance_nm: float    # 수에즈 총 거리 (해리)
    # 선종 (비용 계산용)
    vessel_type: str = "container"  # container, lng, icebreaker
    speed_knots: float = 14.0  # 운항 속도 (knots)


# ── 연료 단가 및 부대비용 상수 ──────────────────────────────

# 벙커유(VLSFO) 단가 (USD/ton) — 2024~2025 평균
FUEL_PRICE_USD_PER_TON = 600.0

# 수에즈 운하 통행료 (USD) — 선종별
SUEZ_TOLL = {
    "container": 300_000,   # 컨테이너선 (가장 저렴한 선종)
    "lng": 450_000,         # LNG 운반선
    "icebreaker": 250_000,  # 쇄빙선
}

# 쇄빙선 에스코트 수수료 (USD/일) — NSRA 기준
ICEBREAKER_ESCORT_FEE = {
    "container": 85_000,    # 일반 상선
    "lng": 120_000,         # LNG (위험물 할증)
    "icebreaker": 0,        # 자체 쇄빙 → 면제
}

# 북극해 특별 보험료 (USD/일) — 선종별
ARCTIC_INSURANCE_PER_DAY = {
    "container": 15_000,
    "lng": 45_000,          # LNG 폭발 위험 → 기하급수적 할증
    "icebreaker": 8_000,
}

# 수에즈 우회 보안비 (해적 대비, 아덴만 통과)
SUEZ_SECURITY_COST = {
    "container": 20_000,
    "lng": 35_000,
    "icebreaker": 15_000,
}


# ── Endpoints ───────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "ML Fuel Prediction Pipeline",
        "model_loaded": artifact is not None,
        "port": 8003,
    }


@app.get("/api/fuel/health")
def health():
    return {
        "status": "ok" if artifact else "no_model",
        "model_loaded": artifact is not None,
        "metrics": artifact.get("metrics", {}) if artifact else {},
    }


@app.post("/api/fuel/predict")
def predict_fuel(req: FuelPredictRequest):
    """단일 구간 연료 소모량 예측 — V7c 사용 시 vessel_type 라우팅."""
    if not artifact:
        return {"error": "모델이 로드되지 않았습니다."}

    if IS_V7C:
        fuel, in_range, oor = _predict_v7c(
            req.vessel_type, req.displacement, req.draft, req.engine_power,
            req.ice_thickness, req.ice_concentration,
        )
        return {
            "fuel_per_nm": round(fuel, 6),
            "unit": "tons/nm",
            "model_version": "V7c",
            "vessel_type": req.vessel_type,
            "in_training_range": in_range,
            "out_of_range_fields": oor,
        }
    else:
        fuel, _, _ = _predict_legacy(
            req.displacement, req.draft, req.engine_power,
            req.ice_thickness, req.ice_concentration, req.ice_class_code,
        )
        return {
            "fuel_per_nm": round(fuel, 6),
            "unit": "tons/nm",
            "model_version": "V4_legacy",
        }


@app.post("/api/fuel/compare")
def compare_routes(req: RouteCompareRequest):
    """북극항로 vs 수에즈 운하 경제성 비교 — V7c 사용 시 선종별 정확 예측."""
    if not artifact:
        return {"error": "모델이 로드되지 않았습니다."}

    vtype = req.vessel_type
    nsr_oor: list[str] = []
    suez_oor: list[str] = []

    # ── 1) NSR 연료 소모량 예측 ──────────────────────────────
    if IS_V7C:
        nsr_fuel_per_nm, _, nsr_oor = _predict_v7c(
            vtype, req.displacement, req.draft, req.engine_power,
            req.nsr_ice_thickness, req.nsr_ice_concentration,
        )
    else:
        nsr_fuel_per_nm, _, _ = _predict_legacy(
            req.displacement, req.draft, req.engine_power,
            req.nsr_ice_thickness, req.nsr_ice_concentration, req.ice_class_code,
        )
    nsr_total_fuel = nsr_fuel_per_nm * req.nsr_distance_nm

    # ── 2) 수에즈 연료 소모량 (개수역 → 빙하 없음) ──────────
    if IS_V7C:
        suez_fuel_per_nm, _, suez_oor = _predict_v7c(
            vtype, req.displacement, req.draft, req.engine_power,
            0.0, 0.0,
        )
    else:
        suez_fuel_per_nm, _, _ = _predict_legacy(
            req.displacement, req.draft, req.engine_power,
            0.0, 0.0, req.ice_class_code,
        )
    suez_total_fuel = suez_fuel_per_nm * req.suez_distance_nm

    # ── 3) 운항 시간 계산 ────────────────────────────────────
    # NSR: 빙하로 인한 속도 저하 반영 (농도 + 빙하 두께 + 빙급 보정)
    # 빙급 코드 → 내빙 성능 계수 (0=없음 → 낮음, 2=PC2 → 높음)
    ice_class_perf = {0: 0.0, 2: 0.9, 4: 0.7}.get(req.ice_class_code, 0.5)
    # 농도 영향: 고내빙 선박일수록 덜 감속
    conc_penalty = req.nsr_ice_concentration * (0.5 - 0.3 * ice_class_perf)
    # 빙하 두께 영향 (두께 1m 기준, 최대 0.3 감속)
    thick_penalty = min(0.3, req.nsr_ice_thickness / 3.0 * (0.3 - 0.15 * ice_class_perf))
    ice_speed_factor = max(0.3, 1.0 - conc_penalty - thick_penalty)
    nsr_effective_speed = req.speed_knots * ice_speed_factor
    nsr_transit_days = req.nsr_distance_nm / (nsr_effective_speed * 24)

    suez_transit_days = req.suez_distance_nm / (req.speed_knots * 24)

    # ── 4) 비용 계산 ────────────────────────────────────────
    # 연료비
    nsr_fuel_cost = nsr_total_fuel * FUEL_PRICE_USD_PER_TON
    suez_fuel_cost = suez_total_fuel * FUEL_PRICE_USD_PER_TON

    # NSR 부대비용
    nsr_escort_cost = ICEBREAKER_ESCORT_FEE.get(vtype, 85_000) * nsr_transit_days
    nsr_insurance_cost = ARCTIC_INSURANCE_PER_DAY.get(vtype, 15_000) * nsr_transit_days
    nsr_additional = nsr_escort_cost + nsr_insurance_cost
    nsr_total_cost = nsr_fuel_cost + nsr_additional

    # 수에즈 부대비용
    suez_toll = SUEZ_TOLL.get(vtype, 300_000)
    suez_security = SUEZ_SECURITY_COST.get(vtype, 20_000)
    suez_additional = suez_toll + suez_security
    suez_total_cost = suez_fuel_cost + suez_additional

    # ── 5) 비교 결과 ────────────────────────────────────────
    cost_saving = suez_total_cost - nsr_total_cost
    time_saving = suez_transit_days - nsr_transit_days

    return {
        "nsr": {
            "distance_nm": req.nsr_distance_nm,
            "fuel_per_nm": round(nsr_fuel_per_nm, 6),
            "total_fuel_tons": round(nsr_total_fuel, 2),
            "fuel_cost_usd": round(nsr_fuel_cost, 0),
            "escort_cost_usd": round(nsr_escort_cost, 0),
            "insurance_cost_usd": round(nsr_insurance_cost, 0),
            "additional_cost_usd": round(nsr_additional, 0),
            "total_cost_usd": round(nsr_total_cost, 0),
            "transit_days": round(nsr_transit_days, 1),
            "effective_speed_knots": round(nsr_effective_speed, 1),
        },
        "suez": {
            "distance_nm": req.suez_distance_nm,
            "fuel_per_nm": round(suez_fuel_per_nm, 6),
            "total_fuel_tons": round(suez_total_fuel, 2),
            "fuel_cost_usd": round(suez_fuel_cost, 0),
            "toll_usd": round(suez_toll, 0),
            "security_cost_usd": round(suez_security, 0),
            "additional_cost_usd": round(suez_additional, 0),
            "total_cost_usd": round(suez_total_cost, 0),
            "transit_days": round(suez_transit_days, 1),
        },
        "comparison": {
            "cost_saving_usd": round(cost_saving, 0),
            "cost_saving_percent": round(cost_saving / suez_total_cost * 100, 1) if suez_total_cost > 0 else 0,
            "time_saving_days": round(time_saving, 1),
            "fuel_saving_tons": round(suez_total_fuel - nsr_total_fuel, 2),
            "nsr_is_cheaper": cost_saving > 0,
        },
        "vessel_type": vtype,
        "fuel_price_usd_per_ton": FUEL_PRICE_USD_PER_TON,
        "model_version": "V7c" if IS_V7C else "V4_legacy",
        "extrapolation_warnings": {
            "nsr": nsr_oor,
            "suez": suez_oor,
        },
    }
