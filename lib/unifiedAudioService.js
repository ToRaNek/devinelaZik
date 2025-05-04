// lib/unifiedAudioService.js
const ytdl = require('ytdl-core');
const ytsr = require('youtube-sr').default;

/**
 * Unified service for YouTube audio extraction and preview generation
 * Combines functionality from multiple audio service files
 */
class UnifiedAudioService {
    /**
     * Search and extract audio preview URL with rich metadata
     * @param {string} query - Search query (artist + track)
     * @returns {Promise<Object>} - Complete audio preview data
     */
    async getAudioPreviewUrl(query) {
        try {
            console.log(`Searching for audio: ${query}`);

            // Enhance search query for better results
            const searchQuery = `${query} audio official`;

            // Search without using the YouTube API (saves quota)
            const searchResults = await ytsr.search(searchQuery, { limit: 3, type: 'video' });

            if (!searchResults || searchResults.length === 0) {
                console.warn(`No results found for: ${searchQuery}`);
                return null;
            }

            // Get the best match
            const bestMatch = searchResults[0];
            const videoId = bestMatch.id;

            console.log(`Best match: "${bestMatch.title}" (${videoId})`);

            // Get video info for audio extraction
            const videoInfo = await ytdl.getInfo(videoId);

            // Get audio-only formats
            const audioFormats = ytdl.filterFormats(videoInfo.formats, 'audioonly');
            if (audioFormats.length === 0) {
                console.warn(`No audio formats found for ${videoId}`);
                return null;
            }

            // Find best quality audio
            const bestAudioFormat = audioFormats.reduce((prev, curr) =>
                (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr
            );

            // Create random start time to avoid spoilers
            const startTime = Math.floor(Math.random() * 30) + 15;

            // Direct audio URL for streaming (expires after some time)
            const directAudioUrl = bestAudioFormat.url;

            // YouTube embed URL with control parameters
            const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${startTime + 30}&controls=0&enablejsapi=1`;

            // Return complete metadata
            return {
                videoId,
                title: bestMatch.title,
                channelName: bestMatch.channel?.name || 'Unknown',
                thumbnailUrl: bestMatch.thumbnail?.url,
                duration: bestMatch.duration,
                directAudioUrl,
                embedUrl,
                format: bestAudioFormat.mimeType,
                bitrate: bestAudioFormat.audioBitrate,
                contentLength: bestAudioFormat.contentLength,
                isLive: videoInfo.videoDetails.isLiveContent,
                startTime,
                previewSource: 'youtube'
            };
        } catch (error) {
            console.error('Error extracting YouTube audio:', error);
            return null;
        }
    }

    /**
     * Generate a proxy URL for the audio (to avoid CORS issues)
     * @param {string} videoId - YouTube video ID
     * @returns {string} - Proxy URL for audio streaming
     */
    getProxyUrl(videoId) {
        return `/api/audio?videoId=${videoId}`;
    }

    /**
     * Get preview for a specific song
     * @param {string} artistName - Artist name
     * @param {string} trackName - Track name
     * @returns {Promise<Object|null>} - Preview data or null if not found
     */
    async getSongPreview(artistName, trackName) {
        const query = `${artistName} ${trackName}`;
        return this.getAudioPreviewUrl(query);
    }

    /**
     * Get preview for an artist
     * @param {string} artistName - Artist name
     * @returns {Promise<Object|null>} - Preview data or null if not found
     */
    async getArtistPreview(artistName) {
        const query = `${artistName} popular song`;
        return this.getAudioPreviewUrl(query);
    }

    /**
     * Find audio preview URL for a track
     * @param {Object} track - Track object with artist and name
     * @returns {Promise<string|null>} - Preview URL or null if not found
     */
    async findAudioPreviewUrl(track) {
        // Check if track already has a preview URL
        if (track && track.preview_url) {
            return track.preview_url;
        }

        // Try YouTube if no preview URL exists
        if (track && track.artists && track.artists[0] && track.name) {
            try {
                const audioPreview = await this.getSongPreview(track.artists[0].name, track.name);
                if (audioPreview) {
                    return audioPreview.directAudioUrl || audioPreview.embedUrl;
                }
            } catch (error) {
                console.error('Failed to find audio preview:', error);
            }
        }

        return null;
    }
}

module.exports = new UnifiedAudioService();