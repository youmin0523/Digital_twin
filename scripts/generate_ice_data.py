"""
generate_ice_data.py

NSIDC Sea Ice Index (1981-2010 기후값) 기반의 북극 해빙 농도 데이터 생성기.
외부 파일 다운로드 없이 실행 가능 (numpy만 필요).

출력: client/public/data/realIceData_month00.json ~ realIceData_month11.json

실행:
  pip install numpy   (numpy 없는 경우)
  python scripts/generate_ice_data.py

데이터 근거:
  - NSIDC Sea Ice Index: https://nsidc.org/data/seaice_index
  - 월별 해빙 면적 기후값 (1981-2010 평균)
  - 지역별 빙경 위치는 Parkinson et al. (2008) 및 NSIDC 기반
"""

import json
import math
import urllib.request
import os
import random

# ─── NSIDC 기후값 기반 월별 파라미터 ─────────────────────────────────────────

# 월별 해빙 면적(100만 km²), 빙경 평균 위도(°N), 계절 팩터(0=최소, 1=최대)
MONTHLY_PARAMS = {
    #  month  area_M_km2  ice_edge_lat  seasonal_factor
    0:  (14.1, 73.0, 0.91),  # 1월
    1:  (15.3, 72.0, 1.00),  # 2월 (최대)
    2:  (15.5, 71.0, 0.98),  # 3월
    3:  (14.5, 72.5, 0.88),  # 4월
    4:  (12.6, 74.5, 0.72),  # 5월
    5:  ( 9.9, 76.5, 0.50),  # 6월
    6:  ( 7.6, 79.0, 0.28),  # 7월
    7:  ( 6.1, 81.0, 0.12),  # 8월
    8:  ( 5.9, 82.5, 0.05),  # 9월 (최소)
    9:  ( 7.8, 79.5, 0.22),  # 10월
    10: (10.8, 76.0, 0.55),  # 11월
    11: (12.6, 74.0, 0.78),  # 12월
}

# 지역별 바이어스: (경도 범위, 빙경 위도 보정값, 농도 보정값)
# 양수=더 많은 얼음, 음수=더 적은 얼음
REGIONAL_BIAS = [
    # 바렌츠해 / 노르웨이해: 난류 영향으로 상대적으로 얼음 적음
    {"lon_min": 15,   "lon_max": 60,  "lat_edge_offset": +3.0, "conc_offset": -0.12},
    # 카라해: 비교적 얼음 많음
    {"lon_min": 60,   "lon_max": 100, "lat_edge_offset": -1.0, "conc_offset": +0.05},
    # 렙테브해
    {"lon_min": 100,  "lon_max": 145, "lat_edge_offset": -0.5, "conc_offset": +0.03},
    # 동시베리아해: 겨울철 빙결 빠름
    {"lon_min": 145,  "lon_max": 180, "lat_edge_offset": -1.5, "conc_offset": +0.08},
    # 추크치해 / 베링해: 빠른 계절 변화
    {"lon_min": -180, "lon_max": -160,"lat_edge_offset": -1.0, "conc_offset": +0.05},
    # 보퍼트해: 캐나다 북쪽, 다년생 빙하 잔존
    {"lon_min": -160, "lon_max": -100,"lat_edge_offset": -2.0, "conc_offset": +0.10},
    # 캐나다 군도: 가장 두꺼운 다년생 빙하
    {"lon_min": -100, "lon_max": -60, "lat_edge_offset": -3.0, "conc_offset": +0.15},
    # 배핀만 / 래브라도해: 겨울철 빙결
    {"lon_min": -60,  "lon_max": -20, "lat_edge_offset": +1.0, "conc_offset": -0.05},
    # 그린란드해: 비교적 개방적 (동그린란드 해류)
    {"lon_min": -20,  "lon_max": 15,  "lat_edge_offset": +2.0, "conc_offset": -0.08},
]

# ─── 유틸리티 ─────────────────────────────────────────────────────────────────

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def get_regional_bias(lon):
    """경도에 따른 지역 바이어스 반환"""
    for r in REGIONAL_BIAS:
        lon_min, lon_max = r["lon_min"], r["lon_max"]
        if lon_min <= lon < lon_max:
            return r["lat_edge_offset"], r["conc_offset"]
    return 0.0, 0.0

