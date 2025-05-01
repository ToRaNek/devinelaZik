// pages/api/youtube-audio.js
import ytdl from 'ytdl-core';

export default async function handler(req, res) {
    const { videoId } = req.query;

    if (!videoId) {
        return res.status(400).json({ error: 'Missing videoId parameter' });
    }

    try {
        // Get video info
        const info = await ytdl.getInfo(videoId);

        // Filter for audio-only formats
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

        if (audioFormats.length === 0) {
            return res.status(404).json({ error: 'No audio stream found' });
        }

        // Get the best audio quality format
        const audioFormat = audioFormats.reduce((prev, curr) => {
            return (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr;
        });

        // Return the direct audio URL (will be valid for a limited time)
        return res.status(200).json({
            audioUrl: audioFormat.url,
            contentType: audioFormat.mimeType,
            bitrate: audioFormat.audioBitrate
        });
    } catch (error) {
        console.error('Error extracting YouTube audio:', error);
        return res.status(500).json({ error: 'Failed to extract audio stream' });
    }
}