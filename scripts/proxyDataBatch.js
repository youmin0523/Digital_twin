/**
 * [Proxy/Batch Server] 외부 기관 API (NetCDF/GeoTIFF) → JSON 변환 스크립트
 * 
 * 목적:
 * 1. Copernicus(해빙 두께), NSIDC(해빙 농도), GEBCO(수심) 등 무거운 Raw 데이터를 주기적으로 다운로드 (Cron Job)
 * 2. 프론트엔드(브라우저)에서 즉시 A* 경로 탐색에 쓸 수 있도록 경량화된 1D/2D 숫자 배열(JSON)로 직렬화
 * 3. Token 및 CORS 우회를 위한 Proxy 백엔드 역할
 */

const fs = require('fs');
const path = require('path');

// [설정] 스케줄러 및 데이터 환경변수
const CONFIG = {
    COPERNICUS_THREDDS_URL: process.env.COPERNICUS_URL || 'https://my.cmems-du.eu/thredds/ncss/grid/...',
    NSIDC_API_URL: process.env.NSIDC_URL || 'https://nsidc.org/api/mapservices/NSIDC/wms',
    OUTPUT_FILE: path.join(__dirname, '../client/public/data/dynamicIceData.json'),
    GRID_RESOLUTION_DEGREE: 1.0 // 1도 단위 격자 압축
};

// [Mock] NetCDF 파싱 시뮬레이션용 해빙 생성기 (실 구현 시 netcdf4, gdal 등의 파서 라이브러체인으로 대체)
function parseNetCDFMock() {
    console.log('[Proxy] 외부 API 호출: Copernicus NetCDF / NSIDC 데이터 다운로드 중... (Mock)');
    const cells = [];
    
    // 북극권 (위도 60도 이상)에 대해 1도 단위로 해빙 농도 및 수심 데이터 추출 가정
    for (let lat = 60; lat <= 90; lat += CONFIG.GRID_RESOLUTION_DEGREE) {
        for (let lon = -180; lon <= 180; lon += CONFIG.GRID_RESOLUTION_DEGREE) {
            // 위도가 높을수록 농도 확률 짙어지도록 모의 생성
            const intensity = Math.max(0, (lat - 65) / 25);
            const noise = (Math.random() - 0.5) * 0.3;
            let concentration = intensity + noise;
            
            if (concentration < 0.1) continue; // 얼음이 거의 없는 곳은 패스 (최적화)
            if (concentration > 1.0) concentration = 1.0;
            
            // 수심 (Bathymetry) - 내륙 관통을 막고 얕은 곳을 감지하기 위한 mock
            // 실제 데이터에서는 GEBCO NetCDF에서 고도값을 파싱함 (0 이하면 바다)
            const depth = -100 - Math.random() * 4000; 

            cells.push({
                lat: parseFloat(lat.toFixed(2)),
                lon: parseFloat(lon.toFixed(2)),
                concentration: parseFloat(concentration.toFixed(3)),
                depth: Math.round(depth)
            });
        }
    }
    return cells;
}

// [메인 파이프라인] 매일 자정 등에 크론(Cron)으로 실행될 메인 파서
async function runBatchPipeline() {
    try {
        console.log('=== [Arctic Digital Twin] Proxy Data Batch Started ===');
        const startTime = Date.now();
        
        // 1. 외부 API 연동 및 파싱 (NetCDF -> Memory Array)
        const parsedGrid = parseNetCDFMock();
        console.log(`[Proxy] 파싱 완료. 생성된 의미있는 격자 수: ${parsedGrid.length} 개 셀`);
        
        // 2. 메타데이터 패키징
        const optimizedPayload = {
            metadata: {
                timestamp: new Date().toISOString(),
                source: ["Copernicus Marine Service", "NSIDC Sea Ice Index"],
                resolution_deg: CONFIG.GRID_RESOLUTION_DEGREE,
                total_cells: parsedGrid.length
            },
            cells: parsedGrid
        };
        
        // 3. 브라우저가 읽을 수 있게 직렬화 및 적재
        // 경로 생성을 위해, client/public 하위나 정적 디렉토리에 JSON 저장
        const targetDir = path.dirname(CONFIG.OUTPUT_FILE);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        
        fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(optimizedPayload));
        
        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`[Proxy] JSON 생성 성공. 소요시간: ${elapsed.toFixed(2)}초`);
        console.log(`[Proxy] Output Path: ${CONFIG.OUTPUT_FILE}`);
        console.log('=== Proxy Data Batch Finished ===');
        
    } catch (e) {
        console.error('[Proxy] Data Batch 예외 발생:', e);
    }
}

// 스크립트 단독 실행 시 파이프라인 시작
if (require.main === module) {
    runBatchPipeline();
}

module.exports = { runBatchPipeline };
