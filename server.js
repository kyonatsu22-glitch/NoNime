const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// 1. ENDPOINT ONGOING
app.get('/api/ongoing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;

    const query = `
      query ($perPage: Int) {
        Page(page: 1, perPage: $perPage) {
          media(status: RELEASING, type: ANIME, sort: POPULARITY_DESC) {
            id
            title {
              romaji
              english
            }
            coverImage {
              large
            }
            episodes
            nextAiringEpisode {
              episode
            }
          }
        }
      }
    `;

    const response = await axios.post('https://graphql.anilist.co', {
      query: query,
      variables: { perPage: limit }
    }, { timeout: 8000 });

    const animeList = response.data?.data?.Page?.media || [];

    const results = animeList.map(item => ({
      id: item.id.toString(), // ID dikirim berupa String ID AniList
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

// 2. ENDPOINT DETAIL ANIME (Agar Saat Kartu Diklik Tidak "Detail Gagal Dimuat")
app.get('/api/detail', async (req, res) => {
  try {
    const animeId = parseInt(req.query.id);

    if (!animeId) {
      return res.status(400).json({ status: false, message: 'ID Anime wajib diisi' });
    }

    const query = `
      query ($id: Int) {
        Media (id: $id, type: ANIME) {
          id
          title {
            romaji
            english
          }
          coverImage {
            large
          }
          bannerImage
          description
          status
          episodes
          genres
          averageScore
        }
      }
    `;

    const response = await axios.post('https://graphql.anilist.co', {
      query: query,
      variables: { id: animeId }
    }, { timeout: 8000 });

    const anime = response.data?.data?.Media;

    if (!anime) {
      throw new Error("Detail anime tidak ditemukan");
    }

    res.json({
      status: true,
      data: {
        id: anime.id.toString(),
        title: anime.title.english || anime.title.romaji,
        posterUrl: anime.coverImage.large,
        bannerUrl: anime.bannerImage || anime.coverImage.large,
        synopsis: anime.description ? anime.description.replace(/<[^>]*>?/gm, '') : 'Tidak ada sinopsis',
        status: anime.status,
        episodes: anime.episodes || 'Ongoing',
        rating: anime.averageScore ? `${anime.averageScore} / 100` : 'N/A',
        genres: anime.genres || []
      }
    });

  } catch (error) {
    res.status(500).json({ status: false, message: 'Gagal memuat detail: ' + error.message });
  }
});

app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;
