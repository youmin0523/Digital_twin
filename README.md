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

---

## 강화학습 (RL) 빙산 회피 상세 가이드

### 개요

SAC (Soft Actor-Critic) 알고리즘을 사용하여 선박이 빙산과 육지를 회피하면서 목표 경로를 따라 항행하는 정책을 학습합니다.

**학습 파이프라인 흐름:**
```
[환경 초기화] → [에피소드 시작] → [관측 수집] → [행동 예측] → [보상 계산] → [정책 업데이트] → ...
```

### 환경 구성

| 항목 | 설명 |
|------|------|
| **알고리즘** | SAC (Soft Actor-Critic) — stable-baselines3 |
| **관측 공간** | 22차원 (선박 위치/방위/속도, 웨이포인트, 빙산 3개, 해빙/시정/파고, 진행률, 교차오차) |
| **행동 공간** | 2차원 연속 — `[heading_delta (-15~+15도), speed_factor (0.5~1.0)]` |
| **타임스텝** | 2초 간격, 에피소드당 최대 500스텝 (~17분 시뮬레이션) |
| **충돌 감지** | 빙산 충돌 (거리 기반) + 육지 충돌 (글로벌 land mask) |
| **에피소드 종료** | 성공(진행률 98%+), 충돌(빙산/육지), 경로 이탈(3km+), 타임아웃(500스텝) |

### 커리큘럼 학습 구조

난이도가 점진적으로 올라가는 3단계 커리큘럼으로 학습합니다:

| 단계 | 난이도 | 스텝 수 | 빙산 수 | 해빙 농도 | 시정 | 파고 | Travel Budget |
|------|--------|---------|---------|----------|------|------|--------------|
| **Stage 1** | easy | 100,000 | 1~3개 | 0.0~0.2 | 8~15km | 0.5~2.0m | 5.0km |
| **Stage 2** | medium | 200,000 | 3~8개 | 0.1~0.5 | 3~10km | 1.0~4.0m | 6.0km |
| **Stage 3** | hard | 200,000 | 8~15개 | 0.3~0.8 | 1~5km | 2.0~6.0m | 7.0km |

### 사전 준비

#### 1. 추가 패키지 설치

`requirements.txt`에는 RL 관련 패키지가 포함되어 있지 않으므로 별도로 설치합니다:

```bash
cd rl-pipeline

# Windows
venv\Scripts\pip install gymnasium stable-baselines3

# Mac / Linux
venv/bin/pip install gymnasium stable-baselines3
```

#### 2. 글로벌 Land Mask 적용 (구현 완료)
 
 육지 충돌 감지를 위해 `frontend/public/data/landMask.json` 데이터를 `rl-pipeline/data/land_mask_global.json`으로 자동 이식하여 사용합니다. 
 현재 RL 환경(`IcebergAvoidanceEnv`)은 빙산뿐만 아니라 해당 마스크 데이터를 기반으로 육지 충돌을 실시간으로 감지하고 패널티를 부여합니다.
 
 *   **위도 범위**: 65°N ~ 90°N (0.5° 해상도)
 *   **데이터 소스**: 프론트엔드 공유 리소스 (`landMask.json`)
 
 별도의 스크립트 실행 없이, `train_all.py` 실행 시 자동으로 로드됩니다.

### 학습 실행 방법

> **디렉토리 위치 안내**
> - **방법 1, 2 (API / Swagger)**: 이미 실행 중인 서버에 HTTP 요청을 보내는 것이므로, **터미널 위치는 상관없습니다**. 어디에서든 실행 가능합니다.
> - **방법 3 (Python 직접)**: 반드시 `rl-pipeline` 폴더에서 실행해야 합니다. Python이 `modules` 패키지를 찾아야 하기 때문입니다.

#### 방법 1: Swagger UI에서 학습 (가장 쉬움)

마우스 클릭만으로 학습을 시작할 수 있는 가장 간편한 방법입니다.

**사전 조건**: 백엔드 서버가 실행 중이어야 합니다 (`npm run dev`).

1. 브라우저에서 아래 주소로 접속:
   ```
   http://localhost:8000/docs
   ```
2. 화면에서 **POST /api/rl/train** 항목을 찾아 클릭
3. 우측 상단의 **Try it out** 버튼 클릭
4. Request body 입력란에 아래 내용 입력:

   **커리큘럼 학습 (easy -> medium -> hard 순차 진행):**
   ```json
   {
     "difficulty": "medium",
     "timesteps": 100000,
     "curriculum": true
   }
   ```

   **단일 난이도 학습:**
   ```json
   {
     "difficulty": "easy",
     "timesteps": 50000,
     "curriculum": false
   }
   ```

