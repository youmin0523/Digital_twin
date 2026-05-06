# =====================================================================
# Arctic Digital Twin — Hugging Face Spaces Dockerfile
#
# 이 Dockerfile 은 HF Space repo 루트에서 빌드된다는 것을 가정한다.
# 즉, 루트에 다음이 있어야 한다:
#   - app.py / requirements.txt / Dockerfile / README.md   (hf-space 폴더에서 복사)
#   - rl-pipeline/  report-service/  ml-pipeline/          (4개 백엔드 서비스)
#   - sar_server.py  backend/pipeline/                     (SAR 서버 + 모델)
#
# DEPLOY.md 의 “1회 셋업” 섹션 참고. (= ../로 이동하지 말고 readme 따라 카피)
# =====================================================================

FROM python:3.11-slim

# ── 환경변수 ─────────────────────────────────────────────────────────
# - HF Spaces 가 설정하는 PORT(보통 7860) 를 그대로 받는다
# - PYTHONUNBUFFERED: 자식 프로세스 stdout 바로 흘리기
# - PIP_NO_CACHE_DIR: 이미지 크기 절감
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=7860

# ── 시스템 의존성 ─────────────────────────────────────────────────────
# - libgl1, libglib2.0-0: ultralytics(YOLOv8) 가 OpenCV 통해 필요
# - git-lfs: HF Spaces 에 LFS 로 올린 큰 모델 파일을 fetch 하기 위함
#   (HF Spaces 가 자동으로 받지만 일부 케이스에서 명시 필요)
# - curl: 헬스체크 / 디버깅용
# - libgomp1: xgboost / scikit-learn 병렬 연산
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libgomp1 \
        git \
        git-lfs \
        curl \
    && rm -rf /var/lib/apt/lists/* \
    && git lfs install --system

# ── 작업 디렉토리: HF Spaces 표준은 /app, 또는 /code ─────────────────
WORKDIR /app

# ── 파이썬 의존성 (캐시 잘 타도록 먼저 복사) ─────────────────────────
COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
 && pip install -r /app/requirements.txt

# ── 프로젝트 코드 복사 ───────────────────────────────────────────────
# .dockerignore 가 frontend/, node_modules/, venv/, *.log 등을 제외
COPY . /app

# ── HF Spaces 가 컨테이너 안에서 쓰기 가능한 위치 ─────────────────────
# 자식 서비스들이 logs/, models/runs/, output/ 등에 쓰기 시도할 수 있어
# 실행 사용자(루트 외)가 쓸 수 있게 권한 부여
RUN chmod -R a+rwX /app

# ── HF Spaces 는 비루트 사용자(uid=1000) 로 컨테이너를 띄움 ────────────
# 명시적으로 user 도 만들고 전환해줌 (HF Spaces 권장 방식)
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

# ── 노출 포트 ────────────────────────────────────────────────────────
EXPOSE 7860

# ── 헬스체크 (선택) ──────────────────────────────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS http://127.0.0.1:7860/health || exit 1

# ── 시작 명령 ────────────────────────────────────────────────────────
# app.py 의 lifespan 이 4개 자식 서비스를 띄운 뒤 프록시를 가동.
CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
