const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. Endpoint Ongoing Anime
app.get('/api/ongoing', async (req, res) => {
  try {
    // COBA SOURCING UTAMA: Otakudesu / Samehadaku
    const response = await axios.get('https://otakudesu.cloud/ongoing-anime/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(response.data);
    const results = [];

    $('.vencontent .listupd .article, .vencontent .listupd .detal').each((_, el) => {
      const title = $(el).find('.jtitle, .thumbz h2').text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      const poster = $(el).find('img').attr('src') || '';
      const episode = $(el).find('.epz, .epzti').text().trim();

      if (title && link) {
        results.push({
          id: link,
          title: title,
          posterUrl: poster,
          episode: episode || 'Ep Terbaru'
        });
      }
    });

    // Jika scraper berhasil dapat data, tampilkan
    if (results.length > 0) {
      return res.json({ status: true, total: results.length, data: results });
    }

    throw new Error("Scraper kosong, beralih ke API Cadangan");

  } catch (error) {
    // FALLBACK (CADANGAN): Mengambil dari API Anime Publik jika web terblokir
    try {
      const fallbackRes = await axios.get('https://api.jikan.moe/v4/seasons/now?limit=20');
      const fallbackData = fallbackRes.data.data.map(item => ({
        id: item.url,
        title: item.title,
        posterUrl: item.images.jpg.large_image_url || item.images.jpg.image_url,
        episode: item.episodes ? `Episode ${item.episodes}` : 'Ongoing'
      }));

      return res.json({ status: true, total: fallbackData.length, data: fallbackData });
    } catch (err) {
      return res.status(500).json({ status: false, message: 'Gagal mengambil data anime', data: [] });
    }
  }
});

app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
