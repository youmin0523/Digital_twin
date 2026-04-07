const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { getIceData } = require('../services/dataStore');

// GET /api/ice/concentration?month=2023-03
router.get('/concentration', async (req, res) => {
  try {
    const month = req.query.month || 'latest';
    const data = await getIceData('concentration', month);
    if (!data) {
      return res.status(404).json({ error: `Ice data not found for month: ${month}` });
    }
    res.json(data);
  } catch (err) {
    console.error('[Ice] concentration error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ice/thickness?month=2023-03
router.get('/thickness', async (req, res) => {
  try {
    const month = req.query.month || 'latest';
    const data = await getIceData('thickness', month);
    if (!data) {
      return res.status(404).json({ error: `Thickness data not found for month: ${month}` });
    }
    res.json(data);
  } catch (err) {
    console.error('[Ice] thickness error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ice/archives - 사용 가능한 아카이브 날짜 목록
router.get('/archives', (req, res) => {
  const archiveDir = path.join(__dirname, '..', '..', 'data', 'archive');
  try {
    if (!fs.existsSync(archiveDir)) return res.json({ dates: [] });
    const files = fs.readdirSync(archiveDir);
    const dates = files
      .map(f => f.match(/^realIceData_(\d{8})\.json$/)?.[1])
      .filter(Boolean)
      .map(d => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`)
      .sort()
      .reverse();
    res.json({ dates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
