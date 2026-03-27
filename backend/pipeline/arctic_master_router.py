"""
arctic_master_router.py
=======================
Master Routing Algorithm for Arctic Northern Sea Route (NSR)

Implements:
  - POLARIS RIO (Risk Index Outcome) scoring from raw ice chart data
  - KR (Korean Register) Polar Code compliance checklist
  - Sequential decision tree: Geopolitical → Physical → Polar Code → POLARIS

Standalone module — no external dependencies (pure Python 3.8+).

Usage:
    python arctic_master_router.py          # runs built-in test suite
    from arctic_master_router import calculate_rio, evaluate_routing
"""

from __future__ import annotations
from typing import TypedDict


# ═══════════════════════════════════════════════════════════════════════════════
# 1. RIV LOOKUP TABLE
#    Source: IMO POLARIS methodology (MSC.1/Circ.1519), adapted to IACS ice
#    classes and KR Polar Code implementation guide.
#
#    RIV (Risk Index Value):
#      +2  =  safe, no operational restriction
#      +1  =  safe with minor caution
#       0  =  marginal — speed management recommended
#      -1  =  elevated risk — proceed with caution
#      -n  =  prohibitive — beyond design envelope (n > 0)
#
#    Row key  : ice_class  (ship's structural ice class)
#    Col key  : ice_type   (WMO ice nomenclature used in Ice Charts)
# ═══════════════════════════════════════════════════════════════════════════════

