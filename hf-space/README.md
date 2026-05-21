---
title: Arctic Digital Twin Backend
emoji: 🚢
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: rl-pipeline · report · fuel · sar 통합 백엔드
---

# Arctic Digital Twin — Backend (Hugging Face Spaces)

북극항로 디지털 트윈 프로젝트의 **백엔드 통합 게이트웨이**.
프론트엔드(Vercel 배포)에서 호출하는 4개 백엔드 서비스를 단일 컨테이너에서 동시 실행한다.

## 🗺️ 노출 엔드포인트

| 경로 prefix | 내부 서비스 | 역할 |
|---|---|---|
| `/api/rl/*` | rl-pipeline (port 8001 internal) | 빙산 회피 강화학습 (SAC) |
| `/api/report/*` | report-service (port 8002 internal) | 트렌드 보고서 생성 + Claude AI |
| `/api/fuel/*` | ml-pipeline (port 8003 internal) | XGBoost 연료 소모 예측 |
| `/api/sar/*` | sar-server (port 8005 internal) | YOLOv8 SAR 빙산 탐지 |

외부에는 단 하나의 포트(7860)만 열려 있고, `app.py` 가 path prefix 기반으로 4개 자식 프로세스로 프록시한다.

## 🚀 호출 예시

```bash
# 헬스체크
curl https://<your-space>.hf.space/health

# 연료비 예측
curl -X POST https://<your-space>.hf.space/api/fuel/predict \
     -H "Content-Type: application/json" \
     -d '{"route":"NSR","ice_thickness":1.0,"ice_concentration":0.3,"speed":14}'

# RL 추론
curl -X POST https://<your-space>.hf.space/api/rl/infer \
     -H "Content-Type: application/json" \
     -d '{"ship_state":{...}, "icebergs":[...], "ice_data":{...}, "weather":{...}}'
```

## 🔐 필요한 Secrets

HF Space → Settings → Repository secrets 에 다음을 등록:

| 키 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | report-service 의 Claude 분석 |
| `COPERNICUS_MARINE_USER` / `COPERNICUS_MARINE_PASSWORD` | (선택) Copernicus 해양 데이터 |
| `CDSE_USER` / `CDSE_PASSWORD` | (선택) Sentinel-1 SAR 아카이브 |

`.env.example` 참고. 값이 없으면 그 기능만 비활성화된다.

## 🏗️ 아키텍처

```
                 Vercel Frontend
                       │
                       ▼
            ┌──────────────────────┐
            │ HF Space :7860       │
            │  app.py (FastAPI)    │  ← 외부 노출되는 단 하나의 포트
            └────┬─────┬─────┬─────┘
       /api/rl/* │     │     │ /api/sar/*
                 ▼     ▼     ▼
        ┌─────────────────────────────┐
        │  내부 자식 프로세스 (격리)   │
        │  ─────────────────────────   │
        │  127.0.0.1:8001 rl-pipeline  │
        │  127.0.0.1:8002 report       │
        │  127.0.0.1:8003 ml-pipeline  │
        │  127.0.0.1:8005 sar-server   │
        └─────────────────────────────┘
```

각 자식 프로세스는 자기 디렉토리의 `server.py` 또는 `sar_server.py` 를 그대로 실행한다.
원본 코드는 단 한 줄도 수정하지 않으므로 로컬 개발(8000~8005 별도 포트) 환경과 100% 호환된다.

## 📦 배포

`DEPLOY.md` 의 단계별 가이드를 따라가세요.

핵심:

1. HF에 새 Space 생성 (Docker SDK)
2. 이 폴더(`hf-space/`)와 함께 `rl-pipeline/`, `report-service/`, `ml-pipeline/`, `sar_server.py`, `backend/pipeline/` 를 Space repo 루트에 복사
3. Git LFS 로 모델 파일들(`*.pkl`, `*.pt`, `sac_*`) 추적
4. Secrets 등록
5. push → 빌드 (~15분)

## 🧪 로컬 테스트

```bash
cd hf-space
pip install -r requirements.txt
python -m uvicorn app:app --host 0.0.0.0 --port 7860
# 다른 터미널에서
curl http://localhost:7860/health
```

## ⚠️ 알려진 제약

* **HF Spaces Free**: CPU 16GB / GPU 없음 / Persistent Storage 없음.
  RL·SAR 학습은 가능은 하지만 매우 느리고, 컨테이너 재시작 시 학습 결과가 사라진다.
  → 학습은 로컬 PC 에서, HF 에는 추론 모델만 올리는 운용 권장.
* **빌드 시간**: torch + ultralytics + 의존성 합쳐서 첫 빌드는 약 15~25분.
* **CORS**: 현재 `*` 와일드카드. 운영 단계에선 본인 Vercel 도메인으로 좁힐 것.
