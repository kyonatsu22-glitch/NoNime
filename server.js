const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Endpoint Ongoing Anime Real (Indonesian Subtitle)
app.get('/api/ongoing', async (req, res) => {
  try {
    // Mengambil data real anime ongoing Samehadaku
    const response = await axios.get('https://wajik-anime-api.vercel.app/samehadaku/ongoing', {
      timeout: 10000
    });

    const animeList = response.data?.data?.animeList || response.data?.data || [];
    
    const results = animeList.map(item => ({
      id: item.link || item.id || '',
      title: item.title,
      posterUrl: item.image || item.poster || item.posterUrl,
      episode: item.episode || 'Ep Terbaru'
    }));

    if (results.length > 0) {
      return res.json({ status: true, total: results.length, data: results });
    }

    throw new Error("Data utama kosong");

  } catch (error) {
    // Backup otomatis ke Otakudesu Real jika Samehadaku lambat
    try {
      const fallback = await axios.get('https://otakudesu-api-eight.vercel.app/api/ongoing', { 
        timeout: 10000 
      });
      const fallbackList = fallback.data?.ongoing || fallback.data?.data || [];
      
      const results = fallbackList.map(item => ({
        id: item.link || item.id || '',
        title: item.title,
        posterUrl: item.thumb || item.posterUrl || item.poster,
        episode: item.episode || 'Ep Terbaru'
      }));

      return res.json({ status: true, total: results.length, data: results });
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: 'Gagal mengambil data real: ' + err.message,
        data: []
      });
    }
  }
});

app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
