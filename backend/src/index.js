require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');
const schedule = require('node-schedule');

const iceRouter = require('./routes/ice');
const icebergRouter = require('./routes/iceberg');
const routingRouter = require('./routes/routing');
const proxyRouter = require('./routes/proxy');
const { legacyNsidcProxy, legacyCopProxy, legacySentinelProxy } = require('./routes/proxy');
const pipelineRouter = require('./routes/pipeline');
const weatherRouter = require('./routes/weather');

const app = express();
const PORT = process.env.PORT || 8000;

// 미들웨어
app.use(cors());
app.use(express.json());

// API 라우트
app.use('/api/ice', iceRouter);
app.use('/api/icebergs', icebergRouter);
app.use('/api/route', routingRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/weather', weatherRouter);
app.use('/proxy', proxyRouter);

// 기존 arctic-hybrid.html 호환 프록시
app.get('/nsidc-proxy/', legacyNsidcProxy);
app.get('/cop-proxy/', legacyCopProxy);
app.get('/sentinel-proxy/', legacySentinelProxy);

// 정적 데이터 파일 서빙
app.use('/data', express.static(path.join(__dirname, '..', 'data')));

// 기존 모놀리스 HTML 서빙 (기존 방식 호환)
app.use(express.static(path.join(__dirname, '..', 'public')));

// 헬스 체크
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Iceberg pipeline scheduler ──────────────────────────────────
const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'update_icebergs.py');

function runIcebergPipeline() {
  console.log('[Scheduler] Running iceberg pipeline...');
  const env = {
    ...process.env,
    COPERNICUSMARINE_SERVICE_USERNAME: process.env.COPERNICUS_MARINE_USER,
    COPERNICUSMARINE_SERVICE_PASSWORD: process.env.COPERNICUS_MARINE_PASSWORD,
  };
  execFile('python', [SCRIPT_PATH], { env, timeout: 300000 }, (err, stdout, stderr) => {
    if (err) console.error('[Scheduler] Pipeline error:', err.message);
    if (stdout) console.log('[Scheduler]', stdout.trim());
    if (stderr) console.error('[Scheduler] stderr:', stderr.trim());
  });
}

// ── NIC/NSIDC Iceberg Fetcher scheduler ─────────────────────────
const BERG_FETCHER_PATH = path.join(
  __dirname, '..', 'pipeline', 'fetchers', 'iceberg_fetcher.py'
);

function runBergFetcher() {
  console.log('[Scheduler] Running iceberg_fetcher (NIC/GitHub/NSIDC)...');
  execFile('python', [BERG_FETCHER_PATH], { timeout: 180000 }, (err, stdout, stderr) => {
    if (err) console.error('[Scheduler] Berg fetcher error:', err.message);
    if (stdout) console.log('[BergFetcher]', stdout.trim().slice(-500));
    if (stderr) console.error('[BergFetcher] stderr:', stderr.trim().slice(-200));
  });
}

// ── Copernicus Ice Fetcher scheduler ────────────────────────────
const ICE_FETCHER_PATH = path.join(
  __dirname, '..', 'pipeline', 'fetchers', 'copernicus_fetcher.py'
);

function runIceFetcher() {
  console.log('[Scheduler] Running copernicus_fetcher (sea ice concentration)...');
  const env = {
    ...process.env,
    COPERNICUSMARINE_SERVICE_USERNAME: process.env.COPERNICUS_MARINE_USER,
    COPERNICUSMARINE_SERVICE_PASSWORD: process.env.COPERNICUS_MARINE_PASSWORD,
  };
  execFile('python', [ICE_FETCHER_PATH], { env, timeout: 600000 }, (err, stdout, stderr) => {
    if (err) console.error('[Scheduler] Ice fetcher error:', err.message);
    if (stdout) console.log('[IceFetcher]', stdout.trim().slice(-500));
    if (stderr) console.error('[IceFetcher] stderr:', stderr.trim().slice(-200));
  });
}

// ── Weather pipeline scheduler ───────────────────────────────────
const WEATHER_SCRIPT_PATH = path.join(
  __dirname, '..', 'pipeline', 'fetchers', 'weather_fetcher.py'
);

function runWeatherPipeline() {
  console.log('[Scheduler] Running weather pipeline (Open-Meteo, all routes)...');
  execFile('python', [WEATHER_SCRIPT_PATH], { timeout: 180000 }, (err, stdout, stderr) => {
    if (err) console.error('[Scheduler] Weather pipeline error:', err.message);
    if (stdout) console.log('[Weather]', stdout.trim().slice(-500));
    if (stderr) console.error('[Weather] stderr:', stderr.trim().slice(-200));
  });
}

// 매일 새벽 2시 UTC (Copernicus 해빙 농도)
schedule.scheduleJob('0 2 * * *', runIceFetcher);
// 매일 새벽 3시 UTC (Copernicus SAR 빙산 파이프라인)
schedule.scheduleJob('0 3 * * *', runIcebergPipeline);
// 매일 새벽 4시 UTC (NIC/NSIDC 빙산 fetcher - SAR 이후)
schedule.scheduleJob('0 4 * * *', runBergFetcher);
// 6시간마다 기상 파이프라인 (Open-Meteo 전 항로)
schedule.scheduleJob('30 */6 * * *', runWeatherPipeline);

// 서버 시작 30초 후 Copernicus SAR 빙산 파이프라인 1회 실행
setTimeout(runIcebergPipeline, 30000);
// 서버 시작 90초 후 NIC/NSIDC berg fetcher 1회 실행
setTimeout(runBergFetcher, 90000);
// 서버 시작 60초 후 기상 파이프라인 1회 실행
setTimeout(runWeatherPipeline, 60000);

app.listen(PORT, () => {
  console.log(`[Server] Arctic Digital Twin API running on http://localhost:${PORT}`);
  console.log(`[Scheduler] Ice fetcher: 02:00 UTC | SAR pipeline: 03:00 UTC | Berg fetcher: 04:00 UTC | Weather: every 6h`);
});
