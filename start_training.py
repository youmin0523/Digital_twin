"""
start_training.py — 전체 학습 서버 통합 시작 스크립트

실행: python start_training.py
  - rl-pipeline    (포트 8001) : 빙산회피 SAC 84 노선
  - report-service (포트 8002) : 출항 스케줄링 SAC 28 조합
  - sar_server     (포트 8003) : YOLOv8 SAR 딥러닝

각 서버를 독립 프로세스로 기동 후 학습 자동 트리거.
"""
import subprocess, sys, time, json, os
from pathlib import Path
from urllib import request as urllib_request, error as urllib_error

BASE = Path(__file__).parent

# ── 설정 ──────────────────────────────────────────────────────
SERVERS = [
    {
        "name": "rl-pipeline",
        "port": 8001,
        "cwd":  BASE / "rl-pipeline",
        "cmd":  ["venv/Scripts/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"],
        "health": "http://127.0.0.1:8001/docs",
    },
    {
        "name": "report-service",
        "port": 8002,
        "cwd":  BASE / "report-service",
        "cmd":  ["venv/Scripts/uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8002"],
        "health": "http://127.0.0.1:8002/api/report/health",
    },
    {
        "name": "sar-server",
        "port": 8003,
        "cwd":  BASE,
        "cmd":  [sys.executable, "sar_server.py"],
        "health": "http://127.0.0.1:8003/",
    },
]

TRAIN_TRIGGERS = [
    {
        "name": "빙산회피 RL (84 노선 × 15 iter)",
        "url":  "http://127.0.0.1:8001/api/rl/multi/train",
        "body": {"max_iterations": 15, "target_success_rate": 0.85,
                 "target_collision_rate": 0.05, "eval_episodes": 100,
                 "eval_difficulty": "hard"},
    },
    {
        "name": "출항 스케줄링 RL (28 조합 × 15 iter)",
        "url":  "http://127.0.0.1:8002/api/report/rl/multi/train",
        "body": {"max_iterations": 15, "target_success_rate": 0.85,
                 "target_prohibitive_rate": 0.05, "eval_episodes": 100},
    },
    {
        "name": "SAR YOLOv8 딥러닝 (30 epoch)",
        "url":  "http://127.0.0.1:8003/api/sar/train",
        "body": {"epochs": 30, "batch_size": 4, "synthetic_count": 200, "device": "cpu"},
    },
]

# ── 유틸 ──────────────────────────────────────────────────────
def port_in_use(port: int) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def health_check(url: str, timeout: int = 5) -> bool:
    try:
        urllib_request.urlopen(url, timeout=timeout)
        return True
    except Exception:
        return False

def post_json(url: str, body: dict) -> dict | None:
    data = json.dumps(body).encode()
    req = urllib_request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib_request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib_error.HTTPError as e:
        return json.loads(e.read())
    except Exception as e:
        return {"error": str(e)}

# ── 서버 기동 ─────────────────────────────────────────────────
def start_servers():
    procs = []
    for srv in SERVERS:
        if port_in_use(srv["port"]):
            print(f"  [{srv['name']}] 포트 {srv['port']} 이미 사용 중 — 기동 스킵")
            continue

        log_path = BASE / f"logs/{srv['name']}.log"
        log_path.parent.mkdir(exist_ok=True)
        log_file = open(log_path, "a", encoding="utf-8")

        cmd = [str(c) for c in srv["cmd"]]
        proc = subprocess.Popen(
            cmd,
            cwd=str(srv["cwd"]),
            stdout=log_file,
            stderr=log_file,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        procs.append((srv, proc, log_path))
        print(f"  [{srv['name']}] 시작 (PID {proc.pid}) → 로그: {log_path}")

    # 서버 ready 대기
    print("\n서버 준비 대기 중", end="", flush=True)
    deadline = time.time() + 60
    for srv in SERVERS:
        while time.time() < deadline:
            if health_check(srv["health"]):
                print(f"\n  [{srv['name']}:{srv['port']}] ✓ 준비 완료")
                break
            print(".", end="", flush=True)
            time.sleep(3)
        else:
            print(f"\n  [{srv['name']}:{srv['port']}] ✗ 응답 없음 (계속 진행)")

    return procs

# ── 학습 트리거 ────────────────────────────────────────────────
def trigger_training():
    print("\n학습 트리거 중...")
    for t in TRAIN_TRIGGERS:
        result = post_json(t["url"], t["body"])
        msg = result.get("message") or result.get("error") or str(result)
        status = "✓" if "error" not in result else "✗"
        print(f"  [{status}] {t['name']}: {msg}")

# ── 메인 ──────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  강화학습 + 딥러닝 통합 시작 스크립트")
    print("=" * 60)
    print()

    print("[1/2] 서버 기동...")
    procs = start_servers()

    print("\n[2/2] 학습 트리거...")
    trigger_training()

    print("\n" + "=" * 60)
    print("  모든 학습이 시작되었습니다.")
    print("  진행 상황: python monitor.py")
    print("  로그 위치: Digital_twin/logs/")
    print("=" * 60)
