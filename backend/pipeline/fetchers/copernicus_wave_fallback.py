#!/usr/bin/env python3
"""
Copernicus Marine Service - Wave Height Fallback

Open-Meteo Marine API가 커버하지 못하는 해역의 파고 데이터를
Copernicus 제품으로 보충.

1차: Arctic Wave (3km, 1시간) — 고위도 북극 해역
2차: Global Wave (0.083°, 3시간) — 나머지 전역

Product (Arctic) : ARCTIC_ANALYSIS_FORECAST_WAV_002_014
Dataset (Arctic) : dataset-wam-arctic-1hr3km-be
Product (Global) : GLOBAL_ANALYSISFORECAST_WAV_001_027
Dataset (Global) : cmems_mod_glo_wav_anfc_0.083deg_PT3H-i_202411
Variable         : VHM0 (Spectral significant wave height, m)
"""

from datetime import datetime, timedelta, timezone
from pathlib import Path

# ─── 설정 ────────────────────────────────────────────────────────────
ARCTIC_DATASET_ID = "dataset-wam-arctic-1hr3km-be"
GLOBAL_DATASET_ID = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i"
WAVE_VARIABLE = "VHM0"


def _copernicus_available() -> bool:
    """Copernicus Marine 인증 상태 확인."""
    cred_paths = [
        Path.home() / ".copernicusmarine" / ".copernicusmarine-credentials",
        Path.home() / ".copernicusmarine" / "credentials",
        Path.home() / ".motuclient-python" / "motuclient-python.ini",
    ]
    return any(p.exists() for p in cred_paths)


def _compute_bbox(wps: list[dict]) -> tuple[float, float, float, float]:
    """웨이포인트 목록에서 bounding box 계산 (안티메리디안 고려)."""
    lats = [wp["lat"] for wp in wps]
    lons = [wp["lon"] for wp in wps]

    min_lat = min(lats) - 0.5
    max_lat = max(lats) + 0.5

    has_pos = any(ln > 0 for ln in lons)
    has_neg = any(ln < 0 for ln in lons)
    if has_pos and has_neg and (max(lons) - min(lons)) > 180:
        min_lon, max_lon = -180.0, 180.0
    else:
        min_lon = min(lons) - 0.5
        max_lon = max(lons) + 0.5

    return min_lat, max_lat, min_lon, max_lon


def _open_wave_dataset(dataset_id: str, wps: list[dict], target_dt: datetime):
    """Copernicus Wave 데이터셋 오픈 (lazy loading)."""
    import copernicusmarine

    min_lat, max_lat, min_lon, max_lon = _compute_bbox(wps)
    time_str = target_dt.strftime("%Y-%m-%dT%H:%M:%S")

    return copernicusmarine.open_dataset(
        dataset_id=dataset_id,
        variables=[WAVE_VARIABLE],
        minimum_latitude=min_lat,
        maximum_latitude=max_lat,
        minimum_longitude=min_lon,
        maximum_longitude=max_lon,
        start_datetime=time_str,
        end_datetime=time_str,
    )


def _nearest_wave_height(ds, lat: float, lon: float) -> float | None:
    """데이터셋에서 (lat, lon) 최근접 격자점의 VHM0 값 추출."""
    import numpy as np

    try:
        val = ds[WAVE_VARIABLE].sel(
            latitude=lat, longitude=lon, method="nearest"
        )
        if "time" in val.dims:
            val = val.isel(time=-1)
        v = float(val.values)
        if np.isfinite(v) and v >= 0:
            return round(v, 2)
    except Exception:
        pass
    return None


def _fill_from_dataset(dataset_id: str, label: str,
                       wp_results: list[dict], null_indices: list[int],
                       target_dt: datetime) -> list[int]:
    """주어진 데이터셋으로 null 웨이포인트 보충. 여전히 null인 인덱스 반환."""
    null_wps = [wp_results[i] for i in null_indices]
    try:
        print(f"    [{label}] querying {len(null_wps)} null waypoints...")
        ds = _open_wave_dataset(dataset_id, null_wps, target_dt)

        filled = 0
        still_null = []
        for i in null_indices:
            wp = wp_results[i]
            val = _nearest_wave_height(ds, wp["lat"], wp["lon"])
            if val is not None:
                wp["wave_height_m"] = val
                wp["wave_source"] = "copernicus"
                filled += 1
            else:
                still_null.append(i)

        ds.close()
        print(f"    [{label}] filled {filled}/{len(null_wps)} waypoints")
        return still_null
    except Exception as e:
        print(f"    [WARN] {label} failed: {e}")
        return null_indices


def fill_wave_heights(wp_results: list[dict]) -> list[dict]:
    """Open-Meteo에서 null인 웨이포인트의 파고를 Copernicus로 보충.

    1차: Arctic Wave (고위도 전용, 3km 고해상도)
    2차: Global Wave (전역, 0.083° 해상도) — 1차에서 못 채운 지점
    실패 시 원본을 그대로 반환.
    """
    null_indices = [i for i, wp in enumerate(wp_results)
                    if wp.get("wave_height_m") is None]
    if not null_indices:
        return wp_results

    try:
        import copernicusmarine  # noqa: F401
    except ImportError:
        print("    [WARN] copernicusmarine not installed - skipping wave fallback")
        return wp_results

    if not _copernicus_available():
        print("    [WARN] Copernicus credentials missing - skipping wave fallback")
        return wp_results

    target_dt = datetime.now(timezone.utc) - timedelta(hours=3)

    # 1차: Arctic Wave (lat >= 41°N 커버리지)
    arctic_indices = [i for i in null_indices if wp_results[i]["lat"] >= 41.0]
    other_indices = [i for i in null_indices if wp_results[i]["lat"] < 41.0]

    still_null = []
    if arctic_indices:
        still_null = _fill_from_dataset(
            ARCTIC_DATASET_ID, "Copernicus Arctic Wave",
            wp_results, arctic_indices, target_dt,
        )
    still_null.extend(other_indices)

    # 2차: Global Wave — 아직 null인 지점 보충
    if still_null:
        still_null = _fill_from_dataset(
            GLOBAL_DATASET_ID, "Copernicus Global Wave",
            wp_results, still_null, target_dt,
        )

    return wp_results
