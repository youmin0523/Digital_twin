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

// 빙산 데이터
async function getIcebergData() {
  const cacheKey = 'icebergs_latest';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const data = await readJsonFile(path.join(DATA_DIR, 'realBergData_latest.json'));
  if (data) setCache(cacheKey, data);
  return data;
}

module.exports = { getIceData, getIcebergData };
