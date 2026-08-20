const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_URL = 'https://samehadaku.email';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
};

// Endpoint Ongoing Anime (Scrape Halaman Depan)
app.get('/api/ongoing', async (req, res) => {
  try {
    const { data } = await axios.get(BASE_URL, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];

    $('.post-show ul li, article.animposx, .relat .animposx, .listupd article').each((_, el) => {
      const title = $(el).find('.entry-title, .title, .data .title').text().trim();
      const link = $(el).find('a').attr('href') || '';
      const poster = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const episode = $(el).find('.ep, .epl, .spt').text().trim();

      if (title && link) {
        results.push({
          id: link.replace(BASE_URL, ''),
          title: title,
          posterUrl: poster,
          episode: episode || 'Ep Terbaru',
        });
      }
    });

    res.json({ status: true, data: results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message, data: [] });
  }
});

app.get('/', (req, res) => {
  res.send('Server Scraper Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