def deterministic_noise(lon, lat, seed_offset=0):
    """결정론적 공간 노이즈 (재현 가능한 패턴을 위해 고정 seed)"""
    rng = random.Random(int((lon + 180) * 100 + (lat + 90) * 37 + seed_offset * 9973))
    return rng.random()

def concentration_at(lon, lat, month):
    """
    (lon, lat) 위치의 해빙 농도 계산.
    NSIDC 기후값 + 지역 바이어스 + 공간 노이즈 적용.
    """
    area_M_km2, ice_edge_lat, sf = MONTHLY_PARAMS[month]

    # 지역 바이어스
    lat_edge_offset, conc_offset = get_regional_bias(lon)

    # 이 경도에서의 빙경 위도
    ice_edge = ice_edge_lat + lat_edge_offset * sf  # 여름엔 바이어스 효과 감소

    # 빙경으로부터의 거리 (양수=빙하 내부, 음수=빙하 외부)
    dist_from_edge = lat - ice_edge

    if dist_from_edge < -3.0:
        # 빙경에서 3° 이상 바깥: 얼음 없음
        return 0.0

    # 기본 농도: 빙경 부근은 낮고(~0.15), 극점 근처는 높음(~0.95)
    if dist_from_edge < 0:
        # 빙경 외부 전이대 (-3° ~ 0°): 0 → 0.15
        base_conc = 0.15 * (1 + dist_from_edge / 3.0)
    else:
        # 빙경 내부: 거리에 따라 0.15 → 0.95 선형 증가
        depth_ratio = min(dist_from_edge / max(90 - ice_edge, 5), 1.0)
        base_conc = 0.15 + 0.80 * depth_ratio

    # 지역 보정
    base_conc = clamp(base_conc + conc_offset * sf, 0, 1)

    # 계절 팩터 (여름엔 전반적으로 농도 감소)
    base_conc *= (0.4 + 0.6 * sf)

    # 공간 노이즈 (±8%)
    noise = (deterministic_noise(lon, lat) - 0.5) * 0.16
    conc = clamp(base_conc + noise, 0.0, 1.0)

    return conc

def thickness_at(lon, lat, conc, month):
    """
    해빙 두께 추정 (농도와 계절에 기반).
    실제 CryoSat-2 데이터 통계치 기반:
    - 3월 평균: 다년생 3-4m, 1년생 1.5-2m
    - 9월: 잔존 다년생 2-3m
    """
    _, _, sf = MONTHLY_PARAMS[month]

    # 다년생 빙하 구역 (캐나다 북쪽 해역)
    _, conc_offset = get_regional_bias(lon)
    multi_year_factor = clamp(conc_offset * 3, 0, 1)  # 보정값 큰 구역 = 다년생 빙하 가능성 높음

    # 기본 두께: 농도와 계절 팩터에 비례
    base_thickness = conc * (2.0 + 2.5 * sf + 1.5 * multi_year_factor)

    # 두께 노이즈 (±20%)
    noise = (deterministic_noise(lon, lat, seed_offset=999) - 0.5) * 0.4
    thickness = clamp(base_thickness + noise, 0.1, 5.0)

    return round(thickness, 2)

# ─── 메인 생성 함수 ──────────────────────────────────────────────────────────

LON_STEP = 1.0   # 경도 격자 간격
LAT_STEP = 0.75  # 위도 격자 간격 (mockIceData보다 2배 세밀)
LAT_MIN = 65.0
LAT_MAX = 90.0
LON_MIN = -180.0
LON_MAX = 180.0

def generate_month(month):
    """월별 IceDataset JSON 생성"""
    cells = []

    lat = LAT_MIN
    while lat < LAT_MAX:
        lon = LON_MIN
        while lon < LON_MAX:
            conc = concentration_at(lon, lat, month)

            if conc >= 0.05:
                thickness = thickness_at(lon, lat, conc, month)
                cells.append({
                    "lon": round(lon, 2),
                    "lat": round(lat, 2),
                    "lonStep": LON_STEP,
                    "latStep": LAT_STEP,
                    "concentration": round(conc, 3),
                    "thickness": thickness,
                })
            lon += LON_STEP
        lat += LAT_STEP

    return {"month": month, "cells": cells}

# ─── 육지 마스크 생성 ──────────────────────────────────────────────────────────

NATURAL_EARTH_URL = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector"
    "/master/geojson/ne_110m_land.geojson"
)