5. **Execute** 버튼 클릭 -> 학습이 백그라운드에서 시작됩니다

**학습 상태 확인**: 같은 페이지에서 **GET /api/rl/status** -> Try it out -> Execute

**모델 평가**: **POST /api/rl/evaluate** -> Try it out -> `n_episodes=100`, `difficulty=medium` 입력 -> Execute

#### 방법 2: 터미널에서 API 호출

백엔드 서버가 실행 중인 상태에서, **아무 터미널**을 열고 아래 명령어를 입력합니다.
(디렉토리 위치는 상관없습니다)

##### Windows CMD (명령 프롬프트)

```cmd
:: 커리큘럼 학습 시작
curl -X POST http://localhost:8000/api/rl/train -H "Content-Type: application/json" -d "{\"curriculum\": true}"

:: 단일 난이도 학습 (easy, 50000 스텝)
curl -X POST http://localhost:8000/api/rl/train -H "Content-Type: application/json" -d "{\"difficulty\": \"easy\", \"timesteps\": 50000}"

:: 학습 상태 확인
curl http://localhost:8000/api/rl/status

:: 모델 평가 (100 에피소드, medium 난이도)
curl -X POST "http://localhost:8000/api/rl/evaluate?n_episodes=100&difficulty=medium"
```

> **Windows CMD 주의사항**: JSON 내부의 큰따옴표(`"`)를 `\"` 로 이스케이프해야 합니다.

##### Windows PowerShell

```powershell
# 커리큘럼 학습 시작
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/rl/train" -ContentType "application/json" -Body '{"curriculum": true}'

# 단일 난이도 학습
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/rl/train" -ContentType "application/json" -Body '{"difficulty": "easy", "timesteps": 50000}'

# 학습 상태 확인
Invoke-RestMethod -Uri "http://localhost:8000/api/rl/status"

# 모델 평가
Invoke-RestMethod -Method POST -Uri "http://localhost:8000/api/rl/evaluate?n_episodes=100&difficulty=medium"
```

##### Git Bash / WSL

```bash
# 커리큘럼 학습 시작
curl -X POST http://localhost:8000/api/rl/train \
  -H "Content-Type: application/json" \
  -d '{"curriculum": true}'

# 단일 난이도 학습
curl -X POST http://localhost:8000/api/rl/train \
  -H "Content-Type: application/json" \
  -d '{"difficulty": "easy", "timesteps": 50000}'

# 학습 상태 확인
curl http://localhost:8000/api/rl/status

# 모델 평가
curl -X POST "http://localhost:8000/api/rl/evaluate?n_episodes=100&difficulty=medium"
```

##### 응답 예시

학습 시작 응답:
```json
{
  "message": "학습 시작",
  "curriculum": true,
  "difficulty": "medium",
  "timesteps": 100000
}
```

학습 상태 응답:
```json
{
  "is_training": true,
  "current_stage": "stage_1_basic",
  "training_log": [
    {
      "stage": "stage_1_basic",
      "difficulty": "easy",
      "timesteps": 100000,
      "metrics": {
        "mean_reward_100": 15.3,
        "collision_rate": 0.12,
        "success_rate": 0.45
      }
    }
  ]
}
```

모델 평가 응답:
```json
{
  "episodes": 100,
  "difficulty": "medium",
  "mean_reward": 42.5,
  "collision_rate": 0.05,
  "success_rate": 0.78,
  "mean_max_deviation_km": 0.85,
  "mean_episode_length": 320.5
}
```

#### 방법 3: Python에서 직접 학습 (서버 없이)

API 서버를 띄우지 않고 Python에서 직접 학습을 실행합니다.

> **반드시 `rl-pipeline` 폴더에서 실행해야 합니다.**

```cmd
:: rl-pipeline 폴더로 이동
cd rl-pipeline

:: 커리큘럼 학습 실행
venv\Scripts\python -c "from modules.rl_trainer import RLTrainer; print(RLTrainer().train_curriculum())"

:: 또는 단일 난이도 학습
venv\Scripts\python -c "from modules.rl_trainer import RLTrainer; print(RLTrainer().train_single('easy', 50000))"
```

### 학습 결과 확인

#### 모델 저장 위치

