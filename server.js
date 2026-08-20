const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_URL = 'https://samehadaku.email';

// Endpoint Scraper Ongoing Asli
app.get('/api/ongoing', async (req, res) => {
  try {
    // Menggunakan Proxy AllOrigins untuk menembus proteksi Cloudflare Samehadaku
    const targetUrl = encodeURIComponent(`${BASE_URL}/anime-terbaru/`);
    const proxyUrl = `https://api.allorigins.win/get?url=${targetUrl}`;

    const response = await axios.get(proxyUrl, { timeout: 15000 });
    const html = response.data.contents;

    if (!html) {
      throw new Error("Gagal mengambil HTML dari target");
    }

    const $ = cheerio.load(html);
    const results = [];

    $('.post-show ul li, .animepost, article.animposx').each((_, el) => {
      const title = $(el).find('.entry-title, .title, h2, h3').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      
      const poster = $(el).find('img').attr('src') || 
                     $(el).find('img').attr('data-src') || 
                     $(el).find('img').attr('data-lazy-src') || '';

      const episode = $(el).find('.ep, .epl, .dtla .epx').first().text().trim();

      if (title && link) {
        results.push({
          id: link.replace(BASE_URL, ''),
          title: title,
          posterUrl: poster,
          episode: episode || 'Ep Terbaru'
        });
      }
    });

    res.json({ status: true, total: results.length, data: results });

  } catch (e) {
    res.status(500).json({ 
      status: false, 
      message: 'Gagal melakukan scraping data asli: ' + e.message, 
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
