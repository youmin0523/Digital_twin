# Arctic Digital Twin

북극항로 디지털 트윈 플랫폼 - 실시간 해빙/빙산 모니터링, 항로 시뮬레이션, RL 기반 빙산 회피

## 프로젝트 구조

```
Digital_twin/
├── backend/          # Node.js Express API 서버 (포트 8000)
├── frontend/         # React + Cesium.js + Three.js 프론트엔드
└── rl-pipeline/      # RL 빙산 회피 파이프라인 (Python, 내부 포트 8001)
```

## 설치 및 실행

### 1. Backend

```bash
cd backend
npm install
```

### 2. Frontend

```bash
cd frontend
npm install
```

### 3. RL Pipeline (선택사항)

RL 빙산 회피 기능을 사용하려면 Python 환경을 설정해야 합니다.
설정하지 않아도 기존 A* 기반 빙산 회피는 정상 작동합니다.

**Windows:**
```bash
cd rl-pipeline
python -m venv venv
venv\Scripts\pip install -r requirements.txt
```

**Mac / Linux:**
```bash
cd rl-pipeline
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

> Python 3.10 이상이 필요합니다.

## 실행

```bash
# 백엔드 (RL 서버 자동 기동 포함)
cd backend
npm run dev

# 프론트엔드 (별도 터미널)
cd frontend
npm run dev
```

백엔드가 시작되면:
- `http://localhost:8000` - API 서버
- `http://localhost:8000/api/rl/health` - RL 서버 상태 확인

RL Pipeline이 설치되지 않은 경우 콘솔에 아래 경고가 출력되며, RL 기능만 비활성화됩니다:
```
[RL] Python venv not found at ...
[RL] RL pipeline disabled.
```

## RL 학습

RL 환경 설정 완료 후, 브라우저에서 학습을 시작할 수 있습니다:

```bash
# 단일 난이도 학습 (easy/medium/hard)
curl -X POST http://localhost:8000/api/rl/train \
  -H "Content-Type: application/json" \
  -d '{"difficulty":"easy","timesteps":50000}'

# 커리큘럼 학습 (easy → medium → hard 순차 진행)
curl -X POST http://localhost:8000/api/rl/train \
  -H "Content-Type: application/json" \
  -d '{"curriculum":true}'

# 학습 상태 확인
curl http://localhost:8000/api/rl/status
```

또는 Swagger UI에서 직접 테스트: `http://localhost:8000/api/rl/docs` (RL 서버 활성화 시)

## 주요 API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/health` | 백엔드 헬스체크 |
| `GET /api/ice/latest` | 실시간 해빙 데이터 |
| `GET /api/icebergs/latest` | 실시간 빙산 데이터 |
| `GET /api/weather/latest` | 기상 데이터 |
| `POST /api/rl/train` | RL 학습 시작 |
| `GET /api/rl/status` | RL 학습 상태 |
| `POST /api/rl/infer` | RL 실시간 추론 |
