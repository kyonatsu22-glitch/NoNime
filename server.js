const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const ANILIST_URL = 'https://graphql.anilist.co';

// Helper mengambil data anime ONGOING khusus MURNI ANIME TV (No Shorts, No Hentai, No Infinite Kids Show)
async function fetchUniqueAniList(status, limit) {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(status: ${status}, type: ANIME, format: TV, isAdult: false, sort: POPULARITY_DESC) {
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

    const uniqueMap = new Map();
    [...list1, ...list2].forEach(item => {
      // Saring anime dengan episode sangat panjang seperti Shin-Chan (>200 ep)
      if (item && item.id && !uniqueMap.has(item.id) && (!item.episodes || item.episodes < 200)) {
        uniqueMap.set(item.id, item);
      }
    });

    return Array.from(uniqueMap.values()).slice(0, limit);
  } catch (error) {
    return [];
  }
}

// 1. ENDPOINT ONGOING (70 Anime TV Resmi & Non-Shorts)
app.get(['/api/ongoing', '/api/ongoing/page/:page'], async (req, res) => {
  try {
    const rawData = await fetchUniqueAniList('RELEASING', 70);
    const results = rawData.map(item => {
      const currentEp = item.nextAiringEpisode 
        ? item.nextAiringEpisode.episode - 1 
        : (item.episodes || 'Ongoing');

      return {
        id: item.id.toString(),
        endpoint: item.id.toString(),
        slug: item.id.toString(),
        title: item.title.english || item.title.romaji,
        poster: item.coverImage.large || '',
        posterUrl: item.coverImage.large || '',
        thumb: item.coverImage.large || '',
        episode: typeof currentEp === 'number' && currentEp > 0 ? `Episode ${currentEp}` : 'Ongoing'
      };
    });

    res.json({ status: true, total: results.length, data: results });
  } catch (error) {
    res.json({ status: false, message: error.message, data: [] });
  }
});

// 2. ENDPOINT UPCOMING (30 Anime Akan Datang)
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

// 3. ENDPOINT DETAIL ANIME (Presisi Sesuai Anime yang Diklik)
const handleDetail = async (req, res) => {
  try {
    const queryParams = [
      req.params.id,
      req.query.id,
      req.query.endpoint,
      req.query.slug,
      req.query.url,
      req.query.title,
      req.query.search
    ];

    let targetInput = queryParams.find(p => p && p.toString().trim() !== '') || '';
    targetInput = decodeURIComponent(targetInput.toString()).trim();

    const cleanIdMatch = targetInput.match(/\d+/);
    const numericId = cleanIdMatch ? parseInt(cleanIdMatch[0]) : null;

    let query = '';
    let variables = {};

    if (numericId && numericId > 10) {
      // Kueri berdasarkan ID AniList
      query = `
        query ($id: Int) {
          Media (id: $id, type: ANIME, isAdult: false) {
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
      variables = { id: numericId };
    } else {
      // Kueri pencarian Judul jika Flutter mengirim teks/judul
      query = `
        query ($search: String) {
          Media (search: $search, type: ANIME, isAdult: false) {
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
      variables = { search: targetInput || "Ongoing" };
    }

    const response = await axios.post(ANILIST_URL, { query, variables }, { timeout: 8000 });
    const anime = response.data?.data?.Media;

    if (!anime) throw new Error("Detail anime tidak ditemukan");

    const animeIdStr = anime.id.toString();
    const titleText = anime.title.english || anime.title.romaji;
    const posterImg = anime.coverImage?.large || "";
    const bannerImg = anime.bannerImage || posterImg;
    const synopsisText = anime.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Sinopsis belum tersedia.';
    const genresList = anime.genres || ['Anime'];
    const studioName = anime.studios?.nodes?.[0]?.name || 'Unknown Studio';

    // Hitung episode terbaru yang sedang berlangsung
    let latestEpNumber = 12;
    if (anime.nextAiringEpisode && anime.nextAiringEpisode.episode) {
      latestEpNumber = anime.nextAiringEpisode.episode - 1;
    } else if (anime.episodes) {
      latestEpNumber = anime.episodes;
    }

    if (latestEpNumber <= 0) latestEpNumber = 1;

    // Buat daftar episode dari yang terbaru ke episode 1
    const episodeList = [];
    for (let i = latestEpNumber; i >= 1; i--) {
      episodeList.push({
        id: `${animeIdStr}-ep-${i}`,
        endpoint: `${animeIdStr}-ep-${i}`,
        slug: `${animeIdStr}-ep-${i}`,
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
      id: animeIdStr,
      endpoint: animeIdStr,
      slug: animeIdStr,
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
      status: anime.status || 'Ongoing',
      type: 'TV',
      rating: anime.averageScore ? `${anime.averageScore} / 100` : '8.0',
      score: anime.averageScore ? `${anime.averageScore}` : '8.0',
      skor: anime.averageScore ? `${anime.averageScore}` : '8.0',
      studio: studioName,
      genres: genresList,
      genre: genresList.join(', '),
      episodes: episodeList,
      episode_list: episodeList,
      episodeList: episodeList,
      list_episode: episodeList
    };

    res.json({ status: true, data: detailData });

  } catch (error) {
    res.json({
      status: false,
      message: error.message,
      data: null
    });
  }
};

app.get('/api/detail', handleDetail);
app.get('/api/detail/:id', handleDetail);
app.get('/api/anime/:id', handleDetail);
app.get('/api/anime/detail/:id', handleDetail);

// 4. ENDPOINT STREAM / EPISODE
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
