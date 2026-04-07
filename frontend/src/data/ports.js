// ═══════════════════════════════════════════════════════════════
// Port Database — 출발/도착 항구 정보
// ═══════════════════════════════════════════════════════════════

export const PORTS = {
  BUSAN:       { id: 'BUSAN',       lon: 129.04, lat: 35.10, name: '부산',          nameEn: 'Busan' },
  INCHEON:     { id: 'INCHEON',     lon: 126.62, lat: 37.45, name: '인천',          nameEn: 'Incheon' },
  SHANGHAI:    { id: 'SHANGHAI',    lon: 121.47, lat: 31.23, name: '상하이',        nameEn: 'Shanghai' },
  TOKYO:       { id: 'TOKYO',       lon: 139.77, lat: 35.45, name: '도쿄',          nameEn: 'Tokyo' },
  VLADIVOSTOK: { id: 'VLADIVOSTOK', lon: 131.90, lat: 43.12, name: '블라디보스토크', nameEn: 'Vladivostok' },
  ROTTERDAM:   { id: 'ROTTERDAM',   lon: 4.50,   lat: 51.90, name: '로테르담',      nameEn: 'Rotterdam' },
  HAMBURG:     { id: 'HAMBURG',     lon: 9.97,   lat: 53.54, name: '함부르크',      nameEn: 'Hamburg' },
  LONDON:      { id: 'LONDON',      lon: 0.05,   lat: 51.50, name: '런던',          nameEn: 'London' },
  MURMANSK:    { id: 'MURMANSK',    lon: 33.07,  lat: 68.97, name: '무르만스크',    nameEn: 'Murmansk' },
};

export const DEPARTURE_PORTS = ['BUSAN', 'INCHEON', 'SHANGHAI', 'TOKYO', 'VLADIVOSTOK'];
export const ARRIVAL_PORTS   = ['ROTTERDAM', 'HAMBURG', 'LONDON', 'MURMANSK'];
export const ALL_PORTS       = Object.keys(PORTS);
