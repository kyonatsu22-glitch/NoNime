const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. ENDPOINT ONGOING ANIME
app.get('/api/ongoing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(status: RELEASING, type: ANIME, sort: POPULARITY_DESC) {
            id
            title { romaji english }
            coverImage { large }
            episodes
            nextAiringEpisode { episode }
          }
        }
      }
    `;

    const response = await axios.post('https://graphql.anilist.co', {
      query, variables: { perPage: limit }
    }, { timeout: 8000 });

    const animeList = response.data?.data?.Page?.media || [];
    const results = animeList.map(item => ({
      id: item.id.toString(),
      title: item.title.english || item.title.romaji,
      posterUrl: item.coverImage.large || '',
      episode: item.nextAiringEpisode 
        ? `Episode ${item.nextAiringEpisode.episode}` 
        : (item.episodes ? `Total Ep: ${item.episodes}` : 'Ongoing')
    }));

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message, data: [] });
  }
});

// 2. ENDPOINT UPCOMING ANIME
app.get('/api/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(status: NOT_YET_RELEASED, type: ANIME, sort: POPULARITY_DESC) {
            id
            title { romaji english }
            coverImage { large }
            startDate { year month day }
          }
        }
      }
    `;

    const response = await axios.post('https://graphql.anilist.co', {
      query, variables: { perPage: limit }
    }, { timeout: 8000 });

    const animeList = response.data?.data?.Page?.media || [];
    const results = animeList.map(item => ({
      id: item.id.toString(),
      title: item.title.english || item.title.romaji,
      posterUrl: item.coverImage.large || '',
      episode: item.startDate?.year ? `Rilis: ${item.startDate.year}` : 'Segera Hadir'
    }));

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message, data: [] });
  }
});

// 3. ENDPOINT DETAIL ANIME (Memperbaiki Crash Array Episode)
app.get('/api/detail', async (req, res) => {
  try {
    let rawId = req.query.id || req.query.url || '';
    const cleanIdMatch = rawId.toString().match(/\d+/);
    const animeId = cleanIdMatch ? parseInt(cleanIdMatch[0]) : null;

    if (!animeId) {
      return res.status(400).json({ status: false, message: 'ID Anime tidak valid' });
    }

    const query = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id
          title { romaji english }
          coverImage { large }
          bannerImage
          description
          status
          episodes
          nextAiringEpisode { episode }
          genres
          averageScore
        }
      }
    `;

    const response = await axios.post('https://graphql.anilist.co', {
      query, variables: { id: animeId }
    }, { timeout: 8000 });

    const anime = response.data?.data?.Media;
    if (!anime) throw new Error("Anime tidak ditemukan");

    // Hitung jumlah episode yang sudah tayang
    const totalEp = anime.nextAiringEpisode 
      ? anime.nextAiringEpisode.episode - 1 
      : (anime.episodes || 12);

    // Buat Array List Episode agar Flutter tidak error 'type String is not a subtype of List'
    const episodeList = [];
    for (let i = Math.max(1, totalEp); i >= 1; i--) {
      episodeList.push({
        id: `${anime.id}-ep-${i}`,
        title: `Episode ${i}`,
        episode: `Episode ${i}`,
        date: 'Terbaru',
        streamUrl: `https://www.youtube.com/embed/dQw4w9WgXcQ` // Link video player
      });
    }

    res.json({
      status: true,
      data: {
        id: anime.id.toString(),
        title: anime.title.english || anime.title.romaji,
        poster: anime.coverImage.large,
        posterUrl: anime.coverImage.large,
        bannerUrl: anime.bannerImage || anime.coverImage.large,
        synopsis: anime.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Tidak ada sinopsis',
        status: anime.status || 'Ongoing',
        rating: anime.averageScore ? `${anime.averageScore} / 100` : 'N/A',
        genres: anime.genres || [],
        episodes: episodeList // Mengembalikan ARRAY of Objects
      }
    });

  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal memuat detail: ' + error.message });
  }
});

// 4. ENDPOINT STREAM / EPISODE (Untuk pemutar video)
app.get(['/api/stream', '/api/episode'], (req, res) => {
  res.json({
    status: true,
    data: {
      streamUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      downloadLinks: [
        { quality: '360p', url: 'https://example.com/download/360p' },
        { quality: '720p', url: 'https://example.com/download/720p' },
        { quality: '1080p', url: 'https://example.com/download/1080p' }
      ]
    }
  });
});

app.get('/', (req, res) => res.send('Server Scraper Anime Aktif!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
