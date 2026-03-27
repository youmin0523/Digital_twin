const express = require('express');
const router = express.Router();
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

module.exports = router;
