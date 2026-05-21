"""
Arctic Digital Twin — Hugging Face Spaces Unified Entry Point
==============================================================

이 모듈은 4개의 백엔드 서비스(rl-pipeline / report-service / ml-pipeline / sar-server)를
한 개의 HF Spaces 컨테이너에서 동시 실행하기 위한 통합 진입점이다.

구조
----
    [Client] ─ HTTPS ─▶ port 7860 (이 FastAPI 프록시)
                          │
                          ├─ /api/rl/*     → 127.0.0.1:8001 (rl-pipeline)
                          ├─ /api/report/* → 127.0.0.1:8002 (report-service)
                          ├─ /api/fuel/*   → 127.0.0.1:8003 (ml-pipeline)
                          └─ /api/sar/*    → 127.0.0.1:8005 (sar-server)

특징
----
* 외부에는 단 하나의 포트(7860)만 노출 → HF Spaces 호환
* 4개 하위 서비스는 자식 프로세스로 격리 실행 (각 서비스의 modules/ 충돌 회피)
* 각 서비스의 기존 코드는 절대 수정하지 않음 (참조만)
* Vercel(또는 임의 도메인)에서 호출 가능하도록 CORS = '*'
* HF Spaces secrets에 등록된 환경변수(ANTHROPIC_API_KEY 등)는 자식 프로세스에 그대로 전달됨

로컬 테스트
----------
    cd hf-space
    pip install -r requirements.txt
    uvicorn app:app --host 0.0.0.0 --port 7860
"""
from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response


# ── 로깅 ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("hf-space.app")


# ── 경로 / 포트 설정 ─────────────────────────────────────────────────
# hf-space/ 의 부모 = 프로젝트 루트(Digital_twin/)
ROOT = Path(__file__).resolve().parent.parent

RL_PORT = 8001
REPORT_PORT = 8002
FUEL_PORT = 8003
SAR_PORT = 8005

EXTERNAL_PORT = int(os.environ.get("PORT", "7860"))

# 각 서비스가 부팅된 뒤 첫 응답까지 기다리는 최대 시간(초)
SERVICE_BOOT_TIMEOUT = 60


# ── 자식 프로세스 관리 ───────────────────────────────────────────────
_processes: list[tuple[str, subprocess.Popen]] = []


def _spawn(name: str, cmd: list[str], cwd: Path) -> None:
    """자식 프로세스를 띄운다. 출력은 부모 stdout/stderr 로 그대로 흘림."""
    logger.info("Spawning %s — cmd=%s cwd=%s", name, " ".join(cmd), cwd)
    p = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=os.environ.copy(),
        stdout=sys.stdout,
        stderr=sys.stderr,
    )
    _processes.append((name, p))


def _wait_until_ready(url: str, timeout: int = SERVICE_BOOT_TIMEOUT) -> bool:
    """`url` 이 200 을 돌려줄 때까지 폴링. 한 번이라도 성공하면 True."""
    deadline = time.monotonic() + timeout
    last_err: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with httpx.Client(timeout=2.0) as client:
                r = client.get(url)
                if r.status_code < 500:
                    return True
        except Exception as e:  # ConnectionError / ReadTimeout 등
            last_err = e
        time.sleep(0.5)
    logger.warning("Service did not become ready within %ds: %s (last_err=%s)", timeout, url, last_err)
    return False


def start_services() -> None:
    """4개 서비스를 자식 프로세스로 띄우고 준비될 때까지 대기."""
    # 1) rl-pipeline (RL 빙산 회피, 포트 8001)
    _spawn(
        "rl-pipeline",
        [
            sys.executable, "-m", "uvicorn",
            "server:app",
            "--host", "127.0.0.1",
            "--port", str(RL_PORT),
            "--log-level", "info",
        ],
        cwd=ROOT / "rl-pipeline",
    )

    # 2) report-service (보고서 + Claude AI, 포트 8002)
    _spawn(
        "report-service",
        [
            sys.executable, "-m", "uvicorn",
            "server:app",
            "--host", "127.0.0.1",
            "--port", str(REPORT_PORT),
            "--log-level", "info",
        ],
        cwd=ROOT / "report-service",
    )

    # 3) ml-pipeline (XGBoost 연료 추론, 포트 8003)
    _spawn(
        "ml-pipeline",
        [
            sys.executable, "-m", "uvicorn",
            "server:app",
            "--host", "127.0.0.1",
            "--port", str(FUEL_PORT),
            "--log-level", "info",
        ],
        cwd=ROOT / "ml-pipeline",
    )

    # 4) sar-server (YOLOv8 SAR 빙산, 포트 8005) — sar_server.py 의 __main__ 가 8005 로 띄움
    _spawn(
        "sar-server",
        [sys.executable, "sar_server.py"],
        cwd=ROOT,
    )

    # 헬스 폴링 (선택적). 이 단계에서 실패해도 프록시는 계속 동작 →
    # 클라이언트가 호출할 때 502 가 떨어질 수는 있음.
    health_targets = [
        ("rl-pipeline",    f"http://127.0.0.1:{RL_PORT}/api/rl/health"),
        ("report-service", f"http://127.0.0.1:{REPORT_PORT}/api/report/health"),
        ("ml-pipeline",    f"http://127.0.0.1:{FUEL_PORT}/api/fuel/health"),
        # sar-server 는 /api/sar/status 가 health 역할
        ("sar-server",     f"http://127.0.0.1:{SAR_PORT}/api/sar/status"),
    ]
    for name, url in health_targets:
        ok = _wait_until_ready(url)
        logger.info("Service %s ready=%s (%s)", name, ok, url)


