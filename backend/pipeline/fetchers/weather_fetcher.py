#!/usr/bin/env python3
"""
MET Norway Arctic Weather Fetcher
==================================
NSR(북극항로) 핵심 7개 구간의 실시간 기상 데이터를 수집합니다.

데이터 소스: MET Norway API (노르웨이 기상청, CC BY 4.0)
  - Ocean Forecast API : 파고 (sea_surface_wave_significant_height)
  - Location Forecast  : 기온 (air_temperature), 안개율 -> 가시거리 환산

  가시거리 환산: visibility_km = max(0.1, 20.0 * (1 - fog_area_fraction))
    fog=0.0 -> 20.0km | fog=0.5 -> 10.0km | fog=0.9 -> 2.0km

사용법:
  python weather_fetcher.py              # 최신 데이터 수집
  python weather_fetcher.py --dry-run    # API 호출 없이 설정만 확인
  python weather_fetcher.py --schedule   # 매일 03:30 UTC 자동 실행

출력: ../../data/arctic_weather_latest.json
"""

from __future__ import annotations

import argparse
import json
import ssl
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen, Request


def _ssl_context() -> ssl.SSLContext:
    """Return an SSL context using certifi CA bundle if available."""
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        ctx = ssl.create_default_context()
    return ctx


SSL_CTX = _ssl_context()

# --- Configuration -----------------------------------------------------------
OUTPUT_DIR = Path(__file__).parent.parent.parent / "data"

WAYPOINTS: list[dict] = [
    {"name": "Kola Bay",           "lat": 69.0,  "lon":  33.0},
    {"name": "Novaya Zemlya",      "lat": 70.5,  "lon":  57.5},
    {"name": "Kara Sea",           "lat": 73.5,  "lon":  80.0},
    {"name": "Vilkitsky Strait",   "lat": 77.7,  "lon": 103.7},  # critical
    {"name": "Laptev Sea",         "lat": 75.5,  "lon": 127.0},
    {"name": "East Siberian Sea",  "lat": 73.5,  "lon": 162.0},
    {"name": "Bering Strait",      "lat": 66.5,  "lon":-169.5},
]

OCEAN_API_BASE    = "https://api.met.no/weatherapi/oceanforecast/2.0/complete"
FORECAST_API_BASE = "https://api.met.no/weatherapi/locationforecast/2.0/complete"
USER_AGENT        = "ArcticDigitalTwin/1.0"
REQUEST_TIMEOUT   = 15  # seconds


# --- Helpers -----------------------------------------------------------------

def _http_get(url: str) -> dict:
    """HTTP GET with User-Agent header -> JSON dict (stdlib only)."""
    try:
        req = Request(url, headers={"User-Agent": USER_AGENT})
        with urlopen(req, timeout=REQUEST_TIMEOUT, context=SSL_CTX) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {url}") from e
    except URLError as e:
        raise RuntimeError(f"URL Error: {e.reason}") from e


def _find_current_entry(timeseries: list[dict]) -> dict:
    """
    MET Norway timeseries에서 현재 UTC 시각 이후 첫 항목을 반환.
    형식: "2026-04-06T12:00:00Z"
    """
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00:00Z")
    for entry in timeseries:
        if entry.get("time", "") >= now_str:
            return entry
    return timeseries[-1]  # fallback: last entry


# --- API calls ---------------------------------------------------------------

def fetch_wave_height(lat: float, lon: float) -> float | None:
    """MET Norway Ocean Forecast에서 유의파고(m) 조회."""
    url = f"{OCEAN_API_BASE}?lat={lat}&lon={lon}"
    data = _http_get(url)

    timeseries = data.get("properties", {}).get("timeseries", [])
    if not timeseries:
        return None

    entry = _find_current_entry(timeseries)
    val = (
        entry
        .get("data", {})
        .get("instant", {})
        .get("details", {})
        .get("sea_surface_wave_significant_height")
    )
    return round(float(val), 2) if val is not None else None


def fetch_forecast(lat: float, lon: float) -> tuple[float | None, float | None]:
    """MET Norway Location Forecast에서 기온(°C), 가시거리(km) 조회."""
    url = f"{FORECAST_API_BASE}?lat={lat}&lon={lon}"
    data = _http_get(url)

    timeseries = data.get("properties", {}).get("timeseries", [])
    if not timeseries:
        return None, None

    entry = _find_current_entry(timeseries)
    details = entry.get("data", {}).get("instant", {}).get("details", {})

    temp_raw = details.get("air_temperature")
    fog_raw  = details.get("fog_area_fraction")

    temp_c = round(float(temp_raw), 1) if temp_raw is not None else None

    vis_km = None
    if fog_raw is not None:
        fog_fraction = float(fog_raw) / 100.0  # MET Norway: 0-100 percentage
        vis_km = round(max(0.1, 20.0 * (1.0 - fog_fraction)), 2)

    return temp_c, vis_km


