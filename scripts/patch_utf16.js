const fs = require('fs');
let html = fs.readFileSync('../arctic-hybrid.html', 'utf16le');

const rStart = html.indexOf('const ROUTES = {');
const rEnd = html.indexOf('let currentRouteKey =', rStart);

if (rStart !== -1 && rEnd !== -1) {
  const ROUTES_NEW = `const ROUTES = {
  NSR: [ // 북동항로 (100km 단위 초정밀 연안 핀)
    { lon: 129.04, lat: 35.10, label: '부산항' },
    { lon: 130.80, lat: 35.80, label: '대한해협 우회' },
    { lon: 132.50, lat: 37.50, label: '동해 중앙' },
    { lon: 138.00, lat: 43.00, label: '홋카이도 서해안' },
    { lon: 140.50, lat: 44.50, label: '소야 해협 접근' },
    { lon: 141.20, lat: 45.40, label: '소야 해협' },
    { lon: 141.93, lat: 45.65, label: '소야 해협 통과' },
    { lon: 143.50, lat: 46.20, label: '오호츠크해' },
    { lon: 145.50, lat: 47.00, label: '오호츠크해 중부' },
    { lon: 148.00, lat: 48.00, label: '부솔 해협 접근' },
    { lon: 151.30, lat: 46.50, label: '부솔 해협 (쿠릴 패주)' },
    { lon: 153.00, lat: 46.00, label: '북태평양' },
    { lon: 157.00, lat: 49.00, label: '캄차카 반도 남단 우회' },
    { lon: 161.00, lat: 53.00, label: '캄차카 동해안' },
    { lon: 164.00, lat: 57.00, label: '베링해 진입' },
    { lon: 170.00, lat: 60.00, label: '베링해 중부' },
    { lon: 175.00, lat: 63.00, label: '아나디르 만' },
    { lon: 180.00, lat: 64.50, label: '날짜변경선' },
    { lon: -175.0, lat: 65.00, label: '베링해협 접근' },
    { lon: -168.8, lat: 66.00, label: '베링해협 통과' },
    { lon: -168.0, lat: 67.50, label: '척치해 진입' },
    { lon: -175.0, lat: 70.00, label: '척치해 외곽' },
    { lon: 180.00, lat: 72.50, label: '브랑겔 섬 북방 안심 우회' },
    { lon: 165.00, lat: 73.00, label: '동시베리아해' },
    { lon: 150.00, lat: 77.00, label: '뉴시베리아 제도 북방 안심 우회' },
    { lon: 140.00, lat: 77.00, label: '랍테프해' },
    { lon: 130.00, lat: 77.50, label: '랍테프해 서부' },
    { lon: 115.00, lat: 77.50, label: '타이미르 반도 동쪽 (완전 우회)' },
    { lon: 110.00, lat: 77.80, label: '빌키츠키 접근' },
    { lon: 104.00, lat: 77.92, label: '빌키츠키 해협 중앙선' },
    { lon: 98.00, lat: 77.50, label: '카라해 진입' },
    { lon: 80.00, lat: 77.00, label: '카라해 중앙' },
    { lon: 69.00, lat: 77.50, label: '노바야젬랴 섬 완전 우회' },
    { lon: 60.00, lat: 76.00, label: '바렌츠해 동부' },
    { lon: 45.00, lat: 73.00, label: '바렌츠해 중앙' },
    { lon: 30.00, lat: 72.50, label: '노스케이프 우회' },
    { lon: 18.00, lat: 69.50, label: '노르웨이해' },
    { lon: 5.00, lat: 62.00, label: '북해' },
    { lon: 4.50, lat: 51.90, label: '로테르담' }
  ],
  NWP: [ // 북서항로 (매클루어 심층 - 육상 충돌 원천 차단)
    { lon: 129.04, lat: 35.10, label: '부산항' },
    { lon: 130.80, lat: 35.80, label: '대한해협 우회' },
    { lon: 138.00, lat: 43.00, label: '홋카이도 외곽' },
    { lon: 141.93, lat: 45.65, label: '소야 해협' },
    { lon: 144.50, lat: 47.00, label: '오호츠크해' },
    { lon: 151.30, lat: 46.50, label: '부솔 해협' },
    { lon: 157.00, lat: 49.00, label: '캄차카 반도 우회' },
    { lon: 164.00, lat: 57.00, label: '베링해 진입' },
    { lon: 180.00, lat: 64.50, label: '날짜변경선' },
    { lon: -168.8, lat: 66.00, label: '베링해협 통과' },
    { lon: -165.0, lat: 69.00, label: '척치-보퍼트' },
    { lon: -156.0, lat: 71.80, label: '포인트배로 우회 (육지 충돌 방지)' },
    { lon: -140.0, lat: 72.00, label: '보퍼트해 연안 우회' },
    { lon: -130.0, lat: 73.50, label: '보퍼트해 북상' },
    { lon: -122.0, lat: 74.50, label: '매클루어 입구 (뱅크스 섬 우회)' },
    { lon: -115.0, lat: 74.50, label: '매클루어 해협 관통' },
    { lon: -105.0, lat: 74.50, label: '바이카운트멜빌 해협' },
    { lon: -90.00, lat: 74.20, label: '랭커스터 해협' },
    { lon: -75.00, lat: 73.00, label: '배핀 만 진입' },
    { lon: -65.00, lat: 70.00, label: '배핀 만 내해' },
    { lon: -60.00, lat: 65.00, label: '데이비스 해협' },
    { lon: -50.00, lat: 60.00, label: '래브라도 해' },
    { lon: -30.00, lat: 55.00, label: '대서양 중앙' },
    { lon: -10.00, lat: 50.00, label: '영국 해협 서측' },
    { lon: 0.00, lat: 51.00, label: '도버 해협' },
    { lon: 4.50, lat: 51.90, label: '로테르담' }
  ],
  TSR: [ // 북극횡단항로
    { lon: 129.04, lat: 35.10, label: '부산항' },
    { lon: 130.80, lat: 35.80, label: '대한해협 우회' },
    { lon: 141.93, lat: 45.65, label: '소야 해협 통과' },
    { lon: 151.30, lat: 46.50, label: '부솔 해협' },
    { lon: 164.00, lat: 57.00, label: '베링해 진입' },
    { lon: 180.00, lat: 64.50, label: '날짜변경선' },
    { lon: -168.8, lat: 66.00, label: '베링해협 통과' },
    { lon: -168.0, lat: 70.00, label: '척치해 북방' },
    { lon: 180.00, lat: 80.00, label: '북극해 심해' },
    { lon: 0.00, lat: 89.90, label: '북극점 돌파' },
    { lon: 10.00, lat: 80.00, label: '스발바르 북방' },
    { lon: 10.00, lat: 70.00, label: '노르웨이해' },
    { lon: 5.00, lat: 62.00, label: '북해' },
    { lon: 4.50, lat: 51.90, label: '로테르담' }
  ]
};
`;
  html = html.substring(0, rStart) + ROUTES_NEW + html.substring(rEnd);
} else {
  console.error("ROUTES array not found!");
}

