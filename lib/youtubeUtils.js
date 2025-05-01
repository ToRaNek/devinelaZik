const ytdl = require('@distube/ytdl-core');
const { CookieAgent } = require('http-cookie-agent/undici/v6');
const ytSearch = require('yt-search');


ytdl.createAgent = (cookies, agentOptions) =>
    new CookieAgent({ cookies: { jar: cookies }, ...agentOptions });

/**
 * Recherche une vidéo YouTube pour une chanson
 * @param {string} query - Requête de recherche (artiste + titre)
 * @returns {Promise<string|null>} - ID de la vidéo ou null si non trouvée
 */
async function searchYouTubeVideo(query) {
    try {
        console.log(`Recherche YouTube pour: ${query}`);
        const searchResults = await ytSearch(query);

        if (!searchResults || !searchResults.videos || searchResults.videos.length === 0) {
            console.log(`Aucun résultat YouTube trouvé pour: ${query}`);
            return null;
        }

        // Prendre la première vidéo des résultats
        const video = searchResults.videos[0];
        console.log(`Vidéo YouTube trouvée: ${video.title} (${video.videoId})`);
        return video.videoId;
    } catch (error) {
        console.error(`Erreur lors de la recherche YouTube:`, error);
        return null;
    }
}

/**
 * Récupère le flux audio d'une vidéo YouTube avec plusieurs mécanismes de repli
 * @param {string} videoId - ID de la vidéo YouTube
 * @returns {Promise<Stream>} - Flux audio de la vidéo
 */
async function getYouTubeAudioStream(videoId) {
    const streamingStrategies = [
        // Stratégie 1: Configuration standard
        async () => {
            const options = {
                quality: 'highestaudio',
                filter: 'audioonly',
            };

            try {
                const info = await ytdl.getInfo(videoId);
                return ytdl.downloadFromInfo(info, options);
            } catch (error) {
                console.error('Stratégie 1 échouée:', error);
                throw error;
            }
        },

        // Stratégie 2: Forcer un format audio spécifique
        async () => {
            try {
                const info = await ytdl.getInfo(videoId);
                const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

                if (audioFormats.length === 0) {
                    throw new Error('Aucun format audio trouvé');
                }

                // Sélectionner le premier format audio disponible
                const selectedFormat = audioFormats[0];

                return ytdl.downloadFromInfo(info, {
                    format: selectedFormat,
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    }
                });
            } catch (error) {
                console.error('Stratégie 2 échouée:', error);
                throw error;
            }
        },

        // Stratégie 3: Streaming direct avec options minimales
        async () => {
            try {
                return ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
                    filter: 'audioonly',
                    quality: 'lowest' // Qualité la plus basse pour minimiser les problèmes
                });
            } catch (error) {
                console.error('Stratégie 3 échouée:', error);
                throw error;
            }
        }
    ];

    // Essayer les stratégies les unes après les autres
    for (const strategy of streamingStrategies) {
        try {
            const audioStream = await strategy();

            // Gestion des erreurs de stream
            audioStream.on('error', (error) => {
                console.error(`Erreur de streaming pour la vidéo ${videoId}:`, error);
            });

            return audioStream;
        } catch (error) {
            console.warn('Stratégie de streaming échouée, passage à la suivante');
            continue;
        }
    }

    // Si toutes les stratégies échouent
    throw new Error('Impossible de récupérer le flux audio');
}

/**
 * Génère l'URL de l'API de streaming audio YouTube
 * @param {string} songName - Nom de la chanson
 * @param {string} artistName - Nom de l'artiste
 * @returns {string} - URL de l'API pour le streaming
 */
function generateStreamingUrl(songName, artistName) {
    const query = encodeURIComponent(`${artistName} ${songName}`);
    return `/api/audio/stream?q=${query}`;
}

/**
 * Enrichit les questions avec des URL de streaming YouTube
 * @param {Array} questions - Questions sans prévisualisations
 * @returns {Promise<Array>} - Questions avec URLs de streaming
 */
async function enrichQuestionsWithYouTubeUrls(questions) {
    const enrichedQuestions = [];

    for (const question of questions) {
        if (question.type === 'song' || question.type === 'artist') {
            const songName = question.type === 'song' ? question.answer : '';
            const artistName = question.artistName;
            const query = `${artistName} ${songName}`.trim();

            // Générer l'URL de streaming sans faire la recherche maintenant
            // La recherche sera faite lors de la requête à l'API
            const streamingUrl = generateStreamingUrl(songName, artistName);

            enrichedQuestions.push({
                ...question,
                previewUrl: streamingUrl
            });
        } else {
            enrichedQuestions.push(question);
        }
    }

    return enrichedQuestions;
}

module.exports = {
    searchYouTubeVideo,
    getYouTubeAudioStream,
    generateStreamingUrl,
    enrichQuestionsWithYouTubeUrls
};