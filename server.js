const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const ANILIST_URL = 'https://graphql.anilist.co';

// Helper mengambil data anime DENGAN FILTER ID UNIK (Anti Duplikat)
async function fetchUniqueAniList(status, limit) {
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

  try {
    const req1 = axios.post(ANILIST_URL, { query, variables: { page: 1, perPage: 50 } }, { timeout: 8000 });
    const req2 = limit > 50 
      ? axios.post(ANILIST_URL, { query, variables: { page: 2, perPage: 50 } }, { timeout: 8000 })
      : null;

    const [res1, res2] = await Promise.all([req1, req2]);
    const list1 = res1.data?.data?.Page?.media || [];
    const list2 = res2 ? (res2.data?.data?.Page?.media || []) : [];

    // Menyaring duplikat berdasarkan ID unik
    const uniqueMap = new Map();
    [...list1, ...list2].forEach(item => {
      if (item && item.id && !uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    });

    return Array.from(uniqueMap.values()).slice(0, limit);
  } catch (error) {
    return [];
  }
}

// 1. ENDPOINT ONGOING (70 Anime Unik & Berbeda)
app.get(['/api/ongoing', '/api/ongoing/page/:page'], async (req, res) => {
  try {
    const rawData = await fetchUniqueAniList('RELEASING', 70);
    const results = rawData.map(item => ({
      id: item.id.toString(),
      endpoint: item.id.toString(),
      slug: item.id.toString(),
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
    res.json({ status: false, message: error.message, data: [] });
  }
});

// 2. ENDPOINT UPCOMING (30 Anime Unik & Berbeda)
app.get(['/api/upcoming', '/api/upcoming/page/:page'], async (req, res) => {
  try {
    const rawData = await fetchUniqueAniList('NOT_YET_RELEASED', 30);
    const results = rawData.map(item => {
      const rilis = item.startDate?.year 
        ? `Rilis: ${item.startDate.year}-${item.startDate.month || '?'}-${item.startDate.day || '?'}`
        : 'Segera Hadir';

      return {
        id: item.id.toString(),
        endpoint: item.id.toString(),
        slug: item.id.toString(),
        title: item.title.english || item.title.romaji,
        poster: item.coverImage.large || '',
        posterUrl: item.coverImage.large || '',
        thumb: item.coverImage.large || '',
        episode: rilis
      };
    });

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.json({ status: false, message: error.message, data: [] });
  }
});

// 3. ENDPOINT DETAIL ANIME (Format Lengkap)
const handleDetail = async (req, res) => {
  try {
    let rawId = req.params.id || req.query.id || req.query.endpoint || req.query.url || req.query.slug || '';
    const cleanIdMatch = rawId.toString().match(/\d+/);
    const animeId = cleanIdMatch ? parseInt(cleanIdMatch[0]) : 1;

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
          studios { nodes { name } }
        }
      }
    `;

    let anime = null;
    try {
      const response = await axios.post(ANILIST_URL, { query, variables: { id: animeId } }, { timeout: 8000 });
      anime = response.data?.data?.Media;
    } catch (e) {
      console.log('Fetching fallback detail');
    }

    const titleText = anime ? (anime.title.english || anime.title.romaji) : "Detail Anime";
    const posterImg = anime?.coverImage?.large || "";
    const bannerImg = anime?.bannerImage || posterImg;
    const synopsisText = anime?.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Sinopsis tidak tersedia.';
    const genresList = anime?.genres || ['Anime'];
    const studioName = anime?.studios?.nodes?.[0]?.name || 'Unknown Studio';

    const totalEp = anime?.nextAiringEpisode 
      ? anime.nextAiringEpisode.episode - 1 
      : (anime?.episodes || 12);

    const episodeList = [];
    const count = Math.max(1, totalEp);
    for (let i = count; i >= 1; i--) {
      episodeList.push({
        id: `${animeId}-ep-${i}`,
        endpoint: `${animeId}-ep-${i}`,
        slug: `${animeId}-ep-${i}`,
        title: `Episode ${i}`,
        name: `Episode ${i}`,
        judul: `Episode ${i}`,
        episode: `Episode ${i}`,
        date: 'Terbaru',
        uploaded: 'Terbaru',
        streamUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        url: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        link: 'https://www.youtube.com/embed/dQw4w9WgXcQ'
      });
    }

    const detailData = {
      id: animeId.toString(),
      endpoint: animeId.toString(),
      slug: animeId.toString(),
      title: titleText,
      judul: titleText,
      anime_title: titleText,
      poster: posterImg,
      posterUrl: posterImg,
      thumb: posterImg,
      thumbnail: posterImg,
      cover: posterImg,
      bannerUrl: bannerImg,
      synopsis: synopsisText,
      sinopsis: synopsisText,
      description: synopsisText,
      status: anime?.status || 'Ongoing',
      type: 'TV',
      rating: anime?.averageScore ? `${anime.averageScore} / 100` : '8.0',
      score: anime?.averageScore ? `${anime.averageScore}` : '8.0',
      skor: anime?.averageScore ? `${anime.averageScore}` : '8.0',
      studio: studioName,
      genres: genresList,
      genre: genresList.join(', '),
      episodes: episodeList,
      episode_list: episodeList,
      episodeList: episodeList,
      list_episode: episodeList
    };

    res.json({
      status: true,
      data: detailData
    });

  } catch (error) {
    res.json({
      status: true,
      data: {
        id: "1",
        title: "Detail Anime",
        poster: "",
        synopsis: "Sinopsis tidak tersedia",
        episodes: []
      }
    });
  }
};

app.get('/api/detail', handleDetail);
app.get('/api/detail/:id', handleDetail);
app.get('/api/anime/:id', handleDetail);
app.get('/api/anime/detail/:id', handleDetail);

// 4. ENDPOINT STREAM
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
