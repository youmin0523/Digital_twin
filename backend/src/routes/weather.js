const express = require('express');
const { getWeatherData } = require('../services/dataStore');

const router = express.Router();

/**
 * GET /api/weather/latest
 * NSR 항로 기준점별 실시간 기상 데이터 반환.
 * weather_fetcher.py 가 수집한 arctic_weather_latest.json 을 서빙한다.
 */
router.get('/latest', async (req, res) => {
  try {
    const data = await getWeatherData();
    if (!data) {
      return res.status(503).json({
        error: 'Weather data not yet available. Run weather_fetcher.py to populate.',
      });
    }
    res.json(data);
  } catch (err) {
    console.error('[Weather] /latest error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
