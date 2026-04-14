"""
whatif_generator.py
===================
Claude tool_use 기반 What-If 시나리오 자동 생성기.

현재 해양 데이터를 분석하여 의미 있는 시나리오를 자동 제안하고,
각 시나리오를 POLARIS RIO로 평가한 뒤 비교 분석 보고서를 생성합니다.

동작 흐름:
  1. 현재 환경 데이터 로드
  2. Claude API 호출 (tool_use 모드)
  3. Claude가 시나리오 제안 + 도구 호출로 평가
  4. 비교 분석 + 추천 생성
  5. WhatIfResult 반환 (PDF 통합 또는 독립 API 응답)
"""

import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import date
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

from .whatif_tools import TOOL_DEFINITIONS, WhatIfToolExecutor

logger = logging.getLogger("report-service.whatif_generator")

_env_path = Path(__file__).resolve().parents[2] / "backend" / ".env"
load_dotenv(_env_path)

WHATIF_SYSTEM_PROMPT = """당신은 북극 항로 전략 분석가입니다. IMO POLARIS 방법론, 선박 Ice Class 체계,
해빙 계절 변동에 정통하며, 데이터 기반으로 항로 개척 시나리오를 제안합니다.

당신의 역할:
1. 현재 해양 환경 데이터를 조회합니다 (get_current_conditions 도구 사용)
2. 데이터를 분석하여 의사결정자에게 유의미한 3~5개의 What-If 시나리오를 제안합니다
3. 각 시나리오를 도구를 사용하여 실제로 평가합니다
4. 결과를 비교하여 최종 추천을 제공합니다

시나리오 유형 예시:
- 해빙 농도 변화: "해빙이 30% 증가하면?" (기후 악화 시나리오)
- Ice Class 변경: "PC5 대신 PC3으로 업그레이드하면?"
- 출항 시기 변경: "1개월 일찍/늦게 출항하면?"
- 대안 항로: "NSR 대신 NWP를 선택하면?"
- 복합 시나리오: "해빙 감소 + 다른 항로"

규칙:
- 반드시 먼저 get_current_conditions를 호출하여 현재 상황을 파악하세요
- 각 시나리오는 반드시 score_route 또는 score_route_modified_ice 도구로 평가하세요
- 최종 비교는 반드시 한국어로 작성하세요
- 각 시나리오에 이름, 설명, 추천 이유를 포함하세요"""

SCENARIO_PROMPT_TEMPLATE = """현재 분석 조건:
- 기준 항로: {route}
- 선박 Ice Class: {ice_class}
- 출항 예정일: {departure_date}
- 예측 기간: {forecast_days}일

먼저 현재 환경 데이터를 조회한 뒤, 위 조건에서 의사결정자에게 유의미한 3~5개의
What-If 시나리오를 제안하고, 각각을 도구로 평가한 뒤, 한국어로 비교 분석을 작성해주세요.

각 시나리오의 결과를 비교할 때 다음 형식으로 정리해주세요:
1. 시나리오 이름
2. 시나리오 설명 (왜 이 시나리오가 의미 있는지)
3. 평가 결과 요약 (avg_rio, green/yellow/red 일수)
4. 추천 여부 (추천/조건부/비추천)

마지막에 종합 추천을 작성해주세요."""


@dataclass
class ScenarioResult:
    name: str
    description: str
    route_summary: dict
    recommendation: str  # 추천/조건부/비추천


@dataclass
class WhatIfResult:
    scenarios: list[ScenarioResult] = field(default_factory=list)
    comparison_text: str = ""
    ai_recommendation: str = ""
    tool_calls_count: int = 0


