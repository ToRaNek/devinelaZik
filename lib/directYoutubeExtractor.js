// lib/directYoutubeExtractor.js
const ytdl = require('ytdl-core');
const ytsr = require('youtube-sr').default;

/**
 * Service d'extraction directe des flux YouTube sans utiliser d'API (0 quota)
 */
class DirectYoutubeExtractor {
    /**
     * Recherche et extrait des informations audio YouTube sans API
     * @param {string} query - Requête de recherche
     * @returns {Promise<Object|null>} - Informations sur la vidéo et URL d'embed
     */
    async searchAndExtract(query) {
        try {
            console.log(`[DirectExtractor] Recherche pour: ${query}`);

            // Améliorer la requête de recherche pour de meilleurs résultats
            const searchQuery = `${query} audio official`;

            // Rechercher des vidéos sans utiliser l'API YouTube
            const searchResults = await ytsr.search(searchQuery, { limit: 3 });

            if (!searchResults || searchResults.length === 0) {
                console.warn(`[DirectExtractor] Aucun résultat trouvé pour: ${searchQuery}`);
                return null;
            }

            // Prendre le meilleur résultat
            const video = searchResults[0];
            const videoId = video.id;

            console.log(`[DirectExtractor] Vidéo trouvée: ${video.title} (ID: ${videoId})`);

            // Générer point de départ aléatoire
            const startTime = Math.floor(Math.random() * 30) + 20;
            const endTime = startTime + 30;

            // Créer l'URL d'embed YouTube
            const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${endTime}&controls=0&enablejsapi=1`;

            // Retourner les informations
            return {
                videoId,
                title: video.title,
                embedUrl,
                thumbnailUrl: video.thumbnail?.url,
                startTime,
                endTime,
                duration: video.duration
            };
        } catch (error) {
            console.error('[DirectExtractor] Erreur de recherche:', error);
            return null;
        }
    }

    /**
     * Obtient l'URL du flux audio direct d'une vidéo YouTube par ID
     * @param {string} videoId - ID de la vidéo YouTube
     * @returns {Promise<Object|null>} - Informations sur le flux audio
     */
    async getAudioStream(videoId) {
        try {
            console.log(`[DirectExtractor] Extraction du flux audio pour la vidéo ${videoId}`);

            // Obtenir les informations de la vidéo
            const videoInfo = await ytdl.getInfo(videoId);

            // Filtrer pour obtenir uniquement les formats audio
            const audioFormats = ytdl.filterFormats(videoInfo.formats, 'audioonly');

            if (audioFormats.length === 0) {
                console.warn(`[DirectExtractor] Aucun format audio trouvé pour ${videoId}`);
                return null;
            }

            // Trouver le format avec la meilleure qualité audio
            const bestAudioFormat = audioFormats.reduce((prev, curr) =>
                (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr
            );

            return {
                directUrl: bestAudioFormat.url,
                mimeType: bestAudioFormat.mimeType,
                bitrate: bestAudioFormat.audioBitrate,
                contentLength: bestAudioFormat.contentLength
            };
        } catch (error) {
            console.error('[DirectExtractor] Erreur d\'extraction du flux audio:', error);
            return null;
        }
    }

    /**
     * Recherche et obtient un aperçu audio complet (embed + flux direct)
     * @param {string} query - Requête de recherche
     * @returns {Promise<Object|null>} - Informations complètes d'aperçu
     */
    async getCompleteAudioPreview(query) {
        try {
            // D'abord, rechercher la vidéo
            const videoInfo = await this.searchAndExtract(query);

            if (!videoInfo) {
                return null;
            }

            // Ensuite, essayer d'obtenir le flux audio direct
            try {
                const audioStream = await this.getAudioStream(videoInfo.videoId);

                if (audioStream) {
                    // Combiner les informations
                    return {
                        ...videoInfo,
                        directAudioUrl: audioStream.directUrl,
                        audioMimeType: audioStream.mimeType,
                        audioBitrate: audioStream.bitrate
                    };
                }
            } catch (streamError) {
                console.warn(`[DirectExtractor] Impossible d'extraire le flux direct, utilisation de l'embed uniquement:`, streamError.message);
            }

            // Retourner au moins les informations de la vidéo même si le flux a échoué
            return videoInfo;
        } catch (error) {
            console.error('[DirectExtractor] Erreur d\'obtention de l\'aperçu complet:', error);
            return null;
        }
    }

    /**
     * Recherche et obtient un aperçu audio pour une chanson
     * @param {string} artistName - Nom de l'artiste
     * @param {string} trackName - Nom de la piste
     * @returns {Promise<Object|null>} - Informations d'aperçu
     */
    async getSongPreview(artistName, trackName) {
        const query = `${artistName} ${trackName}`;
        return this.getCompleteAudioPreview(query);
    }

    /**
     * Recherche et obtient un aperçu audio pour un artiste
     * @param {string} artistName - Nom de l'artiste
     * @returns {Promise<Object|null>} - Informations d'aperçu
     */
    async getArtistPreview(artistName) {
        const query = `${artistName} popular song`;
        return this.getCompleteAudioPreview(query);
    }
}

module.exports = new DirectYoutubeExtractor();