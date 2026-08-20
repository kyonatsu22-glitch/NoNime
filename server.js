const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const ANILIST_URL = 'https://graphql.anilist.co';

// Helper mengambil 60 anime (Menggabungkan Page 1 & Page 2 karena batas AniList max 50/page)
async function fetchAniList(status, limit = 60) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(status: ${status}, type: ANIME, sort: POPULARITY_DESC) {
          id
          title { romaji english }
          coverImage { large }
          episodes
          nextAiringEpisode { episode }
          startDate { year month day }
        }
      }
    }
  `;

  const req1 = axios.post(ANILIST_URL, { query, variables: { page: 1, perPage: 50 } }, { timeout: 8000 });
  const req2 = limit > 50 
    ? axios.post(ANILIST_URL, { query, variables: { page: 2, perPage: limit - 50 } }, { timeout: 8000 })
    : null;

  const [res1, res2] = await Promise.all([req1, req2]);
  const list1 = res1.data?.data?.Page?.media || [];
  const list2 = res2 ? (res2.data?.data?.Page?.media || []) : [];
  
  return [...list1, ...list2];
}

// 1. ONGOING ANIME (PAS 60 ANIME)
app.get(['/api/ongoing', '/api/ongoing/page/:page'], async (req, res) => {
  try {
    const rawData = await fetchAniList('RELEASING', 60);
    const results = rawData.map(item => ({
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

// 2. UPCOMING ANIME (PAS 60 ANIME)
app.get(['/api/upcoming', '/api/upcoming/page/:page'], async (req, res) => {
  try {
    const rawData = await fetchAniList('NOT_YET_RELEASED', 60);
    const results = rawData.map(item => {
      const rilis = item.startDate?.year ? `Rilis: ${item.startDate.year}` : 'Segera Hadir';
      return {
        id: item.id.toString(),
        endpoint: item.id.toString(),
        title: item.title.english || item.title.romaji,
        poster: item.coverImage.large || '',
        posterUrl: item.coverImage.large || '',
        thumb: item.coverImage.large || '',
        episode: rilis
      };
    });

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.status(500).json({ status: false, message: error.message, data: [] });
  }
});

// 3. DETAIL ANIME (Anti Crash: Menyediakan Format Teks & Array Sekaligus)
const handleDetail = async (req, res) => {
  try {
    let rawId = req.params.id || req.query.id || req.query.endpoint || req.query.url || '';
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

    const response = await axios.post(ANILIST_URL, { query, variables: { id: animeId } }, { timeout: 8000 });
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
        judul: `Episode ${i}`,
        episode: `Episode ${i}`,
        date: 'Terbaru',
        uploaded: 'Terbaru',
        streamUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        url: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      });
    }

    const genresList = anime.genres || [];
    const genresString = genresList.join(', ');
    const synopsisText = anime.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Tidak ada sinopsis';

    const detailObj = {
      id: anime.id.toString(),
      endpoint: anime.id.toString(),
      title: anime.title.english || anime.title.romaji,
      judul: anime.title.english || anime.title.romaji,
      poster: anime.coverImage.large,
      posterUrl: anime.coverImage.large,
      thumb: anime.coverImage.large,
      bannerUrl: anime.bannerImage || anime.coverImage.large,
      synopsis: synopsisText,
      sinopsis: synopsisText,
      description: synopsisText,
      status: anime.status || 'Ongoing',
      type: 'TV',
      rating: anime.averageScore ? `${anime.averageScore} / 100` : 'N/A',
      score: anime.averageScore ? `${anime.averageScore}` : '8.0',
      genres: genresList,
      genre: genresString,
      episodes: episodeList,
      episode_list: episodeList,
      episodeList: episodeList
    };

    res.json({
      status: true,
      data: detailObj
    });

  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal memuat detail: ' + error.message });
  }
};

app.get('/api/detail', handleDetail);
app.get('/api/detail/:id', handleDetail);
app.get('/api/anime/:id', handleDetail);
app.get('/api/anime/detail/:id', handleDetail);

// 4. STREAM / EPISODE
app.get(['/api/stream', '/api/episode', '/api/episode/:id', '/api/stream/:id'], (req, res) => {
  res.json({
    status: true,
    data: {
      streamUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      link: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
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
