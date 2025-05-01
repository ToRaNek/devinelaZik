// lib/spotifyEnricher.js
const { getValidSpotifyToken } = require("./enhancedSpotifyUtils");

/**
 * Enrichit les questions avec des prévisualisations Spotify
 * @param {Array} questions - Liste des questions existantes
 * @param {string} userId - ID de l'utilisateur pour l'authentification Spotify
 * @returns {Promise<Array>} - Questions enrichies avec prévisualisations
 */
async function enrichQuestionsWithPreviews(questions, userId) {
    // Si aucune question, retourner tableau vide
    if (!questions || questions.length === 0) {
        return [];
    }

    try {
        // Obtenir un token Spotify valide
        const accessToken = await getValidSpotifyToken(userId);

        // Traiter chaque question qui a besoin d'une prévisualisation
        const enrichedQuestions = await Promise.all(questions.map(async (question) => {
            // Si la question a déjà une prévisualisation, la conserver
            if (question.previewUrl) {
                return question;
            }

            // Si c'est une question de type chanson ou artiste
            if ((question.type === 'song' || question.type === 'artist') && question.artistName) {
                try {
                    // Construire la requête de recherche
                    const searchQuery = question.type === 'song'
                        ? `track:${question.answer} artist:${question.artistName}`
                        : `artist:${question.artistName}`;

                    // Rechercher la piste sur Spotify
                    const response = await fetch(
                        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
                        {
                            headers: {
                                'Authorization': `Bearer ${accessToken}`
                            }
                        }
                    );

                    if (!response.ok) {
                        console.warn(`Échec de la recherche pour ${searchQuery}: ${response.status}`);
                        return question;
                    }

                    const data = await response.json();

                    // Si des résultats ont été trouvés
                    if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
                        const track = data.tracks.items[0];

                        // Enrichir la question avec les données Spotify
                        return {
                            ...question,
                            spotifyTrackId: track.id,
                            previewUrl: track.preview_url,
                            // Mettre à jour l'image de l'album si disponible et non déjà définie
                            albumCover: question.albumCover || track.album.images[0]?.url
                        };
                    }
                } catch (error) {
                    console.error(`Erreur lors de l'enrichissement de la question ${question.id}:`, error);
                }
            }

            // Retourner la question inchangée si pas de prévisualisation trouvée
            return question;
        }));

        return enrichedQuestions;
    } catch (error) {
        console.error('Erreur globale lors de l\'enrichissement des questions:', error);
        return questions; // Retourner les questions d'origine en cas d'erreur
    }
}

/**
 * Recherche une piste Spotify par artiste et titre
 * @param {string} artist - Nom de l'artiste
 * @param {string} title - Titre de la chanson
 * @param {string} userId - ID de l'utilisateur pour l'authentification
 * @returns {Promise<Object>} - Détails de la piste trouvée
 */
async function searchSpotifyTrack(artist, title, userId) {
    try {
        const accessToken = await getValidSpotifyToken(userId);

        // Construire la requête
        const searchQuery = `track:${title} artist:${artist}`;

        // Faire la recherche
        const response = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Erreur API Spotify: ${response.status}`);
        }

        const data = await response.json();

        if (!data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
            throw new Error('Aucune piste trouvée');
        }

        const track = data.tracks.items[0];

        return {
            id: track.id,
            name: track.name,
            artist: track.artists[0].name,
            previewUrl: track.preview_url,
            albumCover: track.album.images[0]?.url
        };
    } catch (error) {
        console.error('Erreur de recherche Spotify:', error);
        throw error;
    }
}

// Exporter les fonctions avec CommonJS
module.exports = {
    enrichQuestionsWithPreviews,
    searchSpotifyTrack
};