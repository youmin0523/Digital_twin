전 세계 모든 종류의 선박을 포괄하여 북극항로(NSR) 통과 가능 여부를 판별하고, 최적의 우회로를 안내하는 'Master Routing Algorithm'을 Python(또는 Node.js) 코드로 작성해 줘.
특히 한국선급(KR)의 Polar Code 이행 가이드에 따른 안전 기준과 POLARIS 방법론을 완벽히 반영해야 하며, 외부에서 위험 지수(RIO)를 입력받는 대신 빙상 데이터(Ice Chart)를 기반으로 내부에서 직접 RIO 점수를 계산하는 모듈을 포함해야 해.

아래의 상세 요구사항과 비즈니스 로직을 바탕으로 코드를 구현해 줘.

1. POLARIS RIO(Risk Index Outcome) 산출 모듈

- 수식: RIO = Sum(각 얼음 종류별 농도(10분위수, 0.1~1.0) \* 해당 얼음 종류 및 선박 내빙 등급에 따른 RIV 값)
- RIV(Risk Index Value) 매핑 테이블: 코드 내에 내빙 등급(Ice Class)과 빙질(Ice Type)에 따른 RIV 룩업 테이블(Dictionary/Object)을 하드코딩으로 구축해 줘. (예: PC5 등급 기준 Thin First-Year Ice의 RIV는 2, Medium First-Year Ice의 RIV는 1. 이 외의 등급과 빙질에 대해서도 가상의 예시 데이터를 넣어 구조를 완성할 것)
- 입력값: 선박의 `ice_class`와 `ice_conditions`.
  (ice_conditions 예시: [{'type': 'Thin First-Year', 'concentration_tenths': 0.7}, {'type': 'Medium First-Year', 'concentration_tenths': 0.3}] 형태의 배열)
- 출력값: 이 모듈에서 계산된 최종 `rio_score`를 아래 라우팅 알고리즘의 판단 변수로 사용.

2. 전체 라우팅 알고리즘 입력 데이터 (Input Parameters)
   [물리적 제원]

- ship_type (string): 선종
- draft (float): 흘수 (단위: m)
- beam (float): 선폭 (단위: m)

[Polar Code 안전 및 장비 요건]

- ice_class (string): 선박의 내빙 등급 ('None', 'PC5', 'PC7' 등)
- has_pwom (boolean): 극지해역 운항 매뉴얼(PWOM) 비치 여부
- max_rescue_days_capacity (integer): 생존 장비 유지 가능 시간 (일 단위)
- is_temp_below_minus_10 (boolean): 운항 해역의 일일 평균 최저기온이 -10도 미만인지 여부
- design_temp_margin (float): 최저기온 대비 선박 설계 온도의 여유치 (도 단위)
- has_winterization (boolean): 방한 설비 장착 여부
- has_zero_discharge (boolean): 폐기물 무배출 탱크 보유 여부
- has_polar_comms (boolean): 극지 통신 장비 보유 여부
- has_ice_navigator (boolean): 극지 항해사 탑승 여부

[행정 및 환경 데이터]

- is_sanctioned_country (boolean): 대러시아 제재 동참 국적 여부
- has_nsra_permit (boolean): 러시아 당국 사전 운항 허가 여부
- ice_conditions (array): 위 RIO 계산 모듈에 들어갈 빙상 데이터 배열

3. 출력 데이터 (Output)

- status (string): 'NSR_APPROVED' (정상 통과) / 'NSR_RESTRICTED' (제한적 통과/감속 필요) / 'REROUTE_SUEZ' (수에즈 우회) / 'REROUTE_CAPE' (희망봉 우회)
- reason (string): 결정 사유 상세 설명

4. 판단 로직 (Decision Tree - 순차적 검증)
   [Step 1: 지정학 및 행정 필터]

- is_sanctioned_country == True -> REROUTE_CAPE (사유: 제재 위반 리스크로 희망봉 우회)
- has_nsra_permit == False OR has_pwom == False -> REROUTE_SUEZ (사유: NSRA 허가 또는 PWOM 문서 미비)

[Step 2: 물리적 크기 필터]

- draft > 12.5 -> REROUTE_SUEZ (사유: 북극항로 수심 제한 12.5m 초과)
- beam > 35.0 -> REROUTE_SUEZ (사유: 선폭 과다로 쇄빙선 수로 통과 불가)

[Step 3: Polar Code 생존/설비 기준 필터]

- max_rescue_days_capacity < 5 -> REROUTE_SUEZ (사유: 최소 생존 보장 시간 5일 미달)
- is_temp_below_minus_10 == True AND design_temp_margin < 10 -> REROUTE_SUEZ (사유: 극지 설계 온도 10도 여유분 미확보)
- has_winterization == False OR has_zero_discharge == False OR has_polar_comms == False OR has_ice_navigator == False -> REROUTE_SUEZ (사유: Polar Code 필수 설비 및 인력 미달)

[Step 4: POLARIS 빙해역 위험 지수(RIO) 평가]
위 1번 모듈에서 계산된 `rio_score`를 기반으로 최종 판별:

- rio_score >= 0 -> NSR_APPROVED (사유: POLARIS 기준 정상 운항 가능)
- -10 <= rio_score < 0 -> NSR_RESTRICTED (사유: 고위험 해역. 권고 속도 준수 및 추가 에스코트 조건부 통과)
- rio_score < -10 -> REROUTE_SUEZ (사유: POLARIS 기준 특별 고려 대상 해역으로 항해 계획 수립 불가)

5. 코드 구조 및 테스트

- `calculate_rio(ice_class, ice_conditions)` 함수와 `evaluate_routing(ship_data)` 함수를 분리하여 모듈화해 줘.
- 아래 3가지 케이스에 대한 검증 테스트 코드를 반드시 포함해 줘:
  1. RIO 점수가 1.7 이상 나와 정상 통과(NSR_APPROVED)하는 완벽한 선박 케이스
  2. 생존 일수(3일) 미달로 우회(REROUTE_SUEZ)하는 케이스
  3. 얼음 농도가 너무 짙어 RIO 점수가 -12가 나와 우회(REROUTE_SUEZ)하는 케이스