html = html.replace(/const speedMultiplier = multiplier \/ \d+;/g, 'const speedMultiplier = multiplier / 2;');

const getStart = html.indexOf('function getShipPosLonLat() {');
const getEnd = html.indexOf('}', getStart) + 1;
if(getStart !== -1) {
  const GET_NEW = `function getShipPosLonLat() {
        const latRad = (manualBaseLat * Math.PI) / 180;
        const metersPerDegreeLon = METERS_PER_DEGREE_LON_AT_EQUATOR * Math.cos(latRad);
        // Three.js 좌표축을 극대화하여 실제 지도 상 이동 쾌감 증폭 (1.5배)
        const currentLat = manualBaseLat - (shipPos.z * 1.5) / METERS_PER_DEGREE_LAT;
        const currentLon = manualBaseLon + (shipPos.x * 1.5) / metersPerDegreeLon;
        if (!isManual) return routePos(simProgress);
        return {
          lon: currentLon,
          lat: Math.max(-89.9, Math.min(89.9, currentLat)),
        };
      }`;
  html = html.substring(0, getStart) + GET_NEW + html.substring(getEnd);
} else {
  console.error("getShipPosLonLat not found!");
}

html = html.replace(/for \(let d = 2; d <= \d+; d \+= 2\)/g, 'for (let d = 2; d <= 60; d += 2)');

const tStart = html.indexOf('function toggleManual() {');
if(tStart !== -1 && html.indexOf('shipHeading = routeHeading(simProgress);', tStart) !== -1) {
  const replaceStr = `function toggleManual() {
        isManual = !isManual;
        if (isManual) {
          const currentAutoPos = routePos(simProgress);
          manualBaseLon = currentAutoPos.lon;
          manualBaseLat = currentAutoPos.lat;
          shipHeading = routeHeading(simProgress);`;
  
  html = html.substring(0, tStart) + replaceStr + html.substring(html.indexOf('shipHeading = routeHeading(simProgress);', tStart) + 40);
} else {
  console.error("toggleManual not found!");
}

fs.writeFileSync('../arctic-hybrid.html', html, 'utf16le');
console.log("arctic-hybrid.html fully patched using utf16le encoding.");
