// lib/youtubeUtils.js
const ytdl = require('ytdl-core');
const ytSearch = require('yt-search');

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
 * Récupère le flux audio d'une vidéo YouTube
 * @param {string} videoId - ID de la vidéo YouTube
 * @returns {Stream} - Flux audio de la vidéo
 */
function getYouTubeAudioStream(videoId) {
    return ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
        filter: 'audioonly',
        quality: 'highestaudio'
    });
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