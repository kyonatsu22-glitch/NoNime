const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Endpoint Ongoing Anime (Limit 25 agar respons instan dan bebas 504 Timeout)
app.get('/api/ongoing', async (req, res) => {
  try {
    const response = await axios.get('https://api.jikan.moe/v4/seasons/now?limit=100', {
      timeout: 8000
    });

    const animeList = response.data?.data || [];

    const results = animeList.map(item => ({
      id: item.url,
      title: item.title,
      posterUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
      episode: item.episodes ? `Episode ${item.episodes}` : 'Ongoing'
    }));

    res.json({
      status: true,
      total: results.length,
      data: results
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: 'Gagal mengambil data anime: ' + error.message,
      data: []
    });
  }
});

app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
