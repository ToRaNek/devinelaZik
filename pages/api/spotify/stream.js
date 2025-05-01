// pages/api/spotify/stream.js
const { getServerSession } = require("next-auth/next");
const { getValidSpotifyToken } = require("../../../lib/enhancedSpotifyUtils");
const { authOptions } = require("../auth/[...nextauth]");

export default async function handler(req, res) {
    // Support uniquement des requêtes GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        // Récupérer le trackId ou previewUrl depuis la requête
        const { trackId, previewUrl } = req.query;

        // Si une URL de prévisualisation est directement fournie, l'utiliser
        if (previewUrl) {
            return res.redirect(previewUrl);
        }

        // Sinon, nous avons besoin d'un trackId
        if (!trackId) {
            return res.status(400).json({ error: 'trackId ou previewUrl requis' });
        }

        // Authentification (nécessaire seulement pour l'API Spotify)
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: 'Non authentifié' });
        }

        try {
            // Obtenir un token Spotify valide
            const accessToken = await getValidSpotifyToken(session.user.id);

            // Demander les détails de la piste à l'API Spotify
            const response = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Erreur API Spotify: ${response.status}`);
            }

            const trackData = await response.json();

            // Vérifier si une prévisualisation est disponible
            if (trackData.preview_url) {
                // Rediriger vers l'URL de prévisualisation
                return res.redirect(trackData.preview_url);
            } else {
                // Pas de prévisualisation disponible
                return res.status(404).json({ error: 'Aucune prévisualisation disponible pour cette piste' });
            }
        } catch (error) {
            console.error('Erreur lors de la récupération de la prévisualisation:', error);
            return res.status(500).json({ error: 'Erreur lors de la récupération de la prévisualisation' });
        }
    } catch (error) {
        console.error('Erreur de streaming:', error);
        return res.status(500).json({ error: 'Erreur de streaming' });
    }
}