const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_URL = 'https://samehadaku.email';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
};

// 1. Endpoint Ongoing Anime (Tembus Cloudflare via RSS Feed)
app.get('/api/ongoing', async (req, res) => {
  try {
    const response = await axios.get(`${BASE_URL}/feed/`, { 
      headers: HEADERS,
      timeout: 10000 
    });

    const $ = cheerio.load(response.data, { xmlMode: true });
    const results = [];

    $('item').each((_, el) => {
      const title = $(el).find('title').text().trim();
      const link = $(el).find('link').text().trim();
      const content = $(el).find('content\\:encoded').text() || $(el).find('description').text();

      // Cari URL poster dari tag img di dalam deskripsi
      const imgMatch = content.match(/src=["'](.*?)["']/);
      const posterUrl = imgMatch ? imgMatch[1] : '';

      // Ekstrak info episode dari judul
      const epMatch = title.match(/Episode\s+(\d+)/i);
      const episode = epMatch ? `Episode ${epMatch[1]}` : 'Ep Terbaru';

      if (title && link) {
        results.push({
          id: link.replace(BASE_URL, ''),
          title: title,
          posterUrl: posterUrl,
          episode: episode,
        });
      }
    });

    res.json({ status: true, total: results.length, data: results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message, data: [] });
  }
});

app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
