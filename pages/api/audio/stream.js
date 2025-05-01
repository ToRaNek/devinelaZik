// pages/api/audio/stream.js
const { searchYouTubeVideo, getYouTubeAudioStream } = require('../../../lib/youtubeUtils');

export default async function handler(req, res) {
    // Support uniquement des requêtes GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    try {
        // Récupérer le paramètre de requête
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({ error: 'Paramètre de requête requis' });
        }

        // Rechercher la vidéo
        const videoId = await searchYouTubeVideo(q);

        if (!videoId) {
            return res.status(404).json({ error: 'Aucune vidéo trouvée' });
        }

        // Configurer les en-têtes de réponse
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache d'un jour

        // Diffuser le flux audio
        const audioStream = await getYouTubeAudioStream(videoId);
        audioStream.pipe(res);

        // Gérer les erreurs de flux
        audioStream.on('error', (error) => {
            console.error(`Erreur de streaming pour ${q}:`, error);
            // Si les en-têtes n'ont pas encore été envoyés
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erreur de streaming' });
            } else {
                res.end();
            }
        });
    } catch (error) {
        console.error('Erreur de streaming:', error);
        return res.status(500).json({ error: 'Erreur de streaming' });
    }
}

// Configuration pour le streaming
export const config = {
    api: {
        responseLimit: false,
        bodyParser: false,
    },
};