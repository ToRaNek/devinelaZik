// lib/youtubeUtils.js
// SANS AUCUNE API YOUTUBE - Utilise uniquement ytdl-core et youtube-sr
const ytsr = require('youtube-sr').default;
// Ajouter en haut du fichier youtubeUtils.js
const simpleCache = require('./simpleCacheService');

/**
 * Recherche YouTube pour un track et retourne une URL audio jouable
 * SANS UTILISER L'API YOUTUBE
 * @param {string} query - Requête de recherche (peut être "artiste titre" ou juste "artiste")
 * @returns {Promise<string|null>} - URL d'aperçu YouTube ou null si non trouvé
 */
async function searchYouTubeWithoutAPI(query) {
    let retries = 0;
    const maxRetries = 3;

    // Headers pour simuler un navigateur réel
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': 'https://www.youtube.com/'
    };

    while (retries < maxRetries) {
        try {
            console.log(`Recherche YouTube sans API pour: ${query} (tentative ${retries+1}/${maxRetries})`);

            // Améliorer la requête pour de meilleurs résultats
            const searchQuery = `${query} audio`;

            // Utiliser youtube-sr avec les headers
            const searchResults = await ytsr.search(searchQuery, {
                limit: 3,
                requestOptions: { headers }
            });

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
            console.error(`Erreur lors de la recherche YouTube sans API (tentative ${retries+1}/${maxRetries}):`, error);
            retries++;

            if (retries >= maxRetries) {
                console.error('Abandon après plusieurs tentatives échouées');
                return null;
            }

            // Attente exponentielle entre les tentatives
            const delay = 1000 * Math.pow(2, retries);
            console.log(`Nouvelle tentative dans ${delay/1000} secondes...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }

    return null;
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
        console.log(`Recherche preview pour: ${artistName} - ${trackName}`);

        // Vérifier d'abord le cache
        const cached = simpleCache.get(artistName, trackName);
        if (cached && cached.url) {
            console.log(`Cache hit! Utilisation de l'URL en cache`);
            return cached.url;
        }

        // Construire la requête de recherche
        const query = trackName ? `${artistName} ${trackName}` : artistName;

        // Faire la recherche YouTube
        console.log(`Cache miss, recherche YouTube pour: ${query}`);
        const youtubeUrl = await searchYouTubeWithoutAPI(query);

        if (youtubeUrl) {
            // Ajouter au cache si trouvé
            console.log(`URL trouvée, ajout au cache: ${youtubeUrl.substring(0, 50)}...`);
            simpleCache.set(artistName, trackName, youtubeUrl);
        } else {
            console.log(`Aucune URL trouvée pour: ${query}`);
        }

        return youtubeUrl;
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