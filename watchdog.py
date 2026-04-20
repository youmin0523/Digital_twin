"""
watchdog.py — Digital Twin 완전 무인 감시/자동재시작 데몬
실행: pythonw watchdog.py  (창 없이 백그라운드 실행)
또는: python watchdog.py

- 5분마다 4개 서버 헬스체크
- 죽어 있으면 자동 재시작
- 학습이 멈춰 있으면 자동 트리거
- 모든 로그 → logs/watchdog.log (창 없음, 팝업 없음)
"""
import subprocess, sys, time, json, os, logging
from pathlib import Path
from urllib import request as ur

BASE = Path(__file__).parent
LOGS = BASE / "logs"
LOGS.mkdir(exist_ok=True)

logging.basicConfig(
    filename=str(LOGS / "watchdog.log"),
    level=logging.INFO,
    format="%(asctime)s %(message)s",
    encoding="utf-8",
)
log = logging.getLogger()

SERVERS = [
    {
        "name": "rl-pipeline",
        "port": 8001,
        "cwd":  BASE / "rl-pipeline",
        "cmd":  [str(BASE / "rl-pipeline/venv/Scripts/uvicorn"),
                 "server:app", "--host", "0.0.0.0", "--port", "8001"],
        "health": "http://127.0.0.1:8001/docs",
        "train_url": "http://127.0.0.1:8001/api/rl/multi/train",
        "train_body": b'{"force_restart":false}',
        "status_url": "http://127.0.0.1:8001/api/rl/multi/status",
        "running_key": "is_running",
    },
    {
        "name": "report-service",
        "port": 8002,
        "cwd":  BASE / "report-service",
        "cmd":  [str(BASE / "report-service/venv/Scripts/uvicorn"),
                 "server:app", "--host", "0.0.0.0", "--port", "8002"],
        "health": "http://127.0.0.1:8002/api/report/health",
        "train_url": "http://127.0.0.1:8002/api/report/rl/multi/train",
        "train_body": b'{"force_restart":false}',
        "status_url": "http://127.0.0.1:8002/api/report/rl/multi/status",
        "running_key": "is_running",
    },
    {
        "name": "sar-server",
        "port": 8003,
        "cwd":  BASE,
        "cmd":  [sys.executable, str(BASE / "sar_server.py")],
        "health": "http://127.0.0.1:8003/",
        "train_url": "http://127.0.0.1:8003/api/sar/train",
        "train_body": b'{"max_iterations":3,"epochs":30,"device":"cpu"}',
        "status_url": "http://127.0.0.1:8003/api/sar/status",
        "running_key": "is_training",
    },
    {
        "name": "ml-training",
        "port": 8004,
        "cwd":  BASE / "ml-pipeline",
        "cmd":  [str(BASE / "ml-pipeline/venv/Scripts/uvicorn"),
                 "train_server:app", "--host", "0.0.0.0", "--port", "8004"],
        "health": "http://127.0.0.1:8004/api/ml/health",
        "train_url": "http://127.0.0.1:8004/api/ml/train",
        "train_body": b'{}',
        "status_url": "http://127.0.0.1:8004/api/ml/status",
        "running_key": "is_running",
    },
]

_procs: dict[str, subprocess.Popen] = {}


def _get(url, timeout=3):
    try:
        with ur.urlopen(url, timeout=timeout) as r:
            return json.loads(r.read())
    except:
        return None


def _post(url, body=b'{}', timeout=5):
    try:
        req = ur.Request(url, data=body,
                         headers={"Content-Type": "application/json"}, method="POST")
        with ur.urlopen(req, timeout=timeout) as r:
            return r.status
    except:
        return None


def start_server(s):
    name = s["name"]
    log.info(f"[START] {name}")
    p = subprocess.Popen(
        s["cmd"],
        cwd=str(s["cwd"]),
        stdout=open(str(LOGS / f"{name}.log"), "a", encoding="utf-8"),
        stderr=subprocess.STDOUT,
        creationflags=subprocess.CREATE_NO_WINDOW,  # 창 없이
    )
    _procs[name] = p
    return p


def ensure_servers():
    """서버가 죽어 있으면 재시작"""
    for s in SERVERS:
        alive = _get(s["health"]) is not None
        if not alive:
            # 기존 프로세스 종료
            old = _procs.get(s["name"])
            if old:
                try: old.terminate()
                except: pass
            start_server(s)
            log.info(f"[RESTART] {s['name']} 재시작됨")
            time.sleep(5)


def ensure_training():
    """학습이 멈춰 있으면 트리거"""
    time.sleep(10)  # 서버 기동 후 안정화
    for s in SERVERS:
        status = _get(s["status_url"])
        if status is None:
            continue
        is_running = status.get(s["running_key"], False)
        if not is_running:
            result = _post(s["train_url"], s["train_body"])
            log.info(f"[TRIGGER] {s['name']} 학습 트리거 → HTTP {result}")


def main():
    log.info("=" * 50)
    log.info("Watchdog 시작")
    log.info("=" * 50)

    # 최초 기동
    for s in SERVERS:
        if _get(s["health"]) is None:
            start_server(s)

    time.sleep(30)
    ensure_training()

    CHECK_INTERVAL = 300  # 5분마다 체크

    while True:
        try:
            ensure_servers()
            ensure_training()
            log.info("[CHECK] 헬스체크 완료")
        except Exception as e:
            log.error(f"[ERROR] {e}")
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()
