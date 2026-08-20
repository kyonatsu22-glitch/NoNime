const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Endpoint Ongoing Anime (Mengambil 50-100 anime dengan AniList GraphQL super cepat)
app.get('/api/ongoing', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50; // default 50 anime

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
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 8000
    });

    const animeList = response.data?.data?.Page?.media || [];

    const results = animeList.map(item => ({
      id: `https://anilist.co/anime/${item.id}`,
      title: item.title.english || item.title.romaji,
      posterUrl: item.coverImage.large || '',
      episode: item.nextAiringEpisode 
        ? `Episode ${item.nextAiringEpisode.episode}` 
        : (item.episodes ? `Total Ep: ${item.episodes}` : 'Ongoing')
    }));

    res.json({
      status: true,
      total: results.length,
      data: results
    });

  } catch (error) {
    res.status(500).json({
      status: false,
      message: 'Gagal mengambil data anime: ' + error.message,
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
