"""What-if 분석 운영 로거 — JSONL append-only.

Logs:
  - data/whatif_run_log.jsonl  : 매 분석 실행 기록 (request + summary)
"""
import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

_LOG_DIR = Path(__file__).parent.parent / "data"
_RUN_LOG = _LOG_DIR / "whatif_run_log.jsonl"
_lock = threading.Lock()


def _ensure_dir():
    _LOG_DIR.mkdir(parents=True, exist_ok=True)


def _now() -> str:
    return datetime.utcnow().isoformat() + "Z"


def log_run(request: dict, summary: dict, latency_ms: float):
    """What-if 1회 실행 결과를 jsonl에 append.

    summary는 다음 키를 포함하면 통계에 활용:
      total_iterations, convergence_status, best_quality, scenarios_count
    """
    _ensure_dir()
    row = {
        "ts": _now(),
        "kind": "whatif_run",
        "request": request,
        "summary": summary,
        "latency_ms": round(latency_ms, 2),
    }
    with _lock:
        with _RUN_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return rows


def get_stats() -> dict:
    """집계 통계 반환."""
    runs = _read_jsonl(_RUN_LOG)
    n = len(runs)
    if n == 0:
        return {
            "n_runs": 0,
            "by_route": {},
            "by_ice_class": {},
            "convergence_dist": {},
            "avg_iterations": 0.0,
            "avg_scenarios": 0.0,
            "avg_latency_ms": 0.0,
            "logs_at": str(_RUN_LOG),
        }

    by_route = {}
    by_ice_class = {}
    conv_dist = {}
    iter_sum, sc_sum, lat_sum = 0, 0, 0.0
    iter_n, sc_n, lat_n = 0, 0, 0

    for r in runs:
        req = r.get("request", {})
        route = req.get("route") or "?"
        ice_class = req.get("ice_class") or "?"
        by_route[route] = by_route.get(route, 0) + 1
        by_ice_class[ice_class] = by_ice_class.get(ice_class, 0) + 1

        s = r.get("summary", {})
        cs = s.get("convergence_status") or "unknown"
        conv_dist[cs] = conv_dist.get(cs, 0) + 1

        if isinstance(s.get("total_iterations"), int):
            iter_sum += s["total_iterations"]; iter_n += 1
        bq = s.get("best_quality") or {}
        if isinstance(bq.get("scenarios_count"), int):
            sc_sum += bq["scenarios_count"]; sc_n += 1
        if isinstance(r.get("latency_ms"), (int, float)):
            lat_sum += r["latency_ms"]; lat_n += 1

    return {
        "n_runs": n,
        "by_route": by_route,
        "by_ice_class": by_ice_class,
        "convergence_dist": conv_dist,
        "avg_iterations": round(iter_sum / iter_n, 2) if iter_n else 0.0,
        "avg_scenarios": round(sc_sum / sc_n, 2) if sc_n else 0.0,
        "avg_latency_ms": round(lat_sum / lat_n, 2) if lat_n else 0.0,
        "logs_at": str(_RUN_LOG),
    }