class WhatIfGenerator:
    """Claude tool_use 기반 What-If 시나리오 생성기."""

    MAX_TOOL_ITERATIONS = 15

    def __init__(self, route_scorer, data_loader):
        self.tool_executor = WhatIfToolExecutor(route_scorer, data_loader)
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                import anthropic
                self._client = anthropic.Anthropic(
                    api_key=os.environ.get("ANTHROPIC_API_KEY", "")
                )
            except ImportError:
                logger.error("anthropic 패키지가 필요합니다: pip install anthropic")
                raise
        return self._client

    def generate_scenarios(
        self,
        route: str = "NSR",
        ice_class: str = "PC5",
        departure_date: str = "",
        forecast_days: int = 30,
    ) -> WhatIfResult:
        """
        What-If 시나리오를 자동 생성하고 평가합니다.

        Claude가 tool_use를 통해 자율적으로 시나리오를 제안하고 평가합니다.
        """
        if not departure_date:
            departure_date = date.today().isoformat()

        prompt = SCENARIO_PROMPT_TEMPLATE.format(
            route=route,
            ice_class=ice_class,
            departure_date=departure_date,
            forecast_days=forecast_days,
        )

        messages = [{"role": "user", "content": prompt}]
        tool_calls_count = 0
        # 도구 호출 결과 수집: score_route / score_route_modified_ice / compare_ice_classes 결과만 저장
        collected_route_summaries: list[dict] = []

        # Claude tool_use 루프
        for iteration in range(self.MAX_TOOL_ITERATIONS):
            try:
                response = self.client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=4000,
                    system=WHATIF_SYSTEM_PROMPT,
                    tools=TOOL_DEFINITIONS,
                    messages=messages,
                )
            except Exception as e:
                logger.error("Claude API 호출 실패: %s", e)
                return self._fallback_result(route, ice_class, departure_date, forecast_days)

            # 응답 처리
            if response.stop_reason == "tool_use":
                # Claude가 도구를 호출함
                tool_results = []

                for block in response.content:
                    if block.type == "tool_use":
                        tool_calls_count += 1
                        tool_name = block.name
                        tool_input = block.input

                        logger.info("도구 호출 [%d]: %s(%s)",
                                    tool_calls_count, tool_name, json.dumps(tool_input, ensure_ascii=False)[:100])

                        exec_result = self.tool_executor.execute(tool_name, tool_input)

                        # 항로 평가 결과 수집 (시나리오 route_summary 구성에 활용)
                        if tool_name in ("score_route", "score_route_modified_ice"):
                            if "avg_rio" in exec_result:
                                collected_route_summaries.append(exec_result)
                        elif tool_name == "compare_ice_classes":
                            # compare 결과에서 각 ice_class별 summary 추출
                            for ic_summary in exec_result.get("comparison", {}).values():
                                if "avg_rio" in ic_summary:
                                    collected_route_summaries.append(ic_summary)

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(exec_result, ensure_ascii=False),
                        })

                # 어시스턴트 메시지 + 도구 결과를 대화에 추가
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})

            elif response.stop_reason == "end_turn":
                # Claude가 분석을 완료함
                final_text = self._extract_text(response.content)
                result = self._parse_result(final_text, collected_route_summaries)
                result.tool_calls_count = tool_calls_count
                logger.info("What-If 분석 완료: %d 시나리오, %d 도구 호출",
                            len(result.scenarios), tool_calls_count)
                return result
            else:
                logger.warning("예상치 못한 stop_reason: %s", response.stop_reason)
                break

        # 최대 반복 초과
        logger.warning("최대 반복(%d) 초과", self.MAX_TOOL_ITERATIONS)
        final_text = self._extract_text(messages[-1].get("content", []) if isinstance(messages[-1], dict) else [])
        result = self._parse_result(final_text, collected_route_summaries)
        result.tool_calls_count = tool_calls_count
        return result

    def _extract_text(self, content) -> str:
        """Claude 응답에서 텍스트만 추출합니다."""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            texts = []
            for block in content:
                if hasattr(block, "text"):
                    texts.append(block.text)
                elif isinstance(block, dict) and block.get("type") == "text":
                    texts.append(block.get("text", ""))
            return "\n".join(texts)
        return str(content)

    def _parse_result(self, text: str, route_summaries: list[dict] | None = None) -> WhatIfResult:
        """Claude의 텍스트 응답을 구조화된 WhatIfResult로 파싱합니다.

        route_summaries: 도구 호출로 수집된 항로 평가 결과 목록.
          시나리오 순서대로 매핑합니다.
        """
        result = WhatIfResult()
        result.comparison_text = text
        if route_summaries is None:
            route_summaries = []

        # 시나리오 파싱 (텍스트 휴리스틱)
        lines = text.split("\n")
        current_scenario = None
        scenario_idx = 0

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # "시나리오 1:", "1.", "### 시나리오" 등의 패턴 감지
            if any(kw in stripped.lower() for kw in ["시나리오", "scenario"]) and any(c.isdigit() for c in stripped):
                if current_scenario:
                    result.scenarios.append(current_scenario)
                    scenario_idx += 1
                # 수집된 route_summary를 순서대로 매핑
                rs = route_summaries[scenario_idx] if scenario_idx < len(route_summaries) else {}
                current_scenario = ScenarioResult(
                    name=stripped.lstrip("#").strip(),
                    description="",
                    route_summary=rs,
                    recommendation="",
                )
            elif current_scenario:
                if "추천" in stripped or "recommend" in stripped.lower():
                    if "비추천" in stripped or "불가" in stripped:
                        current_scenario.recommendation = "비추천"
                    elif "조건부" in stripped:
                        current_scenario.recommendation = "조건부"
                    else:
                        current_scenario.recommendation = "추천"
                elif not current_scenario.description and len(stripped) > 10:
                    current_scenario.description = stripped

            # 종합 추천 감지
            if "종합" in stripped and ("추천" in stripped or "결론" in stripped):
                idx = lines.index(line)
                result.ai_recommendation = "\n".join(
                    l.strip() for l in lines[idx:] if l.strip()
                )

        if current_scenario:
            result.scenarios.append(current_scenario)

        # 시나리오가 파싱되지 않았으면 수집된 route_summaries로 기본 시나리오 구성
        if not result.scenarios and route_summaries:
            for i, rs in enumerate(route_summaries):
                result.scenarios.append(ScenarioResult(
                    name=f"시나리오 {i + 1}",
                    description=rs.get("scenario", f"{rs.get('route', '')} / {rs.get('ice_class', '')}"),
                    route_summary=rs,
                    recommendation="추천" if rs.get("green_days", 0) > rs.get("red_days", 0) else "조건부",
                ))
            result.ai_recommendation = text
        elif not result.scenarios:
            result.ai_recommendation = text

        return result

    def _fallback_result(
        self,
        route: str,
        ice_class: str,
        departure_date: str,
        forecast_days: int,
    ) -> WhatIfResult:
        """Claude API 실패 시 기본 시나리오를 직접 생성합니다."""
        logger.info("Fallback: 기본 시나리오 3개 자동 생성")

        scenarios = []

        # 시나리오 1: 현재 조건 (기준)
        base = self.tool_executor.execute("score_route", {
            "route": route,
            "ice_class": ice_class,
            "departure_date": departure_date,
            "forecast_days": forecast_days,
        })
        scenarios.append(ScenarioResult(
            name="기준 시나리오 (현재 조건)",
            description=f"{route} 항로, {ice_class} 선박, 현재 해빙 조건",
            route_summary=base,
            recommendation="기준",
        ))

        # 시나리오 2: 해빙 +30%
        worse = self.tool_executor.execute("score_route_modified_ice", {
            "route": route,
            "ice_class": ice_class,
            "departure_date": departure_date,
            "forecast_days": forecast_days,
            "ice_multiplier": 1.3,
        })
        scenarios.append(ScenarioResult(
            name="해빙 악화 시나리오 (+30%)",
            description="해빙 농도가 30% 증가한 상황 (이상 기후, 조기 결빙)",
            route_summary=worse,
            recommendation="비추천" if worse.get("red_days", 0) > 10 else "조건부",
        ))

        # 시나리오 3: Ice Class 업그레이드
        upgraded_class = "PC3" if ice_class in ("PC5", "PC4") else "PC2"
        upgrade = self.tool_executor.execute("score_route", {
            "route": route,
            "ice_class": upgraded_class,
            "departure_date": departure_date,
            "forecast_days": forecast_days,
        })
        scenarios.append(ScenarioResult(
            name=f"선박 업그레이드 ({ice_class}→{upgraded_class})",
            description=f"Ice Class를 {upgraded_class}로 상향 시 개선 효과",
            route_summary=upgrade,
            recommendation="추천" if upgrade.get("green_days", 0) > 20 else "조건부",
        ))

        return WhatIfResult(
            scenarios=scenarios,
            comparison_text="Claude API 연결 실패로 기본 시나리오 3개를 자동 생성했습니다.",
            ai_recommendation="기본 시나리오 비교 결과를 참고하시기 바랍니다.",
            tool_calls_count=3,
        )
