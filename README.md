# 🧊 Arctic Digital Twin

> 북극항로 통항을 위한 AI 기반 디지털 트윈 플랫폼
> 강화학습 빙산 회피 + 실시간 해빙 모니터링 + 항로 최적화

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-000000?style=for-the-badge&logo=vercel)](https://digital-twin-omega-umber.vercel.app)
[![Backend API](https://img.shields.io/badge/Backend%20API-HuggingFace-FFD21E?style=for-the-badge&logo=huggingface)](https://heejin-oh-arctic-digital-twin-backend.hf.space)
[![Domain](https://img.shields.io/badge/Domain-arctic--twin.xyz-blue?style=for-the-badge)](https://arctic-twin.xyz)

---

## 🌐 Live Demo

| 서비스 | URL |
|--------|-----|
| **Frontend (Vercel)** | https://digital-twin-omega-umber.vercel.app |
| **Custom Domain** | https://arctic-twin.xyz |
| **Backend API (HF Spaces)** | https://heejin-oh-arctic-digital-twin-backend.hf.space |
| **Health Check** | [/health](https://heejin-oh-arctic-digital-twin-backend.hf.space/health) |

---

## ✨ 핵심 기능

### 🤖 AI 모델 4종 통합

| 기능 | 모델 | 역할 |
|------|------|------|
| **빙산 회피** | Stable Baselines3 (SAC) | 강화학습 기반 실시간 충돌 회피 경로 생성 |
| **출항 스케줄링** | Stable Baselines3 (SAC) | RL 기반 최적 출항 시점 결정 |
| **빙산 탐지** | YOLOv8 | SAR 위성 영상에서 빙산 자동 탐지 |
| **연료 예측** | XGBoost | 빙해 저항 기반 연료 소비량 회귀 |
| **What-If 분석** | Claude Agent SDK + Pool | LLM 기반 시나리오 자동 생성 |

### 🎨 인터랙티브 프론트엔드

- **Cesium.js 3D 지도** - 북극 지역 위성 영상 + 실시간 해빙 농도
- **Deck.gl 시각화** - 빙산 위치 + 항로 오버레이
- **Three.js** - 선박 3D 모델
- **React + Vite** - 빠른 개발 환경

---

## 🏗️ 아키텍처

```
                            ┌─────────────────┐
                            │     User        │
                            └────────┬────────┘
                                     │ HTTPS
                                     ▼
                  ┌──────────────────────────────────┐
                  │  Vercel (Frontend - React+Cesium) │
                  │  arctic-twin.xyz                  │
                  └────────────┬─────────────────────┘
                               │ /api/* rewrites
                               ▼
              ┌──────────────────────────────────────────┐
              │  Hugging Face Spaces (Backend Container)  │
              │  ┌──────────────────────────────────────┐ │
              │  │  FastAPI Proxy (port 7860)            │ │
              │  └──────┬─────────┬─────────┬──────────┘ │
              │         │         │         │             │
              │  ┌──────▼──┐ ┌────▼────┐ ┌─▼──────┐ ┌──▼─┐│
              │  │ rl-pipe │ │ report  │ │ ml-pipe│ │ sar││
              │  │ (8001)  │ │ (8002)  │ │ (8003) │ │8005││
              │  └─────────┘ └─────────┘ └────────┘ └────┘│
              │       SAC      Claude SDK   XGBoost  YOLOv8│
              └──────────────────────────────────────────┘
                               │
                               ▼
              ┌────────────────────────────────────────┐
              │  External APIs                         │
              │  - Copernicus Marine (해양 데이터)      │
              │  - CDSE (Sentinel-1 SAR)               │
              │  - NSIDC (해빙 농도)                    │
              │  - Anthropic Claude (시나리오 생성)     │
              └────────────────────────────────────────┘
```

---

## 🛠️ 기술 스택

### Frontend
- **Framework**: React 18 + Vite
- **3D**: Cesium.js, Three.js, Deck.gl
- **Charts**: Recharts
- **Hosting**: Vercel

### Backend
- **API Framework**: FastAPI (Python 3.11)
- **ML/AI**:
  - PyTorch 2.x + Stable Baselines3 (강화학습)
  - Ultralytics YOLOv8 (Computer Vision)
  - XGBoost (회귀)
  - Claude Agent SDK + MCP (LLM 도구)
- **Container**: Docker (multi-process)
- **Hosting**: Hugging Face Spaces (CPU 16GB Free)

### Data
- **위성 데이터**: Sentinel-1 SAR (Copernicus CDSE)
- **해빙 농도**: NSIDC (NASA)
- **기상 데이터**: Copernicus Marine Service
- **모델 저장**: Git LFS (~200MB)

### DevOps
- **CI/CD**: GitHub → Vercel/HF Spaces 자동 배포
- **Secrets**: HF Secrets (API keys)
- **DNS**: Gabia + Vercel
- **버전 관리**: Git LFS

---

## 🚀 로컬 실행

### 사전 준비
- Python 3.11+
- Node.js 20+
- Git LFS

### 1. 저장소 클론
```bash
git clone https://github.com/Hijin554/digital-twin
cd digital-twin
```

### 2. 환경변수 설정
```bash
cp backend/.env.example backend/.env
# .env 파일 편집해서 API 키 입력
```

필요한 키:
- `ANTHROPIC_API_KEY` (Claude)
- `COPERNICUS_MARINE_USER` / `COPERNICUS_MARINE_PASSWORD`
- `CDSE_USER` / `CDSE_PASSWORD`

### 3. 백엔드 실행
```bash
# 각 백엔드 폴더에서
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt

# 자동 시작 (4개 서버 한 번에)
auto_start.bat   # Windows
```

### 4. 프론트엔드 실행
```bash
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 열기.

---

## 📦 배포

### Hugging Face Spaces (백엔드 + AI)
[`hf-space/DEPLOY.md`](hf-space/DEPLOY.md) 참고. Docker 기반 자동 빌드.

### Vercel (프론트엔드)
1. GitHub 저장소 import
2. Root Directory: `frontend`
3. Framework: Vite
4. 자동 배포

---

## 🎯 프로젝트 하이라이트

### 1. 듀얼 클라우드 아키텍처
- **프론트엔드**: Vercel (Edge Network)
- **백엔드 + AI**: Hugging Face Spaces (16GB RAM)
- **장점**: 각 플랫폼의 강점 활용, 영구 무료 운영

### 2. 강화학습 모델 다수 학습
- 3 항로 × 7 빙해 등급 × 4 선박 종류 = **84개 빙산 회피 모델**
- 7 × 4 = **28개 출항 스케줄 모델**
- Stable Baselines3 SAC 기반 학습

### 3. Graceful Degradation 패턴
- 외부 LLM API (Claude) 실패 시 풀 시나리오로 자동 대체
- 운영 안정성 보장

### 4. Git LFS 관리
- 200MB+ AI 모델 파일 LFS 추적
- 코드 저장소 가벼움 유지

---

## 📊 프로젝트 통계

- **총 코드**: ~30,000 LOC
- **백엔드 서비스**: 5개 (Python FastAPI 4 + Node.js Express 1)
- **AI 모델**: 30+ (RL × 24, YOLOv8 × 1, XGBoost × 2)
- **외부 API 연동**: 4개 (Copernicus, CDSE, NSIDC, Anthropic)

---

## 🤝 팀

원본 저장소: [youmin0523/Digital_twin](https://github.com/youmin0523/Digital_twin)

---

## 📜 라이선스

MIT License

---

## 🙋 연락처

- GitHub: [@Hijin554](https://github.com/Hijin554)
- Live Demo: https://arctic-twin.xyz
