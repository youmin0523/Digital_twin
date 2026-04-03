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
    const bergs = data.bergs || [];
    res.json({ ...data, bergs, berg_count: bergs.length });
  } catch (err) {
    console.error('[Iceberg] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
