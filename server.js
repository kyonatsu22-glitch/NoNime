const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. ENDPOINT ONGOING ANIME (60 Anime)
app.get('/api/ongoing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 60;

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
      endpoint: item.id.toString(),
      title: item.title.english || item.title.romaji,
      poster: item.coverImage.large || '',
      posterUrl: item.coverImage.large || '',
      thumb: item.coverImage.large || '',
      episode: item.nextAiringEpisode 
        ? `Episode ${item.nextAiringEpisode.episode}` 
        : (item.episodes ? `Total Ep: ${item.episodes}` : 'Ongoing')
    }));

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message, data: [] });
  }
});

// 2. ENDPOINT UPCOMING ANIME (60 Anime)
app.get('/api/upcoming', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 60;

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
      endpoint: item.id.toString(),
      title: item.title.english || item.title.romaji,
      poster: item.coverImage.large || '',
      posterUrl: item.coverImage.large || '',
      thumb: item.coverImage.large || '',
      episode: item.startDate?.year ? `Rilis: ${item.startDate.year}` : 'Segera Hadir'
    }));

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message, data: [] });
  }
});

// 3. ENDPOINT DETAIL ANIME (Anti Fail: Multi-Route & Multi-Key)
const handleDetail = async (req, res) => {
  try {
    let rawId = req.params.id || req.query.id || req.query.url || req.query.endpoint || '';
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

    const totalEp = anime.nextAiringEpisode 
      ? anime.nextAiringEpisode.episode - 1 
      : (anime.episodes || 12);

    const episodeList = [];
    for (let i = Math.max(1, totalEp); i >= 1; i--) {
      episodeList.push({
        id: `${anime.id}-ep-${i}`,
        endpoint: `${anime.id}-ep-${i}`,
        title: `Episode ${i}`,
        episode: `Episode ${i}`,
        date: 'Terbaru',
        streamUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        url: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      });
    }

    const detailData = {
      id: anime.id.toString(),
      endpoint: anime.id.toString(),
      title: anime.title.english || anime.title.romaji,
      poster: anime.coverImage.large,
      posterUrl: anime.coverImage.large,
      thumb: anime.coverImage.large,
      bannerUrl: anime.bannerImage || anime.coverImage.large,
      synopsis: anime.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Tidak ada sinopsis',
      sinopsis: anime.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Tidak ada sinopsis',
      status: anime.status || 'Ongoing',
      rating: anime.averageScore ? `${anime.averageScore} / 100` : 'N/A',
      genres: anime.genres || [],
      genre: anime.genres || [],
      episodes: episodeList,
      episode_list: episodeList
    };

    res.json({
      status: true,
      data: detailData
    });

  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal memuat detail: ' + error.message });
  }
};

app.get('/api/detail', handleDetail);
app.get('/api/detail/:id', handleDetail);
app.get('/api/anime/:id', handleDetail);

// 4. ENDPOINT STREAM
app.get(['/api/stream', '/api/episode', '/api/episode/:id'], (req, res) => {
  res.json({
    status: true,
    data: {
      streamUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
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
