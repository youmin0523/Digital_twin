const express = require('express');
const router = express.Router();
const { getIcebergData } = require('../services/dataStore');

// GET /api/icebergs/latest
router.get('/latest', async (req, res) => {
  try {
    const data = await getIcebergData();
    if (!data) {
      return res.status(404).json({ error: 'Iceberg data not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('[Iceberg] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
