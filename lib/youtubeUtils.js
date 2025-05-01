// lib/youtubeUtils.js
const fetch = require('node-fetch');

/**
 * Searches YouTube for a track and returns a playable audio URL
 * @param {string} artistName - Name of the artist
 * @param {string} trackName - Name of the track
 * @returns {Promise<string|null>} - YouTube preview URL or null if not found
 */
async function getYouTubePreviewUrl(artistName, trackName) {
    try {
        // Step 1: Search for the video using YouTube Data API
        const searchQuery = encodeURIComponent(`${artistName} ${trackName} audio official`);
        const apiKey = process.env.YOUTUBE_API_KEY;

        if (!apiKey) {
            console.error('YouTube API key not configured. Set YOUTUBE_API_KEY env variable.');
            return null;
        }

        const searchResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${searchQuery}&type=video&key=${apiKey}`
        );

        if (!searchResponse.ok) {
            const errorData = await searchResponse.json();
            console.error('YouTube API search error:', errorData);
            return null;
        }

        const searchData = await searchResponse.json();

        // Check if we found any videos
        if (!searchData.items || searchData.items.length === 0) {
            console.warn(`No YouTube videos found for ${artistName} - ${trackName}`);
            return null;
        }

        // Get the video ID
        const videoId = searchData.items[0].id.videoId;

        // Return a YouTube embed URL with autoplay and time limitation
        // This will embed the YouTube player but we hide visuals with CSS
        // Adding start time to avoid spoiling the intro (starting around 30s)
        const startTime = Math.floor(Math.random() * 30) + 30;
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&start=${startTime}&end=${startTime + 30}&controls=0&enablejsapi=1`;
    } catch (error) {
        console.error('Error fetching YouTube preview:', error);
        return null;
    }
}

/**
 * Finds audio preview URL for a song using multiple sources
 * @param {Object} track - Track object with artist and name
 * @returns {Promise<string|null>} - Preview URL or null if not found
 */
async function findAudioPreviewUrl(track) {
    // First check if track already has a preview URL
    if (track && track.preview_url) {
        return track.preview_url;
    }

    // If not, try YouTube
    if (track && track.artists && track.artists[0] && track.name) {
        try {
            const youtubeUrl = await getYouTubePreviewUrl(track.artists[0].name, track.name);
            if (youtubeUrl) {
                return youtubeUrl;
            }
        } catch (error) {
            console.error('YouTube search failed:', error);
        }
    }

    return null;
}

module.exports = {
    getYouTubePreviewUrl,
    findAudioPreviewUrl
};