RIV_TABLE: dict[str, dict[str, int]] = {
    # ── No structural ice reinforcement ────────────────────────────────────
    "None": {
        "Open Water": 2,
        "Grey Ice": 1,
        "Grey-White Ice": -1,
        "Thin First-Year (FY)": -2,
        "Medium First-Year (FY)": -4,
        "Thick First-Year (FY)": -6,
        "Multi-Year (MY)": -8,
        "Ridged/Hummocked": -10,
        "Glacier Ice": -20,
    },
    # ── IACS conventional Baltic / coastal ice classes ──────────────────
    "IC": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 1,
        "Thin First-Year (FY)": -1,
        "Medium First-Year (FY)": -3,
        "Thick First-Year (FY)": -5,
        "Multi-Year (MY)": -6,
        "Ridged/Hummocked": -8,
        "Glacier Ice": -16,
    },
    "IB": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 1,
        "Thin First-Year (FY)": 1,
        "Medium First-Year (FY)": -2,
        "Thick First-Year (FY)": -4,
        "Multi-Year (MY)": -5,
        "Ridged/Hummocked": -7,
        "Glacier Ice": -14,
    },
    "IA": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 1,
        "Medium First-Year (FY)": 1,
        "Thick First-Year (FY)": -2,
        "Multi-Year (MY)": -4,
        "Ridged/Hummocked": -5,
        "Glacier Ice": -12,
    },
    "IA Super": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 1,
        "Thick First-Year (FY)": -1,
        "Multi-Year (MY)": -3,
        "Ridged/Hummocked": -4,
        "Glacier Ice": -10,
    },
    # ── IMO Polar Classes (PC7 = lightest, PC1 = year-round Arctic) ────────
    "PC7": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 1,
        "Medium First-Year (FY)": 1,
        "Thick First-Year (FY)": -1,
        "Multi-Year (MY)": -3,
        "Ridged/Hummocked": -4,
        "Glacier Ice": -9,
    },
    "PC6": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 1,
        "Thick First-Year (FY)": 1,
        "Multi-Year (MY)": -2,
        "Ridged/Hummocked": -3,
        "Glacier Ice": -8,
    },
    "PC5": {
        # PC5 = medium first-year ice, multi-season operation.
        # Glacier ice is completely outside design envelope → RIV -20.
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 1,
        "Thick First-Year (FY)": 1,
        "Multi-Year (MY)": -2,
        "Ridged/Hummocked": -3,
        "Glacier Ice": -20,
    },
    "PC4": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 2,
        "Thick First-Year (FY)": 1,
        "Multi-Year (MY)": 1,
        "Ridged/Hummocked": -1,
        "Glacier Ice": -6,
    },
    "PC3": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 2,
        "Thick First-Year (FY)": 1,
        "Multi-Year (MY)": 1,
        "Ridged/Hummocked": 1,
        "Glacier Ice": -3,
    },
    "PC2": {
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 2,
        "Thick First-Year (FY)": 2,
        "Multi-Year (MY)": 2,
        "Ridged/Hummocked": 1,
        "Glacier Ice": -1,
    },
    "PC1": {
        # PC1 = year-round operation in all Arctic waters including thick MY ice.
        "Open Water": 2,
        "Grey Ice": 2,
        "Grey-White Ice": 2,
        "Thin First-Year (FY)": 2,
        "Medium First-Year (FY)": 2,
        "Thick First-Year (FY)": 2,
        "Multi-Year (MY)": 2,
        "Ridged/Hummocked": 2,
        "Glacier Ice": 1,
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
# 2. RIO CALCULATION MODULE
# ═══════════════════════════════════════════════════════════════════════════════


class IceCondition(TypedDict):
    type: str  # WMO ice type key (must match RIV_TABLE)
    concentration_tenths: float  # 0.0 (0/10) → 1.0 (10/10)


def calculate_rio(ice_class: str, ice_conditions: list[IceCondition]) -> float:
    """
    Calculate POLARIS Risk Index Outcome (RIO) from ice chart data.

    Formula
    -------
    RIO = Σ  concentration_tenths_i  ×  RIV(ice_class, ice_type_i)

    Parameters
    ----------
    ice_class : str
        Ship's structural ice class. Must be a key in RIV_TABLE.
        Examples: 'PC5', 'PC7', 'IA', 'None'

    ice_conditions : list of IceCondition
        Each entry describes one ice type present in the sea area:
          - 'type'                  : WMO ice type name (must be in RIV_TABLE)
          - 'concentration_tenths'  : fractional area coverage (0.0–1.0)

    Returns
    -------
    float
        RIO score.  Positive → safe,  negative → hazardous.
        Thresholds used by evaluate_routing():
          ≥  0  : NSR_APPROVED
          ≥ -10 : NSR_RESTRICTED
          < -10 : REROUTE_SUEZ (POLARIS prohibitive)

    Raises
    ------
    ValueError
        If ice_class or any ice type is not found in RIV_TABLE.
    """
    if ice_class not in RIV_TABLE:
        valid = ", ".join(f"'{k}'" for k in RIV_TABLE)
        raise ValueError(f"Unknown ice_class '{ice_class}'. Valid values: {valid}")

    class_rivs = RIV_TABLE[ice_class]
    rio: float = 0.0

    for entry in ice_conditions:
        ice_type = entry["type"]
        conc = entry["concentration_tenths"]

        if ice_type not in class_rivs:
            valid_types = ", ".join(f"'{t}'" for t in class_rivs)
            raise ValueError(
                f"Unknown ice type '{ice_type}' for class '{ice_class}'. "
                f"Valid types: {valid_types}"
            )

        if not (0.0 <= conc <= 1.0):
            raise ValueError(
                f"concentration_tenths must be in [0.0, 1.0], got {conc} "
                f"for ice type '{ice_type}'."
            )

        riv = class_rivs[ice_type]
        rio += conc * riv

    return round(rio, 4)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. MASTER ROUTING ALGORITHM
# ═══════════════════════════════════════════════════════════════════════════════

# Status codes
NSR_APPROVED = "NSR_APPROVED"  # Normal NSR transit
NSR_RESTRICTED = "NSR_RESTRICTED"  # Transit permitted with speed/escort conditions
REROUTE_SUEZ = "REROUTE_SUEZ"  # Divert via Suez Canal
REROUTE_CAPE = "REROUTE_CAPE"  # Divert via Cape of Good Hope

# Physical limits for NSR (NSRA / Russian Maritime Authority regulations)
NSR_MAX_DRAFT_M = 12.5  # Maximum permissible draft (m)
NSR_MAX_BEAM_M = 35.0  # Maximum beam for icebreaker channel passage (m)

# KR Polar Code survival standard (minimum days)
POLAR_CODE_MIN_RESCUE_DAYS = 5

# KR Polar Code design temperature margin (degrees Celsius)
POLAR_CODE_MIN_TEMP_MARGIN = 10.0


class ShipData(TypedDict, total=False):
    # ── Physical particulars ──────────────────────────────────────────────
    ship_type: str  # e.g. "Bulk Carrier", "LNG Tanker"
    draft: float  # Maximum operating draft (m)
    beam: float  # Moulded breadth (m)

    # ── Ice class & Polar Code safety equipment ───────────────────────────
    ice_class: str  # Structural ice class (key in RIV_TABLE)
    has_pwom: bool  # Polar Water Operational Manual on board
    max_rescue_days_capacity: int  # Survival equipment endurance (days)
    is_temp_below_minus_10: bool  # Route min daily temp < -10 °C
    design_temp_margin: float  # Ship design temp minus route min temp (°C)
    has_winterization: bool  # Winterization package fitted
    has_zero_discharge: bool  # Zero-discharge waste retention tank
    has_polar_comms: bool  # Polar-capable communication equipment
    has_ice_navigator: bool  # Certified ice navigator on board

    # ── Administrative & geopolitical ────────────────────────────────────
    is_sanctioned_country: bool  # Flag state under Russia sanctions regime
    has_nsra_permit: bool  # NSRA advance permit obtained

    # ── Ice chart data (fed into RIO calculator) ──────────────────────────
    ice_conditions: list[IceCondition]


class RoutingResult(TypedDict):
    status: str  # One of the four status constants above
    reason: str  # Human-readable explanation
    rio_score: float | None  # Computed RIO (None if step 1–3 already blocked)


def evaluate_routing(ship_data: ShipData) -> RoutingResult:
    """
    Master Arctic NSR routing decision engine.

    Executes a sequential, fail-fast decision tree covering:
      Step 1 — Geopolitical & administrative filters
      Step 2 — Physical dimension filters (draft, beam)
      Step 3 — Polar Code safety & equipment compliance (KR guide)
      Step 4 — POLARIS RIO score evaluation

    Parameters
    ----------
    ship_data : ShipData
        Dictionary containing all vessel and voyage parameters.
        See ShipData TypedDict for field descriptions.

    Returns
    -------
    RoutingResult
        {
          'status'    : str,         # NSR_APPROVED / NSR_RESTRICTED /
                                     # REROUTE_SUEZ / REROUTE_CAPE
          'reason'    : str,         # Detailed explanation of the decision
          'rio_score' : float|None   # POLARIS RIO score (None if not reached)
        }
    """

    # ── STEP 1: Geopolitical & Administrative Filters ─────────────────────

    if ship_data.get("is_sanctioned_country", False):
        return RoutingResult(
            status=REROUTE_CAPE,
            reason=(
                "[Step 1a] 선박 국적이 대러시아 제재 참여국으로 분류됩니다. "
                "NSR 통과 시 OFAC/EU 등 국제 제재 위반 및 선박·화물 압류 리스크가 "
                "발생하므로 희망봉(Cape of Good Hope) 우회를 권고합니다."
            ),
            rio_score=None,
        )

    if not ship_data.get("has_nsra_permit", False):
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                "[Step 1b] 러시아 북극항로청(NSRA) 사전 운항 허가가 없습니다. "
                "NSR 통과에는 45일 전 NSRA 신청 및 당국 승인이 필수입니다. "
                "수에즈 운하(Suez Canal)를 통해 우회합니다."
            ),
            rio_score=None,
        )

    if not ship_data.get("has_pwom", False):
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                "[Step 1b] 극지해역 운항 매뉴얼(PWOM: Polar Water Operational Manual)이 "
                "선내에 비치되어 있지 않습니다. IMO Polar Code 및 KR 이행 가이드 2장에 "
                "따라 PWOM은 극지 항해의 필수 문서입니다. 수에즈 우회를 권고합니다."
            ),
            rio_score=None,
        )

    # ── STEP 2: Physical Dimension Filters ───────────────────────────────

    draft = ship_data.get("draft", 0.0)
    if draft > NSR_MAX_DRAFT_M:
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                f"[Step 2a] 선박 최대 흘수 {draft:.1f}m 가 NSR 수심 제한 "
                f"{NSR_MAX_DRAFT_M}m 를 초과합니다. "
                "얕은 연안 수로(특히 Vilkitsky Strait, Sannikov Strait) 통과 불가. "
                "수에즈 우회를 권고합니다."
            ),
            rio_score=None,
        )

    beam = ship_data.get("beam", 0.0)
    if beam > NSR_MAX_BEAM_M:
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                f"[Step 2b] 선박 선폭 {beam:.1f}m 가 쇄빙선 수로 통과 허용 최대 선폭 "
                f"{NSR_MAX_BEAM_M}m 를 초과합니다. "
                "쇄빙선 에스코트 시 선폭 제한으로 수로 진입 불가. 수에즈 우회."
            ),
            rio_score=None,
        )

    # ── STEP 3: Polar Code Safety & Equipment Compliance (KR Guide) ──────

    rescue_days = ship_data.get("max_rescue_days_capacity", 0)
    if rescue_days < POLAR_CODE_MIN_RESCUE_DAYS:
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                f"[Step 3a] 생존 장비 유지 가능 시간이 {rescue_days}일로, "
                f"KR Polar Code 이행 가이드 기준 최소 {POLAR_CODE_MIN_RESCUE_DAYS}일에 "
                "미달합니다. 극지 수색·구조(SAR) 대응 지연 시 승무원 안전을 보장할 수 "
                "없으므로 수에즈 우회를 권고합니다."
            ),
            rio_score=None,
        )

    is_cold = ship_data.get("is_temp_below_minus_10", False)
    temp_margin = ship_data.get("design_temp_margin", 999.0)
    if is_cold and temp_margin < POLAR_CODE_MIN_TEMP_MARGIN:
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                f"[Step 3b] 운항 해역 일일 평균 최저기온이 -10 °C 미만인 상황에서 "
                f"선박 설계 온도 여유치({temp_margin:.1f} °C)가 Polar Code 권고 기준 "
                f"{POLAR_CODE_MIN_TEMP_MARGIN:.0f} °C에 미달합니다. "
                "저온 환경에서의 구조적 취성 파괴 및 기계 계통 결빙 위험이 있어 "
                "수에즈 우회를 권고합니다."
            ),
            rio_score=None,
        )

    missing_equipment: list[str] = []
    if not ship_data.get("has_winterization", False):
        missing_equipment.append("방한 설비(Winterization package)")
    if not ship_data.get("has_zero_discharge", False):
        missing_equipment.append(
            "폐기물 무배출 보유 탱크(Zero-discharge retention tank)"
        )
    if not ship_data.get("has_polar_comms", False):
        missing_equipment.append(
            "극지 통신 장비(Polar-capable comms — Iridium/INMARSAT)"
        )
    if not ship_data.get("has_ice_navigator", False):
        missing_equipment.append("자격증 소지 극지 항해사(Certified Ice Navigator)")

    if missing_equipment:
        missing_str = "; ".join(missing_equipment)
        return RoutingResult(
            status=REROUTE_SUEZ,
            reason=(
                f"[Step 3c] KR Polar Code 이행 가이드 필수 설비/인력 미비: "
                f"{missing_str}. "
                "Polar Code 제9~12장 요건을 충족하지 못하여 수에즈 우회를 권고합니다."
            ),
            rio_score=None,
        )

    # ── STEP 4: POLARIS RIO Evaluation ──────────────────────────────────

    ice_class = ship_data.get("ice_class", "None")
    ice_conditions = ship_data.get("ice_conditions", [])

    rio_score = calculate_rio(ice_class, ice_conditions)

    if rio_score >= 0:
        return RoutingResult(
            status=NSR_APPROVED,
            reason=(
                f"[Step 4a] POLARIS RIO 점수: {rio_score:+.2f}. "
                "모든 행정·물리·안전 기준을 충족하며 빙해역 위험 지수가 양수(≥0)입니다. "
                "현재 빙상 조건에서 NSR 정상 통과(NSR_APPROVED)가 승인됩니다."
            ),
            rio_score=rio_score,
        )

    if rio_score >= -10:
        return RoutingResult(
            status=NSR_RESTRICTED,
            reason=(
                f"[Step 4b] POLARIS RIO 점수: {rio_score:+.2f} (경계: -10 ≤ RIO < 0). "
                "고위험 빙해역으로 분류됩니다. 조건부 통과 — "
                "쇄빙선 에스코트 필수, 권고 속도(Recommended Speed) 준수, "
                "24시간 빙상 감시 체계 유지 필요. NSR_RESTRICTED 상태로 운항 허가."
            ),
            rio_score=rio_score,
        )

    # rio_score < -10
    return RoutingResult(
        status=REROUTE_SUEZ,
        reason=(
            f"[Step 4c] POLARIS RIO 점수: {rio_score:+.2f} (기준: RIO < -10). "
            "현재 빙상 조건이 POLARIS '특별 고려 대상 해역(Special Consideration Area)'에 "
            "해당합니다. 선박 내빙 등급({ice_class})의 설계 한계를 초과하는 빙하·다년생 빙·"
            "압퇴빙이 해역을 지배하고 있어 안전한 항해 계획 수립이 불가합니다. "
            "수에즈 운하를 통한 우회를 권고합니다."
        ).format(ice_class=ice_class),
        rio_score=rio_score,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# 4. BUILT-IN TEST SUITE
# ═══════════════════════════════════════════════════════════════════════════════


def _separator(title: str) -> None:
    width = 72
    print()
    print("=" * width)
    print(f"  {title}")
    print("=" * width)


def _print_result(result: RoutingResult) -> None:
    print(f"  STATUS    : {result['status']}")
    if result["rio_score"] is not None:
        print(f"  RIO SCORE : {result['rio_score']:+.4f}")
    else:
        print("  RIO SCORE : N/A (blocked before POLARIS step)")
    print(f"  REASON    :")
    # Word-wrap reason at 68 chars
    reason = result["reason"]
    words = reason.split(" ")
    line = "    "
    for word in words:
        if len(line) + len(word) + 1 > 70:
            print(line)
            line = "    " + word + " "
        else:
            line += word + " "
    if line.strip():
        print(line)


def run_tests() -> None:
    """
    Execute the three mandatory validation test cases.

    Case 1 — Perfect vessel → NSR_APPROVED  (RIO ≥ 1.7)
    Case 2 — Survival days < 5 → REROUTE_SUEZ
    Case 3 — Extreme ice (RIO ≈ −12) → REROUTE_SUEZ
    """

    # ─────────────────────────────────────────────────────────────────────
    # Case 1: Perfect PC3 vessel — all Polar Code criteria met, benign ice
    # Expected: NSR_APPROVED, rio_score ≥ 1.7
    # ─────────────────────────────────────────────────────────────────────
    _separator("TEST CASE 1 — 완벽한 PC3 선박 (NSR_APPROVED 기대)")

    case1: ShipData = {
        "ship_type": "LNG Tanker (Arc7)",
        "draft": 11.8,
        "beam": 33.0,
        "ice_class": "PC3",
        "has_pwom": True,
        "max_rescue_days_capacity": 10,
        "is_temp_below_minus_10": True,
        "design_temp_margin": 15.0,  # 선박 설계 온도 여유 15 °C
        "has_winterization": True,
        "has_zero_discharge": True,
        "has_polar_comms": True,
        "has_ice_navigator": True,
        "is_sanctioned_country": False,
        "has_nsra_permit": True,
        "ice_conditions": [
            # 주 해역: 개빙수역 80%, 회색빙 20%
            # PC3 기준 두 빙질 모두 RIV = +2
            # RIO = 0.8 × 2 + 0.2 × 2 = 2.00  (≥ 1.7 ✓)
            {"type": "Open Water", "concentration_tenths": 0.8},
            {"type": "Grey Ice", "concentration_tenths": 0.2},
        ],
    }

    result1 = evaluate_routing(case1)
    _print_result(result1)

    assert (
        result1["status"] == NSR_APPROVED
    ), f"Case 1 FAILED: expected NSR_APPROVED, got {result1['status']}"
    assert (
        result1["rio_score"] is not None and result1["rio_score"] >= 1.7
    ), f"Case 1 FAILED: expected RIO ≥ 1.7, got {result1['rio_score']}"
    print("\n  ✔  PASS — NSR_APPROVED, RIO =", result1["rio_score"])

    # ─────────────────────────────────────────────────────────────────────
    # Case 2: Survival days 3 days (< minimum 5) → REROUTE_SUEZ
    # ─────────────────────────────────────────────────────────────────────
    _separator("TEST CASE 2 — 생존 일수 3일 미달 (REROUTE_SUEZ 기대)")

    case2: ShipData = {
        "ship_type": "General Cargo",
        "draft": 9.5,
        "beam": 28.0,
        "ice_class": "PC7",
        "has_pwom": True,
        "max_rescue_days_capacity": 3,  # ← 3일 → 기준(5일) 미달
        "is_temp_below_minus_10": False,
        "design_temp_margin": 12.0,
        "has_winterization": True,
        "has_zero_discharge": True,
        "has_polar_comms": True,
        "has_ice_navigator": True,
        "is_sanctioned_country": False,
        "has_nsra_permit": True,
        "ice_conditions": [
            {"type": "Thin First-Year (FY)", "concentration_tenths": 0.5},
            {"type": "Open Water", "concentration_tenths": 0.5},
        ],
    }

    result2 = evaluate_routing(case2)
    _print_result(result2)

    assert (
        result2["status"] == REROUTE_SUEZ
    ), f"Case 2 FAILED: expected REROUTE_SUEZ, got {result2['status']}"
    assert (
        result2["rio_score"] is None
    ), "Case 2 FAILED: expected rio_score = None (blocked at Step 3a)"
    print("\n  ✔  PASS — REROUTE_SUEZ (생존 일수 미달)")

    # ─────────────────────────────────────────────────────────────────────
    # Case 3: PC5 vessel, dense glacier ice → RIO = -12.0 → REROUTE_SUEZ
    # PC5  Glacier Ice  RIV = -20
    # concentration = 0.6
    # RIO = 0.6 × (-20) = -12.00  (<  -10 → REROUTE_SUEZ)
    # ─────────────────────────────────────────────────────────────────────
    _separator("TEST CASE 3 — 극심한 빙하 농도, RIO = -12.0 (REROUTE_SUEZ 기대)")

    case3: ShipData = {
        "ship_type": "Bulk Carrier",
        "draft": 12.0,
        "beam": 32.0,
        "ice_class": "PC5",
        "has_pwom": True,
        "max_rescue_days_capacity": 7,
        "is_temp_below_minus_10": True,
        "design_temp_margin": 11.0,
        "has_winterization": True,
        "has_zero_discharge": True,
        "has_polar_comms": True,
        "has_ice_navigator": True,
        "is_sanctioned_country": False,
        "has_nsra_permit": True,
        "ice_conditions": [
            # PC5 기준 빙하빙(Glacier Ice) RIV = -20
            # RIO = 0.60 × (-20) = -12.00
            {"type": "Glacier Ice", "concentration_tenths": 0.60},
        ],
    }

    result3 = evaluate_routing(case3)
    _print_result(result3)

    assert (
        result3["status"] == REROUTE_SUEZ
    ), f"Case 3 FAILED: expected REROUTE_SUEZ, got {result3['status']}"
    assert (
        result3["rio_score"] is not None and result3["rio_score"] < -10
    ), f"Case 3 FAILED: expected RIO < -10, got {result3['rio_score']}"
    print("\n  ✔  PASS — REROUTE_SUEZ, RIO =", result3["rio_score"])

    _separator("ALL 3 TEST CASES PASSED")


if __name__ == "__main__":
    run_tests()
