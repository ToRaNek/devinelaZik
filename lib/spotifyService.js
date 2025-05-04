// lib/spotifyService.js
const prisma = require('./prisma');

/**
 * Unified Spotify service for authentication, data retrieval and processing
 * Combines functionality from multiple Spotify utility files
 */
class SpotifyService {
    /**
     * Get a valid Spotify access token with automatic refresh
     * @param {string} userId - User ID
     * @returns {Promise<string>} - Valid access token
     */
    async getValidToken(userId) {
        try {
            console.log(`Getting Spotify token for user ${userId}`);

            // Find Spotify account
            const spotifyAccount = await prisma.account.findFirst({
                where: {
                    userId: userId,
                    provider: 'spotify'
                }
            });

            if (!spotifyAccount) {
                console.log(`No Spotify account linked for user ${userId}`);
                throw new Error('No Spotify account linked');
            }

            // Check if token is expired
            const now = Math.floor(Date.now() / 1000);
            console.log(`Current time: ${now}, token expires: ${spotifyAccount.expires_at}`);

            // Force refresh if token expires in less than 5 minutes
            if (!spotifyAccount.expires_at || spotifyAccount.expires_at <= now + 300) {
                console.log(`Token expired or expires soon, refresh needed`);

                // Check for refresh token
                if (!spotifyAccount.refresh_token) {
                    console.error(`No refresh token available for user ${userId}`);
                    throw new Error('No refresh token available');
                }

                // Refresh the token
                console.log(`Refreshing token...`);

                // Prepare Basic auth for token refresh
                const basic = Buffer.from(
                    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                ).toString('base64');

                const response = await fetch('https://accounts.spotify.com/api/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Authorization': `Basic ${basic}`
                    },
                    body: new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: spotifyAccount.refresh_token
                    })
                });

                if (!response.ok) {
                    console.error(`Failed to refresh token: ${response.status} ${response.statusText}`);
                    const errorBody = await response.text();
                    console.error(`Error response: ${errorBody}`);

                    // Delete invalid accounts to allow re-linking
                    if (response.status === 400 || response.status === 403) {
                        await prisma.account.delete({
                            where: { id: spotifyAccount.id }
                        });
                        console.log(`Spotify account deleted to allow re-linking`);
                        throw new Error('Invalid Spotify account, please reconnect');
                    }

                    throw new Error(`Failed to refresh Spotify token: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                console.log(`Token refreshed successfully`);

                // Update token in database
                const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
                await prisma.account.update({
                    where: { id: spotifyAccount.id },
                    data: {
                        access_token: data.access_token,
                        expires_at: expiresAt,
                        ...(data.refresh_token && { refresh_token: data.refresh_token })
                    }
                });

                console.log(`Token updated in database, expires at ${expiresAt}`);
                return data.access_token;
            }

            console.log(`Using existing token, still valid`);
            return spotifyAccount.access_token;
        } catch (error) {
            console.error('Error getting Spotify token:', error);
            throw error;
        }
    }

    /**
     * Get user's top tracks
     * @param {string} userId - User ID
     * @param {string} timeRange - Time range: short_term, medium_term, long_term
     * @param {number} limit - Maximum number of tracks to retrieve
     * @returns {Promise<Array>} - User's top tracks
     */
    async getUserTopTracks(userId, timeRange = 'medium_term', limit = 50) {
        try {
            console.log(`Getting top tracks for user ${userId} (${timeRange})`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get top tracks: ${response.status}`);
                const errorBody = await response.text();
                console.error(`Error response: ${errorBody}`);
                throw new Error(`Failed to get top tracks: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} top tracks successfully`);
            return data.items;
        } catch (error) {
            console.error('Error getting top tracks:', error);
            throw error;
        }
    }

    /**
     * Get user's saved tracks
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of tracks to retrieve
     * @returns {Promise<Array>} - User's saved tracks
     */
    async getUserSavedTracks(userId, limit = 50) {
        try {
            console.log(`Getting saved tracks for user ${userId}`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/me/tracks?limit=${limit}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get saved tracks: ${response.status}`);
                throw new Error(`Failed to get saved tracks: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} saved tracks successfully`);
            // Transform to match format of other methods
            return data.items.map(item => item.track);
        } catch (error) {
            console.error('Error getting saved tracks:', error);
            throw error;
        }
    }

    /**
     * Get user's recently played tracks
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of tracks to retrieve
     * @returns {Promise<Array>} - User's recently played tracks
     */
    async getRecentlyPlayedTracks(userId, limit = 50) {
        try {
            console.log(`Getting recently played tracks for user ${userId}`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get recently played tracks: ${response.status}`);
                throw new Error(`Failed to get recently played tracks: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} recently played tracks successfully`);
            // Transform to match format of other methods
            return data.items.map(item => item.track);
        } catch (error) {
            console.error('Error getting recently played tracks:', error);
            throw error;
        }
    }

    /**
     * Get user's top artists
     * @param {string} userId - User ID
     * @param {string} timeRange - Time range: short_term, medium_term, long_term
     * @param {number} limit - Maximum number of artists to retrieve
     * @returns {Promise<Array>} - User's top artists
     */
    async getUserTopArtists(userId, timeRange = 'medium_term', limit = 50) {
        try {
            console.log(`Getting top artists for user ${userId}`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get top artists: ${response.status}`);
                throw new Error(`Failed to get top artists: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} top artists successfully`);
            return data.items;
        } catch (error) {
            console.error('Error getting top artists:', error);
            throw error;
        }
    }

    /**
     * Get artist's albums
     * @param {string} artistId - Artist ID
     * @param {string} userId - User ID
     * @returns {Promise<Array>} - Artist's albums
     */
    async getArtistAlbums(artistId, userId) {
        try {
            console.log(`Getting albums for artist ${artistId}`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=50`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get artist albums: ${response.status}`);
                throw new Error(`Failed to get artist albums: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} albums successfully`);
            return data.items;
        } catch (error) {
            console.error('Error getting artist albums:', error);
            throw error;
        }
    }

    /**
     * Get user's playlists
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of playlists to retrieve
     * @returns {Promise<Array>} - User's playlists
     */
    async getUserPlaylists(userId, limit = 50) {
        try {
            console.log(`Getting playlists for user ${userId}`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/me/playlists?limit=${limit}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get playlists: ${response.status}`);
                throw new Error(`Failed to get playlists: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} playlists successfully`);
            return data.items;
        } catch (error) {
            console.error('Error getting playlists:', error);
            throw error;
        }
    }

    /**
     * Get tracks from a playlist
     * @param {string} playlistId - Playlist ID
     * @param {string} userId - User ID
     * @param {number} limit - Maximum number of tracks to retrieve
     * @returns {Promise<Array>} - Playlist tracks
     */
    async getPlaylistTracks(playlistId, userId, limit = 100) {
        try {
            console.log(`Getting tracks for playlist ${playlistId}`);
            const accessToken = await this.getValidToken(userId);

            const response = await fetch(
                `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                console.error(`Failed to get playlist tracks: ${response.status}`);
                throw new Error(`Failed to get playlist tracks: ${response.status}`);
            }

            const data = await response.json();
            console.log(`Retrieved ${data.items?.length || 0} playlist tracks successfully`);
            // Transform to match format of other methods
            return data.items.map(item => item.track).filter(track => track !== null);
        } catch (error) {
            console.error('Error getting playlist tracks:', error);
            throw error;
        }
    }

    /**
     * Search for a track by artist and title
     * @param {string} artist - Artist name
     * @param {string} title - Track title
     * @param {string} userId - User ID
     * @returns {Promise<Object>} - Track details
     */
    async searchTrack(artist, title, userId) {
        try {
            const accessToken = await this.getValidToken(userId);

            const searchQuery = `track:${title} artist:${artist}`;

            const response = await fetch(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Spotify API error: ${response.status}`);
            }

            const data = await response.json();

            if (!data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
                throw new Error('No tracks found');
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
            console.error('Spotify search error:', error);
            throw error;
        }
    }

    /**
     * Enrich questions with Spotify previews
     * @param {Array} questions - List of questions
     * @param {string} userId - User ID for authentication
     * @returns {Promise<Array>} - Questions enriched with previews
     */
    async enrichQuestionsWithPreviews(questions, userId) {
        if (!questions || questions.length === 0) {
            return [];
        }

        try {
            const accessToken = await this.getValidToken(userId);

            const enrichedQuestions = await Promise.all(questions.map(async (question) => {
                // If question already has a preview URL, keep it
                if (question.previewUrl) {
                    return question;
                }

                // For song or artist questions
                if ((question.type === 'song' || question.type === 'artist') && question.artistName) {
                    try {
                        // Build search query based on question type
                        const searchQuery = question.type === 'song'
                            ? `track:${question.answer} artist:${question.artistName}`
                            : `artist:${question.artistName}`;

                        // Search on Spotify
                        const response = await fetch(
                            `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=1`,
                            {
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`
                                }
                            }
                        );

                        if (!response.ok) {
                            console.warn(`Failed search for ${searchQuery}: ${response.status}`);
                            return question;
                        }

                        const data = await response.json();

                        // If results found
                        if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
                            const track = data.tracks.items[0];

                            // Enrich question with Spotify data
                            return {
                                ...question,
                                spotifyTrackId: track.id,
                                previewUrl: track.preview_url,
                                // Update album cover if available and not already set
                                albumCover: question.albumCover || track.album.images[0]?.url
                            };
                        }
                    } catch (error) {
                        console.error(`Error enriching question ${question.id}:`, error);
                    }
                }

                // Return unchanged question if no preview found
                return question;
            }));

            return enrichedQuestions;
        } catch (error) {
            console.error('Error enriching questions:', error);
            return questions; // Return original questions on error
        }
    }
}

module.exports = new SpotifyService();