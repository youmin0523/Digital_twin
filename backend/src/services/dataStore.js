const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

// 메모리 캐시 (TTL 5분)
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

// 해빙 농도 데이터
async function getIceData(type, month) {
  const cacheKey = `ice_${type}_${month}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let fileName;
  if (month === 'latest') {
    fileName = 'realIceData_latest.json';
  } else {
    // month 형식: "2023-03" → "03"
    const mm = month.includes('-') ? month.split('-')[1] : month;
    fileName = `realIceData_month${mm}.json`;
  }

  const data = await readJsonFile(path.join(DATA_DIR, fileName));
  if (data) setCache(cacheKey, data);
  return data;
}

// 빙산 데이터 (NIC/IIP — 남극 필터링)
async function getIcebergData() {
  const cacheKey = 'icebergs_latest';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await readJsonFile(path.join(DATA_DIR, 'realBergData_latest.json'));
  if (data && data.bergs) {
    // 남극 빙산(lat < 0) 필터링
    data.bergs = data.bergs.filter(b => b.lat >= 0);
    data.berg_count = data.bergs.length;
  }
  if (data) setCache(cacheKey, data);
  return data;
}

// Copernicus SAR 빙산 데이터 (파일 변경 감지로 자동 갱신)
const COP_FILE = path.join(DATA_DIR, 'copernicus_icebergs.json');
let copDataCache = null;
let copFileMtime = 0;

async function getCopernicusIcebergData() {
  try {
    const stat = await fs.promises.stat(COP_FILE);
    const mtime = stat.mtimeMs;
    // 파일이 변경되었거나 캐시 없으면 다시 읽기
    if (!copDataCache || mtime > copFileMtime) {
      copDataCache = await readJsonFile(COP_FILE);
      copFileMtime = mtime;
      if (copDataCache) console.log(`[DataStore] copernicus_icebergs.json reloaded (${copDataCache.count || '?'} icebergs)`);
    }
  } catch {
    // 파일 없으면 null
  }
  return copDataCache;
}

// 기상 데이터 (Open-Meteo — weather_fetcher.py 수집, 5개 항로)
// 6시간마다 갱신되므로 캐시 TTL을 30분으로 설정
const WEATHER_CACHE_TTL = 30 * 60 * 1000;

async function getWeatherData() {
  const cacheKey = 'weather_latest';
  const entry = cache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < WEATHER_CACHE_TTL) {
    return entry.data;
  }
  cache.delete(cacheKey);
  let data = await readJsonFile(path.join(DATA_DIR, 'weather_latest.json'));
  if (!data) data = await readJsonFile(path.join(DATA_DIR, 'arctic_weather_latest.json'));
  if (data) cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}

module.exports = { getIceData, getIcebergData, getCopernicusIcebergData, getWeatherData };
