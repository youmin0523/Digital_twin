/**
 * realIceData.ts
 *
 * 실제 OSISAF/NSIDC 해빙 데이터 로더.
 * - /public/data/realIceData_month00.json ~ month11.json 를 fetch
 * - 파일이 없거나 fetch 실패 시 절차적 생성 데이터(mockIceData)로 fallback
 *
 * 오프라인 Python 스크립트로 JSON 파일 생성 방법:
 *   OSISAF 데이터: https://thredds.met.no/thredds/fileServer/osisaf/met.no/ice/amsr2_conc/
 *   pip install netCDF4 numpy
 *   python scripts/convert_osisaf_to_json.py
 */

import { IceDataset } from '../types';
import { generateMonthlyDataset } from './mockIceData';

// 로드된 실데이터 캐시 (월 인덱스 → IceDataset)
const cache: Partial<Record<number, IceDataset>> = {};

// 로딩 중인 Promise (중복 fetch 방지)
const loadingPromises: Partial<Record<number, Promise<IceDataset>>> = {};

/**
 * 해당 월의 해빙 데이터를 비동기로 로드.
 * 실데이터 JSON이 없으면 절차적 데이터로 fallback.
 */
export async function loadIceDataset(month: number): Promise<IceDataset> {
  if (cache[month]) return cache[month]!;
  if (loadingPromises[month]) return loadingPromises[month]!;

  const promise = (async (): Promise<IceDataset> => {
    const monthStr = String(month).padStart(2, '0');
    const url = `/data/realIceData_month${monthStr}.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: IceDataset = await res.json();
      // 기본 유효성 검사
      if (!data.cells || data.cells.length === 0) throw new Error('Empty dataset');
      cache[month] = data;
      return data;
    } catch (e) {
      console.warn(
        `[realIceData] 월 ${month + 1} 실데이터 로드 실패, 절차적 데이터로 fallback:`,
        e
      );
      const fallback = generateMonthlyDataset(month);
      cache[month] = fallback;
      return fallback;
    }
  })();

  loadingPromises[month] = promise;
  return promise;
}

/**
 * 캐시된 데이터를 동기 반환 (애니메이션 루프용).
 * 아직 로드되지 않은 경우 절차적 데이터를 반환하고 백그라운드 fetch 시작.
 */
export function getIceDatasetSync(month: number): IceDataset {
  if (cache[month]) return cache[month]!;

  // 백그라운드 로드 시작 (아직 시작 안 된 경우에만)
  if (!loadingPromises[month]) {
    loadIceDataset(month); // fire-and-forget
  }

  // 즉시 절차적 데이터 반환
  return generateMonthlyDataset(month);
}

/**
 * 특정 월이 실데이터로 로드되었는지 확인.
 */
export function isRealDataLoaded(month: number): boolean {
  return cache[month] !== undefined;
}
