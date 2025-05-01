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

        // Step 2: Convert YouTube video to audio-only stream URL
        // Option 1: Return a YouTube embed URL with autoplay and time limit
        // This will embed the YouTube player but we can hide visuals with CSS
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&start=30&end=60&enablejsapi=1`;

        // Option 2: If you want to use a YouTube-to-MP3 service API
        // Note: This would require a separate API service, so I'm providing the embed approach above instead

        // Option 3: If you're running your own server, you could use youtube-dl library
        // This would be implemented on your server side
    } catch (error) {
        console.error('Error fetching YouTube preview:', error);
        return null;
    }
}

/**
 * Extracts a playable audio stream from YouTube
 * For use on server-side only as it requires libraries like ytdl-core
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string|null>} - Audio stream URL or null
 */
async function getYouTubeAudioStream(videoId) {
    try {
        // This function would be implemented on your server using ytdl-core
        // It's not possible to use ytdl-core directly in browser code

        // Server-side implementation example (would go in an API route):
        /*
        const ytdl = require('ytdl-core');
        const info = await ytdl.getInfo(videoId);
        const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
        if (audioFormats.length > 0) {
          return audioFormats[0].url; // Return the audio stream URL
        }
        */

        // For client-side, we'd need to create an API endpoint that returns this URL
        return fetch(`/api/youtube-audio?videoId=${videoId}`)
            .then(res => res.json())
            .then(data => data.audioUrl);
    } catch (error) {
        console.error('Error extracting YouTube audio stream:', error);
        return null;
    }
}

module.exports = {
    getYouTubePreviewUrl,
    getYouTubeAudioStream
};