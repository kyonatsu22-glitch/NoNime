const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Root test
app.get('/', (req, res) => {
  res.send('Server Scraper Anime Aktif');
});

// Endpoint untuk mendapatkan daftar Anime Ongoing (SFW)
app.get('/api/ongoing', async (req, res) => {
  const query = `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(status: RELEASING, type: ANIME, isAdult: false, sort: POPULARITY_DESC) {
          id
          title {
            romaji
            english
          }
          coverImage {
            large
          }
          nextAiringEpisode {
            episode
          }
          episodes
        }
      }
    }
  `;

  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: query,
      variables: { page: 1, perPage: 50 }
    });

    const list = response.data.data.Page.media.map(item => {
      const epNum = item.nextAiringEpisode 
        ? item.nextAiringEpisode.episode - 1 
        : (item.episodes || 'Ongoing');
      return {
        id: item.id.toString(),
        title: item.title.english || item.title.romaji,
        poster: item.coverImage.large,
        episode: `Episode ${epNum > 0 ? epNum : '1'}`
      };
    });

    res.json({ status: 'success', data: list });
  } catch (error) {
    console.error('Error fetching AniList:', error);
    res.status(500).json({ status: 'error', message: 'Gagal mengambil data' });
  }
});

// Endpoint Detail Anime
app.get('/api/detail/:id', async (req, res) => {
  const animeId = req.params.id;
  const query = `
    query ($id: Int) {
      Media(id: $id) {
        id
        title {
          romaji
          english
        }
        coverImage {
          extraLarge
        }
        description
        status
        studios(isMain: true) {
          nodes {
            name
          }
        }
        episodes
        nextAiringEpisode {
          episode
        }
      }
    }
  `;

  try {
    const response = await axios.post('https://graphql.anilist.co', {
      query: query,
      variables: { id: parseInt(animeId) }
    });

    const media = response.data.data.Media;
    const totalEp = media.nextAiringEpisode 
      ? media.nextAiringEpisode.episode - 1 
      : (media.episodes || 12);

    const episodes = [];
    for (let i = totalEp; i >= 1; i--) {
      episodes.push({
        title: `Episode ${i}`,
        episode: i
      });
    }

    const studioName = media.studios.nodes.length > 0 ? media.studios.nodes[0].name : '-';

    res.json({
      status: 'success',
      data: {
        id: media.id.toString(),
        title: media.title.english || media.title.romaji,
        poster: media.coverImage.extraLarge,
        synopsis: media.description ? media.description.replace(/<[^>]*>?/gm, '') : 'Sinopsis tidak tersedia.',
        status: media.status,
        studio: studioName,
        episodes: episodes
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Gagal mengambil detail' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});

module.exports = app;
