// lib/enhancedYoutubeService.js
const ytdl = require('ytdl-core');
const ytsr = require('youtube-sr').default;

/**
 * Service d'extraction audio YouTube sans utiliser l'API officielle
 * Inspiré de l'approche utilisée par Spotube
 */
class EnhancedYoutubeService {
    /**
     * Recherche une vidéo YouTube et retourne l'URL de prévisualisation audio
     * @param {string} query - Requête de recherche (artiste + titre)
     * @returns {Promise<Object>} - Informations audio avec URL de prévisualisation
     */
    async getAudioPreviewUrl(query) {
        try {
            console.log(`Recherche audio pour: ${query}`);

            // Ajout de mots-clés pour améliorer la recherche
            const searchQuery = `${query} audio official`;

            // Rechercher la vidéo sans utiliser l'API YouTube
            const searchResults = await ytsr.search(searchQuery, { limit: 3, type: 'video' });

            if (!searchResults || searchResults.length === 0) {
                console.warn(`Aucun résultat trouvé pour: ${searchQuery}`);
                return null;
            }

            // Prendre le premier résultat de la recherche
            const bestMatch = searchResults[0];
            const videoId = bestMatch.id;

            console.log(`Meilleure correspondance: "${bestMatch.title}" (${videoId})`);

            // Obtenir le flux audio uniquement
            const videoInfo = await ytdl.getInfo(videoId);

            // Filtrer pour obtenir le format audio avec la meilleure qualité
            const audioFormats = ytdl.filterFormats(videoInfo.formats, 'audioonly');
            if (audioFormats.length === 0) {
                console.warn(`Aucun format audio trouvé pour ${videoId}`);
                return null;
            }

            // Trouver le format avec la meilleure qualité audio
            const bestAudioFormat = audioFormats.reduce((prev, curr) =>
                (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr
            );

            // Créer le point de départ aléatoire pour éviter de spoiler le début
            const startTime = Math.floor(Math.random() * 30) + 15;

            // Deux options pour utiliser le flux:

            // 1. URL directe pour le streaming (expire après un certain temps)
            const directAudioUrl = bestAudioFormat.url;

            // 2. URL d'un lecteur YouTube intégré avec paramètres de contrôle
            const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${startTime + 30}&controls=0&enablejsapi=1`;

            return {
                videoId,
                title: bestMatch.title,
                channelName: bestMatch.channel?.name || 'Unknown',
                thumbnailUrl: bestMatch.thumbnail?.url,
                duration: bestMatch.duration,
                directAudioUrl,   // URL pour streaming direct (meilleure option)
                embedUrl,         // URL iframe YouTube (option de secours)
                format: bestAudioFormat.mimeType,
                bitrate: bestAudioFormat.audioBitrate,
                contentLength: bestAudioFormat.contentLength,
                isLive: videoInfo.videoDetails.isLiveContent,
                startTime,
                previewSource: 'youtube'
            };
        } catch (error) {
            console.error('Erreur lors de l\'extraction audio YouTube:', error);
            return null;
        }
    }

    /**
     * Génère une URL proxy pour l'audio (pour éviter les problèmes CORS côté client)
     * @param {string} videoId - ID de la vidéo YouTube
     * @returns {string} - URL du proxy pour le streaming audio
     */
    getProxyUrl(videoId) {
        return `/api/audio-proxy?videoId=${videoId}`;
    }

    /**
     * Obtient les métadonnées et l'URL d'aperçu audio pour une chanson
     * @param {string} artistName - Nom de l'artiste
     * @param {string} trackName - Nom de la piste
     * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
     */
    async getSongPreview(artistName, trackName) {
        const query = `${artistName} ${trackName}`;
        return this.getAudioPreviewUrl(query);
    }

    /**
     * Obtient les métadonnées et l'URL d'aperçu audio pour un artiste
     * @param {string} artistName - Nom de l'artiste
     * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
     */
    async getArtistPreview(artistName) {
        // Essayer de trouver un titre populaire de l'artiste
        const query = `${artistName} popular song`;
        return this.getAudioPreviewUrl(query);
    }
}

module.exports = new EnhancedYoutubeService();