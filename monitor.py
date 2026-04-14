"""
monitor.py — 강화학습 실시간 진행 모니터
실행: python monitor.py
"""
import os, sys, json, glob, time, re
from datetime import datetime, timedelta
from pathlib import Path
from urllib import request, error as url_error

BASE = Path(__file__).parent
RL_MODELS     = BASE / "rl-pipeline" / "models"
REPORT_DATA   = BASE / "report-service" / "data"
SAR_META      = BASE / "backend" / "pipeline" / "models" / "iceberg_yolov8_meta.json"

MAX_ITER_RL   = 15      # rl-pipeline 목표 반복 수
MAX_ITER_DEP  = 15      # report-service 목표 반복 수
STEPS_PER_ITER_RL  = 500_000   # easy 100k + medium 200k + hard 200k
STEPS_PER_ITER_DEP = 250_000   # easy 50k + medium 100k + hard 100k
REFRESH = 15            # 화면 갱신 주기 (초)

# ── 색상 코드 ─────────────────────────────────────────────────
R  = "\033[91m"
G  = "\033[92m"
Y  = "\033[93m"
B  = "\033[94m"
C  = "\033[96m"
W  = "\033[97m"
DIM = "\033[2m"
RST = "\033[0m"
BOLD = "\033[1m"

def bar(ratio: float, width: int = 24) -> str:
    filled = int(ratio * width)
    pct = ratio * 100
    color = G if pct >= 70 else Y if pct >= 30 else R
    return f"{color}{'█' * filled}{'░' * (width - filled)}{RST} {pct:5.1f}%"

