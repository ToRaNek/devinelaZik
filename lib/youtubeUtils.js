// lib/youtubeUtils.js
// SANS AUCUNE API YOUTUBE - Utilise uniquement ytdl-core et youtube-sr
const ytdl = require('ytdl-core');
const ytsr = require('youtube-sr').default;

/**
 * Recherche YouTube pour un track et retourne une URL audio jouable
 * SANS UTILISER L'API YOUTUBE
 * @param {string} query - Requête de recherche (peut être "artiste titre" ou juste "artiste")
 * @returns {Promise<string|null>} - URL d'aperçu YouTube ou null si non trouvé
 */
async function searchYouTubeWithoutAPI(query) {
    try {
        console.log(`Recherche YouTube sans API pour: ${query}`);

        // Améliorer la requête pour de meilleurs résultats
        const searchQuery = `${query} audio`;

        // Utiliser youtube-sr au lieu de l'API YouTube
        const searchResults = await ytsr.search(searchQuery, { limit: 3 });

        if (!searchResults || searchResults.length === 0) {
            console.warn(`Aucun résultat trouvé pour: ${searchQuery}`);
            return null;
        }

        // Prendre le premier résultat
        const bestMatch = searchResults[0];
        console.log(`Résultat trouvé: "${bestMatch.title}" (${bestMatch.id})`);

        // Créer le point de départ aléatoire pour éviter de spoiler le début
        const startTime = Math.floor(Math.random() * 30) + 30;

        // Retourner l'URL d'intégration YouTube avec les paramètres adéquats
        return `https://www.youtube.com/embed/${bestMatch.id}?autoplay=1&start=${startTime}&end=${startTime + 30}&controls=0`;
    } catch (error) {
        console.error('Erreur lors de la recherche YouTube sans API:', error);
        return null;
    }
}

/**
 * Recherche YouTube pour un track et retourne une URL audio jouable
 * REMPLACÉE POUR NE PAS UTILISER L'API YOUTUBE
 * @param {string} artistName - Nom de l'artiste
 * @param {string} trackName - Nom de la piste
 * @returns {Promise<string|null>} - URL d'aperçu YouTube ou null si non trouvé
 */
async function getYouTubePreviewUrl(artistName, trackName) {
    try {
        // Construire la requête de recherche
        const query = trackName ? `${artistName} ${trackName}` : artistName;
        return await searchYouTubeWithoutAPI(query);
    } catch (error) {
        console.error('Erreur lors de la recherche YouTube:', error);
        return null;
    }
}

/**
 * Trouve une URL d'aperçu audio pour une chanson
 * SANS UTILISER L'API YOUTUBE
 * @param {Object} track - Objet de piste avec artiste et nom
 * @returns {Promise<string|null>} - URL d'aperçu ou null si non trouvé
 */
async function findAudioPreviewUrl(track) {
    // Vérifier d'abord si la piste a déjà une URL d'aperçu
    if (track && track.preview_url) {
        return track.preview_url;
    }

    // Sinon, essayer YouTube sans API
    if (track && track.artists && track.artists[0] && track.name) {
        try {
            const youtubeUrl = await getYouTubePreviewUrl(track.artists[0].name, track.name);
            if (youtubeUrl) {
                return youtubeUrl;
            }
        } catch (error) {
            console.error('Recherche YouTube échouée:', error);
        }
    }

    return null;
}

module.exports = {
    getYouTubePreviewUrl,
    findAudioPreviewUrl
};