def stop_services() -> None:
    """자식 프로세스들을 종료. SIGTERM → 안 죽으면 SIGKILL."""
    for name, p in _processes:
        if p.poll() is None:
            logger.info("Stopping %s (pid=%s)", name, p.pid)
            try:
                p.terminate()
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                logger.warning("Force-killing %s", name)
                p.kill()
            except Exception as e:
                logger.warning("Error stopping %s: %s", name, e)


# ── FastAPI lifespan: 시작 시 서비스 부팅, 종료 시 정리 ───────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    start_services()
    try:
        yield
    finally:
        stop_services()


# ── 메인 FastAPI 앱 ──────────────────────────────────────────────────
app = FastAPI(
    title="Arctic Digital Twin Backend (HF Spaces)",
    description="rl-pipeline / report-service / ml-pipeline / sar-server 통합 게이트웨이",
    version="1.0.0",
    lifespan=lifespan,
)

# 프론트(Vercel)에서 호출 가능하도록 CORS 와일드카드.
# 운영 단계에서는 allow_origins 를 본인 Vercel 도메인으로 좁힐 것.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── 프록시 코어 ──────────────────────────────────────────────────────
# 응답 헤더 중 클라이언트로 그대로 보내면 안 되는 것들
_HOP_BY_HOP = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-length",
}


async def _forward(request: Request, target_url: str) -> Response:
    """request 를 target_url 로 그대로 전달하고 응답을 돌려준다."""
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as client:
            upstream = await client.request(
                method=request.method,
                url=target_url,
                headers=headers,
                content=body,
                params=request.query_params,
                follow_redirects=False,
            )
    except httpx.ConnectError:
        return JSONResponse(
            status_code=502,
            content={"error": "upstream_unavailable", "target": target_url},
        )
    except httpx.ReadTimeout:
        return JSONResponse(
            status_code=504,
            content={"error": "upstream_timeout", "target": target_url},
        )

    resp_headers = {
        k: v for k, v in upstream.headers.items()
        if k.lower() not in _HOP_BY_HOP
    }
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers=resp_headers,
        media_type=upstream.headers.get("content-type"),
    )


# 모든 HTTP 메소드 허용
_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]


@app.api_route("/api/rl/{path:path}", methods=_METHODS)
async def proxy_rl(path: str, request: Request):
    return await _forward(request, f"http://127.0.0.1:{RL_PORT}/api/rl/{path}")


@app.api_route("/api/report/{path:path}", methods=_METHODS)
async def proxy_report(path: str, request: Request):
    return await _forward(request, f"http://127.0.0.1:{REPORT_PORT}/api/report/{path}")


@app.api_route("/api/fuel/{path:path}", methods=_METHODS)
async def proxy_fuel(path: str, request: Request):
    return await _forward(request, f"http://127.0.0.1:{FUEL_PORT}/api/fuel/{path}")


@app.api_route("/api/sar/{path:path}", methods=_METHODS)
async def proxy_sar(path: str, request: Request):
    return await _forward(request, f"http://127.0.0.1:{SAR_PORT}/api/sar/{path}")


# ── 메타 엔드포인트 ──────────────────────────────────────────────────
@app.get("/")
async def root():
    return {
        "service": "Arctic Digital Twin Backend",
        "deployed_on": "Hugging Face Spaces",
        "version": "1.0.0",
        "routes": [
            "/api/rl/*",
            "/api/report/*",
            "/api/fuel/*",
            "/api/sar/*",
        ],
        "subprocesses": [
            {"name": name, "pid": p.pid, "alive": p.poll() is None}
            for name, p in _processes
        ],
    }


@app.get("/health")
async def health():
    """프록시 프로세스 자체의 헬스 (자식 프로세스 상태 포함)."""
    statuses = {}
    for name, p in _processes:
        statuses[name] = "alive" if p.poll() is None else f"exited({p.returncode})"
    all_alive = all(v == "alive" for v in statuses.values())
    return JSONResponse(
        status_code=200 if all_alive else 503,
        content={"status": "ok" if all_alive else "degraded", "subprocesses": statuses},
    )


# ── SIGTERM 대응: HF Spaces 가 컨테이너를 stop 시킬 때 자식도 함께 종료 ──
def _on_sigterm(signum, frame):
    logger.info("Received signal %s — stopping children", signum)
    stop_services()
    sys.exit(0)


signal.signal(signal.SIGTERM, _on_sigterm)
signal.signal(signal.SIGINT, _on_sigterm)
