// pages/api/spotify/search.js
const { getServerSession } = require("next-auth/next");
const { getValidSpotifyToken } = require("../../../lib/enhancedSpotifyUtils");
const { authOptions } = require("../auth/[...nextauth]");

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        // Authentification
        const session = await getServerSession(req, res, authOptions);
        if (!session) {
            return res.status(401).json({ error: 'Non authentifié' });
        }

        // Récupérer les paramètres de recherche
        const { q, artist, track } = req.query;

        // Construire la requête de recherche
        let searchQuery = q;
        if (!searchQuery && (artist || track)) {
            const parts = [];
            if (track) parts.push(`track:${track}`);
            if (artist) parts.push(`artist:${artist}`);
            searchQuery = parts.join(' ');
        }

        if (!searchQuery) {
            return res.status(400).json({ error: 'Paramètres de recherche manquants' });
        }

        try {
            // Obtenir un token Spotify valide
            const accessToken = await getValidSpotifyToken(session.user.id);

            // Faire la recherche Spotify
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

            // Vérifier si des pistes ont été trouvées
            if (!data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
                return res.status(404).json({ error: 'Aucune piste trouvée' });
            }

            // Retourner la première piste trouvée
            const track = data.tracks.items[0];
            return res.status(200).json({
                id: track.id,
                name: track.name,
                artist: track.artists[0].name,
                albumCover: track.album.images[0]?.url,
                previewUrl: track.preview_url
            });
        } catch (error) {
            console.error('Erreur lors de la recherche Spotify:', error);
            return res.status(500).json({ error: 'Erreur lors de la recherche Spotify' });
        }
    } catch (error) {
        console.error('Erreur:', error);
        return res.status(500).json({ error: 'Erreur serveur' });
    }
}