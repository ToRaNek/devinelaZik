// pages/api/audio.js
import ytdl from 'ytdl-core';

/**
 * Unified API endpoint for audio extraction and proxying
 * Combines functionality from audio-proxy.js and youtube-audio.js
 */
export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoId, format = 'audio' } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'Missing videoId parameter' });
    }

    try {
        // Get video info
        const info = await ytdl.getInfo(videoId);

        // Get audio formats
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

        if (audioFormats.length === 0) {
            return res.status(404).json({ error: 'No audio stream found' });
        }

        // Get the best quality audio format
        const audioFormat = audioFormats.reduce((prev, curr) => {
            return (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr;
        });

        // Handle different response types based on format parameter
        if (format === 'json') {
            // Return JSON data (for client-side processing)
            return res.status(200).json({
                audioUrl: audioFormat.url,
                contentType: audioFormat.mimeType,
                bitrate: audioFormat.audioBitrate,
                title: info.videoDetails.title,
                channelName: info.videoDetails.author.name,
                lengthSeconds: info.videoDetails.lengthSeconds
            });
        } else {
            // Default: redirect to the audio URL (proxy mode)
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.redirect(audioFormat.url);
        }
    } catch (error) {
        console.error('Error extracting YouTube audio:', error);
        return res.status(500).json({
            error: 'Failed to extract audio stream',
            message: error.message
        });
    }
}