def eta_str(seconds: float) -> str:
    if seconds <= 0:
        return "—"
    td = timedelta(seconds=int(seconds))
    h, rem = divmod(td.seconds + td.days * 86400, 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

def fetch_api(url: str) -> dict | None:
    try:
        with request.urlopen(url, timeout=4) as r:
            return json.loads(r.read())
    except Exception:
        return None

# ── 체크포인트에서 현재 스텝 추정 ─────────────────────────────
def latest_ckpt_step(ckpt_dir: Path) -> int:
    """sac_ckpt_NNNNN_steps.zip 중 가장 큰 N 반환."""
    if not ckpt_dir.exists():
        return 0
    best = 0
    for f in ckpt_dir.iterdir():
        m = re.search(r'(\d+)_steps', f.name)
        if m:
            best = max(best, int(m.group(1)))
    return best

def ckpt_mtime(ckpt_dir: Path) -> float:
    """체크포인트 폴더에서 가장 최근 파일 mtime."""
    if not ckpt_dir.exists():
        return 0.0
    mtimes = [f.stat().st_mtime for f in ckpt_dir.iterdir() if f.is_file()]
    return max(mtimes) if mtimes else 0.0

# ── rl-pipeline 상태 읽기 ─────────────────────────────────────
def read_rl_pipeline():
    """84개 모델 상태를 파일 + API에서 읽기."""
    api = fetch_api("http://127.0.0.1:8001/api/rl/multi/status")
    api_models = (api or {}).get("models", {})
    server_alive = api is not None

    history_files = list(RL_MODELS.glob("iterative_history_*.json"))
    models = {}

    for hf in history_files:
        key = hf.stem.replace("iterative_history_", "")
        try:
            history = json.loads(hf.read_text(encoding="utf-8"))
        except Exception:
            history = []

        completed_iter = len(history)
        converged = history[-1].get("converged", False) if history else False

        # 평균 반복 시간 (완료된 것 기준)
        durations = [h.get("duration_seconds", 0) for h in history if h.get("duration_seconds", 0) > 0]
        avg_dur = sum(durations) / len(durations) if durations else None

        # 체크포인트로 현재 스텝 추정
        ckpt_dir = RL_MODELS / f"sac_{key}" / "checkpoints"
        cur_step = latest_ckpt_step(ckpt_dir)
        ckpt_mt  = ckpt_mtime(ckpt_dir)

        # API에서 is_running 가져오기
        api_info   = api_models.get(key, {})
        is_running = api_info.get("is_running", False)

        # 현재 반복이 진행 중이면 스텝 기반 진행률 계산
        # (완료된 iter 이후의 스텝은 현재 iter 내 진행)
        within_step = cur_step % STEPS_PER_ITER_RL if cur_step > 0 else 0
        within_ratio = min(within_step / STEPS_PER_ITER_RL, 1.0) if within_step else 0.0

        # 현재 stage 추정
        if within_step < 100_000:
            stage = "easy"
        elif within_step < 300_000:
            stage = "medium"
        else:
            stage = "hard"

        # ETA 계산
        remaining_iter = MAX_ITER_RL - completed_iter
        eta_sec = None
        if avg_dur and remaining_iter > 0:
            eta_sec = avg_dur * remaining_iter - (within_ratio * avg_dur)

        models[key] = {
            "completed_iter": completed_iter,
            "converged": converged,
            "is_running": is_running,
            "within_ratio": within_ratio,
            "within_step": within_step,
            "stage": stage,
            "eta_sec": eta_sec,
            "ckpt_mtime": ckpt_mt,
            "avg_dur": avg_dur,
        }

    return server_alive, models

# ── report-service 상태 읽기 ─────────────────────────────────
def read_sar_server():
    """SAR 서버(8003) 상태 조회."""
    api = fetch_api("http://127.0.0.1:8003/api/sar/status")
    server_alive = api is not None
    if not server_alive:
        # 서버 없어도 메타 파일로 마지막 학습 정보 표시
        if SAR_META.exists():
            try:
                meta = json.loads(SAR_META.read_text(encoding="utf-8"))
                return False, {
                    "is_training": False, "progress": 100,
                    "stage": f"완료 (epochs={meta.get('epochs','?')})",
                    "trained_at": meta.get("trained_at", ""),
                    "error": None,
                }
            except Exception:
                pass
        return False, None
    return True, api


def read_report_service():
    api = fetch_api("http://127.0.0.1:8002/api/report/rl/multi/status")
    server_alive = api is not None
    api_models = (api or {}).get("models", {})

    history_files = list(REPORT_DATA.glob("departure_iterative_history_*.json"))
    models = {}
    ckpt_dir_base = REPORT_DATA / "departure_rl_model" / "checkpoints"

    # 전체 공유 체크포인트 (출항 RL은 모델별 별도 ckpt 없음 — 공유)
    shared_step = latest_ckpt_step(ckpt_dir_base)
    shared_mt   = ckpt_mtime(ckpt_dir_base)

    for hf in history_files:
        key = hf.stem.replace("departure_iterative_history_", "")
        try:
            history = json.loads(hf.read_text(encoding="utf-8"))
        except Exception:
            history = []

        completed_iter = len(history)
        converged = history[-1].get("converged", False) if history else False
        durations = [h.get("duration_seconds", 0) for h in history if h.get("duration_seconds", 0) > 0]
        avg_dur = sum(durations) / len(durations) if durations else None

        api_key = key.replace("_", " ", 1) if "IA_Super" not in key else key
        api_info   = api_models.get(key, {})
        is_running = api_info.get("is_running", False)

        within_step  = shared_step % STEPS_PER_ITER_DEP if shared_step > 0 else 0
        within_ratio = min(within_step / STEPS_PER_ITER_DEP, 1.0) if within_step else 0.0

        if within_step < 50_000:
            stage = "easy"
        elif within_step < 150_000:
            stage = "medium"
        else:
            stage = "hard"

        remaining_iter = MAX_ITER_DEP - completed_iter
        eta_sec = None
        if avg_dur and remaining_iter > 0:
            eta_sec = avg_dur * remaining_iter - (within_ratio * avg_dur)

        models[key] = {
            "completed_iter": completed_iter,
            "converged": converged,
            "is_running": is_running,
            "within_ratio": within_ratio,
            "within_step": within_step,
            "stage": stage,
            "eta_sec": eta_sec,
            "ckpt_mtime": shared_mt,
            "avg_dur": avg_dur,
        }

    return server_alive, models

# ── 화면 그리기 ────────────────────────────────────────────────
def render():
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = []
    lines.append(f"\033[2J\033[H")   # 화면 클리어 + 커서 홈
    lines.append(f"{BOLD}{C}{'═'*72}{RST}")
    lines.append(f"{BOLD}{C}  강화학습 실시간 모니터   {DIM}{now}{RST}")
    lines.append(f"{BOLD}{C}{'═'*72}{RST}")

    # ── rl-pipeline ──────────────────────────────────────────
    rl_alive, rl_models = read_rl_pipeline()
    status_txt = f"{G}ALIVE{RST}" if rl_alive else f"{R}HTTP FROZEN (스레드는 실행중){RST}"
    lines.append(f"\n{BOLD}{W}[ RL-PIPELINE  포트 8001 ]  서버: {status_txt}{RST}")
    lines.append(f"{DIM}  빙산회피 SAC  84 노선 × 최대 {MAX_ITER_RL}회 반복{RST}\n")

    if rl_models:
        total_done = sum(m["completed_iter"] for m in rl_models.values())
        total_goal = len(rl_models) * MAX_ITER_RL
        converged  = sum(1 for m in rl_models.values() if m["converged"])
        overall    = total_done / total_goal if total_goal else 0

        lines.append(f"  전체 진행: {bar(overall, 30)}  ({total_done}/{total_goal} iter, 수렴 {converged}개)")

        # 현재 활발하게 움직이는 모델 (ckpt 최근 수정 기준 상위 6개)
        now_ts = time.time()
        active = sorted(
            [(k, v) for k, v in rl_models.items()
             if v["ckpt_mtime"] > 0 and now_ts - v["ckpt_mtime"] < 3600],
            key=lambda x: x[1]["ckpt_mtime"], reverse=True
        )[:6]

        if active:
            lines.append(f"\n  {BOLD}현재 학습 중 (체크포인트 최신 기준){RST}")
            lines.append(f"  {'모델':<30} {'반복':^10} {'스텝진행':^30} {'스테이지':^8} {'ETA':>10}")
            lines.append(f"  {'─'*30} {'─'*10} {'─'*30} {'─'*8} {'─'*10}")
            for key, m in active:
                iter_txt = f"{m['completed_iter']}/{MAX_ITER_RL}"
                step_bar = bar(m["within_ratio"], 18)
                eta = eta_str(m["eta_sec"]) if m["eta_sec"] else "계산중"
                stage_col = Y if m["stage"] == "medium" else R if m["stage"] == "hard" else G
                lines.append(f"  {key:<30} {iter_txt:^10} {step_bar}  {stage_col}{m['stage']:^8}{RST} {eta:>10}")

        # 완료된 모델 요약
        fully_done = [k for k, v in rl_models.items() if v["completed_iter"] >= MAX_ITER_RL]
        if fully_done:
            lines.append(f"\n  {G}완료된 모델: {len(fully_done)}개{RST}")
    else:
        lines.append(f"  {Y}히스토리 파일 없음 — 아직 첫 iter 진행중{RST}")

    # ── report-service ────────────────────────────────────────
    rp_alive, rp_models = read_report_service()
    status_txt2 = f"{G}ALIVE{RST}" if rp_alive else f"{R}HTTP FROZEN (스레드는 실행중){RST}"
    lines.append(f"\n{BOLD}{W}[ REPORT-SERVICE  포트 8002 ]  서버: {status_txt2}{RST}")
    lines.append(f"{DIM}  출항 스케줄링 SAC  28 조합 × 최대 {MAX_ITER_DEP}회 반복  (4개씩 배치){RST}\n")

    if rp_models:
        total_done2 = sum(m["completed_iter"] for m in rp_models.values())
        total_goal2 = len(rp_models) * MAX_ITER_DEP
        overall2    = total_done2 / total_goal2 if total_goal2 else 0
        lines.append(f"  전체 진행: {bar(overall2, 30)}  ({total_done2}/{total_goal2} iter)")

        now_ts = time.time()
        active2 = sorted(
            [(k, v) for k, v in rp_models.items()
             if v["ckpt_mtime"] > 0 and now_ts - v["ckpt_mtime"] < 3600],
            key=lambda x: x[1]["ckpt_mtime"], reverse=True
        )[:4]

        if active2:
            lines.append(f"\n  {BOLD}현재 학습 중{RST}")
            lines.append(f"  {'모델':<28} {'반복':^10} {'스텝진행':^30} {'ETA':>10}")
            lines.append(f"  {'─'*28} {'─'*10} {'─'*30} {'─'*10}")
            for key, m in active2:
                iter_txt = f"{m['completed_iter']}/{MAX_ITER_DEP}"
                step_bar = bar(m["within_ratio"], 18)
                eta = eta_str(m["eta_sec"]) if m["eta_sec"] else "계산중"
                lines.append(f"  {key:<28} {iter_txt:^10} {step_bar}  {eta:>10}")
    else:
        lines.append(f"  {Y}히스토리 파일 없음 — 아직 첫 iter 진행중{RST}")

    # ── SAR 서버 ─────────────────────────────────────────────
    sar_alive, sar = read_sar_server()
    sar_status_txt = f"{G}ALIVE{RST}" if sar_alive else f"{DIM}미실행{RST}"
    lines.append(f"\n{BOLD}{W}[ SAR-SERVER  포트 8003 ]  서버: {sar_status_txt}{RST}")
    lines.append(f"{DIM}  YOLOv8 빙산 탐지 딥러닝{RST}\n")
    if sar:
        stage = sar.get("stage", "")
        prog  = sar.get("progress", 0)
        err   = sar.get("error")
        trained_at = sar.get("trained_at", "")
        if err:
            lines.append(f"  {R}에러: {err}{RST}")
        elif prog == 100 or "완료" in stage:
            lines.append(f"  {G}학습 완료{RST}  {DIM}{trained_at}{RST}")
        else:
            lines.append(f"  진행: {bar(prog/100, 30)}  {stage}")
    else:
        lines.append(f"  {DIM}학습 이력 없음{RST}")

    # ── 푸터 ─────────────────────────────────────────────────
    lines.append(f"\n{BOLD}{C}{'═'*72}{RST}")
    lines.append(f"{DIM}  갱신 주기 {REFRESH}초  |  Ctrl+C 로 종료{RST}\n")

    print("".join(lines))

# ── 메인 루프 ─────────────────────────────────────────────────
if __name__ == "__main__":
    # Windows 터미널 UTF-8 강제 설정
    if sys.platform == "win32":
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print("모니터 시작 중...")
    try:
        while True:
            render()
            time.sleep(REFRESH)
    except KeyboardInterrupt:
        print("\n모니터 종료.")
