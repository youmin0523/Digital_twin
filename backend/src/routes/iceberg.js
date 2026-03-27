const express = require('express');
const router = express.Router();
const { getIcebergData } = require('../services/dataStore');

// GET /api/icebergs/latest
// 북극항로 관련 빙산만 반환 (북위 40° 이상)
router.get('/latest', async (req, res) => {
  try {
    const data = await getIcebergData();
    if (!data) {
      return res.status(404).json({ error: 'Iceberg data not found' });
    }
    const arcticBergs = (data.bergs || []).filter(b => b.lat >= 40);
    res.json({ ...data, bergs: arcticBergs, berg_count: arcticBergs.length });
  } catch (err) {
    console.error('[Iceberg] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