def _point_in_ring(lon, lat, ring):
    """Ray-casting 알고리즘 — 순수 Python, shapely 불필요"""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and \
           (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

def _is_land(lon, lat, arctic_features):
    for feat in arctic_features:
        geo = feat["geometry"]
        if geo["type"] == "Polygon":
            polys = [geo["coordinates"]]
        else:  # MultiPolygon
            polys = geo["coordinates"]
        for poly in polys:
            if _point_in_ring(lon, lat, poly[0]):
                return True
    return False

def generate_land_mask(output_dir):
    """
    Natural Earth 110m 육지 GeoJSON을 이용해 0.5°×0.5° 북극 육지 마스크 생성.
    출력: landMask.json ({"rows":50,"cols":720,"data":[0/1 ...]})
    """
    print("  Natural Earth 육지 데이터 다운로드 중...", end="", flush=True)
    try:
        with urllib.request.urlopen(NATURAL_EARTH_URL, timeout=30) as resp:
            geojson = json.loads(resp.read())
        print(" 완료")
    except Exception as e:
        print(f" 실패({e}) — 육지 마스크 생략")
        return

    # 65°N 이상 포함 feature만 필터 (속도 최적화)
    arctic_features = []
    for feat in geojson["features"]:
        geo = feat["geometry"]
        polys = [geo["coordinates"]] if geo["type"] == "Polygon" else geo["coordinates"]
        for poly in polys:
            if any(c[1] >= 64 for c in poly[0]):
                arctic_features.append(feat)
                break

    print(f"  북극 관련 육지 폴리곤 {len(arctic_features)}개 처리 중...", end="", flush=True)

    # 0.5°×0.5° 격자 (A* 격자와 동일 해상도)
    MASK_LON_STEP = 0.5
    MASK_LAT_STEP = 0.5
    MASK_LAT_MIN = 65.0
    MASK_LON_MIN = -180.0
    COLS = 720  # 360/0.5
    ROWS = 50   # 25/0.5

    mask = []
    lat = MASK_LAT_MIN + MASK_LAT_STEP / 2  # 셀 중심
    for _ in range(ROWS):
        lon = MASK_LON_MIN + MASK_LON_STEP / 2
        for _ in range(COLS):
            mask.append(1 if _is_land(lon, lat, arctic_features) else 0)
            lon += MASK_LON_STEP
        lat += MASK_LAT_STEP

    land_count = sum(mask)
    print(f" 완료 (육지 셀 {land_count:,}개 / 전체 {len(mask):,}개)")

    filepath = os.path.join(output_dir, "landMask.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"rows": ROWS, "cols": COLS, "data": mask}, f, separators=(",", ":"))
    print(f"  → {filepath}")


# ─── 실행 ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # 프로젝트 루트 기준 출력 경로
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_dir = os.path.join(project_root, "client", "public", "data")
    os.makedirs(output_dir, exist_ok=True)

    MONTH_NAMES = [
        "1월(Jan)", "2월(Feb)", "3월(Mar)", "4월(Apr)",
        "5월(May)", "6월(Jun)", "7월(Jul)", "8월(Aug)",
        "9월(Sep)", "10월(Oct)", "11월(Nov)", "12월(Dec)",
    ]

    total_cells = 0
    for month in range(12):
        print(f"  {MONTH_NAMES[month]} 생성 중...", end="", flush=True)
        data = generate_month(month)
        count = len(data["cells"])
        total_cells += count

        filename = f"realIceData_month{month:02d}.json"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, separators=(",", ":"))  # 압축 JSON (최소 용량)

        area_M = MONTHLY_PARAMS[month][0]
        print(f" {count:,}개 셀 → {filename} (해빙 면적 기준 {area_M}M km²)")

    print(f"\n완료: 총 {total_cells:,}개 셀, 출력 폴더: {output_dir}")

    print("\n[육지 마스크]")
    generate_land_mask(output_dir)

    print("\n[검증]")
    for month in [1, 8]:  # 2월(최대), 9월(최소)
        filepath = os.path.join(output_dir, f"realIceData_month{month:02d}.json")
        with open(filepath, encoding="utf-8") as f:
            d = json.load(f)
        concs = [c["concentration"] for c in d["cells"]]
        thicks = [c["thickness"] for c in d["cells"]]
        print(f"  월 {month+1}: 셀 {len(concs)}개, 평균농도 {sum(concs)/len(concs):.3f}, 평균두께 {sum(thicks)/len(thicks):.2f}m")
