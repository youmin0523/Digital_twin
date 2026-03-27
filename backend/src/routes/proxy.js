const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function proxyTile(targetUrl, res) {
  try {
    const response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 DigitalTwin/1.0' },
      timeout: 15000,
    });

    if (!response.ok) {
      res.set('Content-Type', 'image/png');
      res.set('Access-Control-Allow-Origin', '*');
      return res.send(TRANSPARENT_PNG);
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    res.set('Content-Type', contentType);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = await response.buffer();
    res.send(buffer);
  } catch (err) {
    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(TRANSPARENT_PNG);
  }
}

// ── 기존 arctic-hybrid.html 호환 경로 ──────────────────────────
// GET /nsidc-proxy/?SERVICE=WMS&... → NASA GIBS WMS
router.get('/', (req, res, next) => {
  // 이 라우터는 /proxy 아래에 마운트되므로 여기서는 /nsidc, /copernicus만 처리
  next();
});

// GET /proxy/nsidc?url=... (새 React 프론트용)
router.get('/nsidc', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'url parameter required' });
  }
  await proxyTile(targetUrl, res);
});

// GET /proxy/copernicus?url=... (새 React 프론트용)
router.get('/copernicus', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: 'url parameter required' });
  }
  await proxyTile(targetUrl, res);
});

module.exports = router;

// ── 기존 HTML 호환 라우트 (index.js에서 별도 마운트) ────────────
module.exports.legacyNsidcProxy = async (req, res) => {
  const qs = require('url').parse(req.url).query || '';
  const targetUrl = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?' + qs;
  await proxyTile(targetUrl, res);
};

module.exports.legacyCopProxy = async (req, res) => {
  const qs = require('url').parse(req.url).query || '';
  const targetUrl = 'https://wmts.marine.copernicus.eu/teroWmts?' + qs;
  await proxyTile(targetUrl, res);
};
