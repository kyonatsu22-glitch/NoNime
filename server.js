const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// Domain Samehadaku
const BASE_URL = 'https://samehadaku.email';

// Header lengkap agar tidak terdeteksi bot/terblokir
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': BASE_URL
};

// 1. Endpoint Ongoing Anime
app.get('/api/ongoing', async (req, res) => {
  try {
    let htmlData = '';
    
    // Coba ambil dari halaman anime-terbaru, jika gagal coba halaman utama
    try {
      const resTerbaru = await axios.get(`${BASE_URL}/anime-terbaru/`, { headers: HEADERS, timeout: 10000 });
      htmlData = resTerbaru.data;
    } catch (err) {
      const resHome = await axios.get(`${BASE_URL}/`, { headers: HEADERS, timeout: 10000 });
      htmlData = resHome.data;
    }

    const $ = cheerio.load(htmlData);
    const results = [];

    // Menjangkau semua kemungkinan elemen list anime Samehadaku
    $('.post-show ul li, .animepost, article.animposx, .relat .animposx, .listupd article, .widget_senpai_recent_posts ul li').each((_, el) => {
      const title = $(el).find('.entry-title, .title, .data .title, h2, h3').first().text().trim();
      const link = $(el).find('a').first().attr('href') || '';
      
      // Mengambil URL gambar/poster (termasuk jika memakai lazy load)
      const poster = $(el).find('img').attr('src') || 
                     $(el).find('img').attr('data-src') || 
                     $(el).find('img').attr('data-lazy-src') || '';

      const episode = $(el).find('.ep, .epl, .spt, .dtla .epx').first().text().trim();

      if (title && link) {
        results.push({
          id: link.replace(BASE_URL, ''),
          title: title,
          posterUrl: poster,
          episode: episode || 'Ep Terbaru',
        });
      }
    });

    res.json({ status: true, total: results.length, data: results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message, data: [] });
  }
});

// Root check
app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