학습된 모델은 자동으로 아래 경로에 저장됩니다:

```
rl-pipeline/models/sac_iceberg/
├── sac_v1.zip              # SAC 모델 가중치
├── sac_v1_meta.json        # 하이퍼파라미터 및 최종 메트릭
├── sac_v2.zip              # 버전 2 (재학습 시)
└── ...
```

#### 학습 중 메트릭

5,000 스텝마다 아래 메트릭이 콘솔에 로그됩니다:

```
[RL] Step 5000:  reward=2.15, collision=0.320, success=0.010
[RL] Step 10000: reward=8.43, collision=0.180, success=0.120
[RL] Step 50000: reward=25.1, collision=0.050, success=0.650
...
```

| 메트릭 | 설명 | 목표값 |
|--------|------|--------|
| `reward` | 최근 100 에피소드 평균 보상 | 높을수록 좋음 |
| `collision` | 충돌률 (빙산 + 육지) | 0에 가까울수록 좋음 |
| `success` | 성공률 (경로 98% 이상 완주) | 1에 가까울수록 좋음 |

### 실시간 추론 (프론트엔드 연동)

학습된 모델이 있으면, 프론트엔드에서 실시간으로 빙산 회피 행동을 요청할 수 있습니다:

```bash
curl -X POST http://localhost:8000/api/rl/infer \
  -H "Content-Type: application/json" \
  -d '{
    "ship_state": {
      "lon": 140.0, "lat": 73.0,
      "heading": 270, "speed_knots": 14,
      "ice_class": "PC5"
    },
    "icebergs": [
      {"lat": 73.01, "lon": 139.95, "length_m": 200}
    ],
    "ice_data": {"concentration": 0.3},
    "weather": {"visibility_km": 8, "wave_height_m": 2.0}
  }'
```

응답:
```json
{
  "heading_delta": -5.2,
  "speed_factor": 0.85,
  "confidence": 0.72,
  "projected_path": [
    {"lon": 139.99, "lat": 73.001},
    {"lon": 139.98, "lat": 73.002}
  ],
  "fallback": false
}
```

| 필드 | 설명 |
|------|------|
| `heading_delta` | 추천 방향 변화 (양수=우현, 음수=좌현) |
| `speed_factor` | 추천 속도 계수 (0.5=감속, 1.0=전속) |
| `confidence` | 모델 신뢰도 (0~1) |
| `projected_path` | 예측 미래 경로 (20스텝) |
| `fallback` | `true`이면 신뢰도 낮음 → A* 경로 사용 권장 |

### 보상 구조

| 보상 항목 | 가중치 | 설명 |
|-----------|--------|------|
| 경로 진행 | +2.0 | 웨이포인트를 향해 전진할 때 |
| 충돌 | -100.0 | 빙산 또는 육지와 충돌 시 |
| 경로 이탈 | -0.5 | 경로로부터 벗어난 거리에 비례 |
| 빙산 근접 | 가변 | 안전 반경 내 진입 시 거리 반비례 패널티 |
| 성공 보너스 | +50.0 | 경로 98% 이상 완주 시 |
| 속도 | +0.3 | 적절한 속도 유지 시 |
| 급선회 | -0.2 | 급격한 방향 전환 시 |

### 트러블슈팅

| 문제 | 해결 방법 |
|------|----------|
| `ModuleNotFoundError: gymnasium` | `pip install gymnasium stable-baselines3` 실행 |
| `land_mask_global.json not found` | `python scripts/generate_global_land_mask.py` 실행 |
| 학습이 시작되지 않음 | `curl http://localhost:8000/api/rl/status`로 진행 중인 학습 확인 |
| `이미 학습이 진행 중입니다` | 기존 학습이 끝날 때까지 대기 (HTTP 409 응답) |
| 충돌률 0%, 성공률 0% | land mask가 없거나 경로 밀집화가 안 됨 → 최신 코드 확인 |

---

## 주요 API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/health` | GET | 백엔드 헬스체크 |
| `/api/ice/latest` | GET | 실시간 해빙 데이터 |
| `/api/icebergs/latest` | GET | 실시간 빙산 데이터 |
| `/api/weather/latest` | GET | 기상 데이터 |
| `/api/rl/train` | POST | RL 학습 시작 |
| `/api/rl/status` | GET | RL 학습 상태 조회 |
| `/api/rl/evaluate` | POST | 학습된 모델 평가 |
| `/api/rl/infer` | POST | RL 실시간 추론 |