# --- Main collection logic ---------------------------------------------------

def fetch_all_waypoints(dry_run: bool = False) -> list[dict]:
    """7개 기준점 순회하며 기상 데이터 수집."""
    results = []

    for wp in WAYPOINTS:
        name = wp["name"]
        lat  = wp["lat"]
        lon  = wp["lon"]

        print(f"  [{name}] lat={lat}, lon={lon} ...", end=" ", flush=True)

        if dry_run:
            print("(dry-run skipped)")
            results.append({
                "name": name, "lat": lat, "lon": lon,
                "wave_height_m": None,
                "temperature_c": None,
                "visibility_km": None,
            })
            continue

        wave       = None
        temp       = None
        vis        = None
        wave_error = None
        cast_error = None

        try:
            wave = fetch_wave_height(lat, lon)
        except RuntimeError as e:
            wave_error = str(e)

        try:
            temp, vis = fetch_forecast(lat, lon)
        except RuntimeError as e:
            cast_error = str(e)

        parts = []
        if wave is not None: parts.append(f"wave={wave}m")
        if temp is not None: parts.append(f"temp={temp}C")
        if vis  is not None: parts.append(f"vis={vis}km")
        print(", ".join(parts) if parts else "no data")
        if wave_error: print(f"    [WARN] Ocean Forecast: {wave_error}")
        if cast_error: print(f"    [WARN] Location Forecast: {cast_error}")

        results.append({
            "name":          name,
            "lat":           lat,
            "lon":           lon,
            "wave_height_m": wave,
            "temperature_c": temp,
            "visibility_km": vis,
        })

        time.sleep(0.5)  # MET Norway: polite interval between calls

    return results


def compute_route_summary(waypoints: list[dict]) -> dict:
    """항로 전체 최악값 집계."""
    waves = [w["wave_height_m"] for w in waypoints if w["wave_height_m"] is not None]
    temps = [w["temperature_c"] for w in waypoints if w["temperature_c"] is not None]
    visib = [w["visibility_km"] for w in waypoints if w["visibility_km"] is not None]

    max_wave = round(max(waves), 2) if waves else None
    min_temp = round(min(temps), 1) if temps else None
    min_vis  = round(min(visib), 2) if visib else None

    return {
        "max_wave_height_m":      max_wave,
        "min_temperature_c":      min_temp,
        "min_visibility_km":      min_vis,
        "is_temp_below_minus_10": (min_temp < -10.0) if min_temp is not None else False,
    }


def run(dry_run: bool = False) -> int:
    """메인 실행. 성공 시 0, 실패 시 1 반환."""
    print(f"\n{'='*60}")
    print("  MET Norway Arctic Weather Fetcher")
    print(f"  Dry-run: {dry_run}")
    print(f"{'='*60}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    out_file = OUTPUT_DIR / "arctic_weather_latest.json"

    print("\n[1/3] NSR waypoint weather collection...")
    waypoints = fetch_all_waypoints(dry_run=dry_run)

    print("\n[2/3] Route worst-case aggregation...")
    summary = compute_route_summary(waypoints)
    print(f"  max wave   : {summary['max_wave_height_m']}m")
    print(f"  min temp   : {summary['min_temperature_c']}C")
    print(f"  min vis    : {summary['min_visibility_km']}km")
    print(f"  below -10C : {summary['is_temp_below_minus_10']}")

    output = {
        "fetched_at":    datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source":        "MET Norway (Ocean Forecast 2.0 + Location Forecast 2.0)",
        "dry_run":       dry_run,
        "waypoints":     waypoints,
        "route_summary": summary,
    }

    print(f"\n[3/3] Saving: {out_file}")
    if not dry_run:
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)
        print("  [OK] arctic_weather_latest.json saved")
    else:
        print("  (dry-run: file write skipped)")

    return 0


# --- CLI ---------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="MET Norway Arctic Weather Fetcher for NSR Digital Twin"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="API 호출 및 파일 저장 없이 설정만 확인"
    )
    parser.add_argument(
        "--schedule", action="store_true",
        help="매일 03:30 UTC 자동 실행 모드 (무한 루프)"
    )
    args = parser.parse_args()

    if args.schedule:
        import sched
        scheduler = sched.scheduler(time.time, time.sleep)

        def _scheduled_run():
            run(dry_run=False)
            scheduler.enter(86400, 1, _scheduled_run)

        print("[Scheduler] 매일 03:30 UTC 기상 데이터 수집 예약됨")
        print("[Scheduler] 즉시 1회 실행 후 24시간마다 반복...")
        scheduler.enter(0, 1, _scheduled_run)
        scheduler.run()
    else:
        rc = run(dry_run=args.dry_run)
        sys.exit(rc)


if __name__ == "__main__":
    main()
