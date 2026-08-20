const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const BASE_URL = 'https://samehadaku.email';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': BASE_URL
};

// 1. Anime Terbaru / Ongoing
app.get('/api/ongoing', async (req, res) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/anime-terbaru/`, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];

    $('.post-show ul li').each((_, el) => {
      results.push({
        id: $(el).find('a').attr('href').replace(BASE_URL, ''),
        title: $(el).find('.entry-title').text().trim(),
        poster: $(el).find('img').attr('src') || '',
        episode: $(el).find('.ep').text().trim(),
        releaseDate: $(el).find('.time').text().trim(),
      });
    });

    res.json({ status: true, data: results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// 2. Upcoming / Jadwal Rilis
app.get('/api/upcoming', async (req, res) => {
  try {
    const { data } = await axios.get(`${BASE_URL}/jadwal-rilis/`, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];

    $('.schedule .animepost').each((_, el) => {
      results.push({
        id: $(el).find('a').attr('href').replace(BASE_URL, ''),
        title: $(el).find('.title').text().trim(),
        poster: $(el).find('img').attr('src') || '',
        type: $(el).find('.type').text().trim() || 'TV',
      });
    });

    res.json({ status: true, data: results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// 3. Pencarian Anime
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q;
    const { data } = await axios.get(`${BASE_URL}/?s=${encodeURIComponent(query)}`, { headers: HEADERS });
    const $ = cheerio.load(data);
    const results = [];

    $('.animepost').each((_, el) => {
      results.push({
        id: $(el).find('a').attr('href').replace(BASE_URL, ''),
        title: $(el).find('.title').text().trim(),
        poster: $(el).find('img').attr('src') || '',
        score: $(el).find('.score').text().trim() || '8.0',
      });
    });

    res.json({ status: true, data: results });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// 4. Detail Anime & Daftar Episode
app.get('/api/detail', async (req, res) => {
  try {
    const path = req.query.path;
    const { data } = await axios.get(`${BASE_URL}${path}`, { headers: HEADERS });
    const $ = cheerio.load(data);

    const title = $('.entry-title').text().trim();
    const poster = $('.infoanime .thumb img').attr('src') || '';
    const synopsis = $('.entry-content-single').text().trim();
    const studio = $('.spe span:contains("Studio")').text().replace('Studio:', '').trim();
    const status = $('.spe span:contains("Status")').text().replace('Status:', '').trim();

    const episodes = [];
    $('.lister ul li').each((_, el) => {
      episodes.push({
        id: $(el).find('.eps a').attr('href').replace(BASE_URL, ''),
        number: $(el).find('.eps a').text().trim(),
        title: $(el).find('.title').text().trim(),
        date: $(el).find('.date').text().trim(),
      });
    });

    res.json({
      status: true,
      data: { id: path, title, poster, synopsis, studio, status, episodes }
    });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

// 5. Stream Video Embed URL Excerpt
app.get('/api/stream', async (req, res) => {
  try {
    const path = req.query.path;
    const { data } = await axios.get(`${BASE_URL}${path}`, { headers: HEADERS });
    const $ = cheerio.load(data);

    const embedUrl = $('#pembed iframe').attr('src') || $('#player_embed iframe').attr('src') || '';

    res.json({ status: true, embedUrl });
  } catch (e) {
    res.status(500).json({ status: false, message: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
