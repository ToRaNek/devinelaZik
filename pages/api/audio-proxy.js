// pages/api/audio-proxy.js
import ytdl from 'ytdl-core';

/**
 * Endpoint API servant de proxy pour les flux audio YouTube
 * Permet d'éviter les problèmes CORS et de cacher la logique d'extraction
 */
export default async function handler(req, res) {
    // Uniquement accepter les requêtes GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'Missing videoId parameter' });
    }

    try {
        // Obtenir les informations de la vidéo
        const info = await ytdl.getInfo(videoId);

        // Filtrer pour n'avoir que les formats audio
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

        if (audioFormats.length === 0) {
            return res.status(404).json({ error: 'No audio stream found' });
        }

        // Obtenir le format avec la meilleure qualité audio
        const audioFormat = audioFormats.reduce((prev, curr) => {
            return (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr;
        });

        // Option 1: Redirection (plus simple, mais moins de contrôle)
        res.redirect(audioFormat.url);

        // Option 2: Streaming du contenu (nécessite plus de ressources serveur)
        /*
        // Définir les headers de réponse
        res.setHeader('Content-Type', audioFormat.mimeType);
        res.setHeader('Content-Length', audioFormat.contentLength);
        res.setHeader('Accept-Ranges', 'bytes');

        // Créer un flux de la vidéo et le transférer à la réponse
        const audioStream = ytdl(videoId, {
          format: audioFormat,
          range: req.headers.range,
        });

        // Gérer les erreurs de flux
        audioStream.on('error', (err) => {
          console.error('Stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Streaming error' });
          }
        });

        // Transférer le flux audio à la réponse
        audioStream.pipe(res);
        */

    } catch (error) {
        console.error('Error extracting YouTube audio:', error);
        return res.status(500).json({ error: 'Failed to extract audio stream' });
    }
}