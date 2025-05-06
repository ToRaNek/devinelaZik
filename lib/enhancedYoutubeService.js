const ytdl = require('ytdl-core');
const ytsr = require('youtube-sr').default;
const musicCache = require('./simpleCacheService');

// Ajouter la fonction de recherche avec retry décrite plus haut

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

            // Rechercher la vidéo sans utiliser l'API YouTube avec retry et headers
            const searchResults = await searchYouTubeWithRetry(searchQuery, 3);

            if (!searchResults || searchResults.length === 0) {
                console.warn(`Aucun résultat trouvé pour: ${searchQuery}`);
                return null;
            }

            // Reste du code inchangé...
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
     * Obtient les métadonnées et l'URL d'aperçu audio pour une chanson
     * @param {string} artistName - Nom de l'artiste
     * @param {string} trackName - Nom de la piste
     * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
     */
    async getSongPreview(artistName, trackName) {
        try {
            // Vérifier d'abord dans le cache
            const cached = await musicCache.get(artistName, trackName);
            if (cached && cached.previewUrl) {
                return {
                    videoId: '',
                    title: `${artistName} - ${trackName}`,
                    directAudioUrl: cached.previewUrl,
                    thumbnailUrl: cached.thumbnailUrl,
                    previewSource: 'cache'
                };
            }

            // Si pas dans le cache, rechercher sur YouTube
            const query = `${artistName} ${trackName}`;
            const result = await this.getAudioPreviewUrl(query);

            // Si trouvé, mettre en cache
            if (result && (result.directAudioUrl || result.embedUrl)) {
                const urlToCache = result.directAudioUrl || result.embedUrl;
                await musicCache.set(artistName, trackName, urlToCache, result.thumbnailUrl);
            }

            return result;
        } catch (error) {
            console.error(`Erreur lors de la recherche pour ${artistName} - ${trackName}:`, error);
            return null;
        }
    }

    /**
     * Obtient les métadonnées et l'URL d'aperçu audio pour un artiste
     * @param {string} artistName - Nom de l'artiste
     * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
     */
    async getArtistPreview(artistName) {
        try {
            // Vérifier d'abord dans le cache
            const cached = await musicCache.get(artistName);
            if (cached && cached.previewUrl) {
                return {
                    videoId: '',
                    title: artistName,
                    directAudioUrl: cached.previewUrl,
                    thumbnailUrl: cached.thumbnailUrl,
                    previewSource: 'cache'
                };
            }

            // Si pas dans le cache, rechercher sur YouTube
            const query = `${artistName} popular song`;
            const result = await this.getAudioPreviewUrl(query);

            // Si trouvé, mettre en cache
            if (result && (result.directAudioUrl || result.embedUrl)) {
                const urlToCache = result.directAudioUrl || result.embedUrl;
                await musicCache.set(artistName, '', urlToCache, result.thumbnailUrl);
            }

            return result;
        } catch (error) {
            console.error(`Erreur lors de la recherche pour l'artiste ${artistName}:`, error);
            return null;
        }
    }
}

module.exports = new EnhancedYoutubeService();