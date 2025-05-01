// lib/spotifyPlayDL.js
const prisma = require('./prisma');

/**
 * Obtient un jeton d'accès valide pour l'API Spotify
 */
async function getValidSpotifyToken(userId) {
    try {
        console.log(`Récupération du token Spotify pour l'utilisateur ${userId}`);

        // Recherche du compte Spotify de l'utilisateur
        const spotifyAccount = await prisma.account.findFirst({
            where: {
                userId: userId,
                provider: 'spotify'
            }
        });

        if (!spotifyAccount) {
            console.log(`Aucun compte Spotify lié pour l'utilisateur ${userId}`);
            throw new Error('Aucun compte Spotify lié');
        }

        // Vérifier si le jeton est expiré
        const now = Math.floor(Date.now() / 1000);
        console.log(`Temps actuel: ${now}, expiration du token: ${spotifyAccount.expires_at}`);

        // Forcer le rafraîchissement si le jeton expire dans moins de 5 minutes
        if (!spotifyAccount.expires_at || spotifyAccount.expires_at <= now + 300) {
            console.log(`Le token est expiré ou expire bientôt, rafraîchissement nécessaire`);

            // Vérifier si nous avons un refresh token
            if (!spotifyAccount.refresh_token) {
                console.error(`Pas de refresh token disponible pour l'utilisateur ${userId}`);
                throw new Error('Pas de refresh token disponible');
            }

            // Le jeton est expiré, il faut le rafraîchir
            console.log(`Rafraîchissement du token en cours...`);

            // Préparer l'encodage Basic pour l'authentification
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
                console.error(`Échec lors du rafraîchissement du token: ${response.status} ${response.statusText}`);
                // Log de la réponse pour le débogage
                const errorBody = await response.text();
                console.error(`Réponse d'erreur: ${errorBody}`);

                // Si l'erreur indique que le refresh token est invalide, on supprime le compte pour permettre une nouvelle liaison
                if (response.status === 400 || response.status === 403) {
                    await prisma.account.delete({
                        where: { id: spotifyAccount.id }
                    });
                    console.log(`Compte Spotify supprimé pour permettre une nouvelle liaison`);
                    throw new Error('Compte Spotify invalide, veuillez vous reconnecter');
                }

                throw new Error(`Échec lors du rafraîchissement du jeton Spotify: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`Token rafraîchi avec succès, nouveau token obtenu`);

            // Mettre à jour le jeton dans la base de données
            const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
            await prisma.account.update({
                where: { id: spotifyAccount.id },
                data: {
                    access_token: data.access_token,
                    expires_at: expiresAt,
                    // Mettre à jour le refresh_token s'il est fourni dans la réponse
                    ...(data.refresh_token && { refresh_token: data.refresh_token })
                }
            });

            console.log(`Token mis à jour dans la base de données, expire à ${expiresAt}`);
            return data.access_token;
        }

        console.log(`Utilisation du token existant, il est encore valide`);
        return spotifyAccount.access_token;
    } catch (error) {
        console.error('Erreur lors de l\'obtention du jeton Spotify:', error);
        throw error;
    }
}

/**
 * Récupère les chansons préférées de l'utilisateur
 */
async function getUserTopTracks(userId, timeRange = 'medium_term', limit = 50) {
    try {
        console.log(`Récupération des titres préférés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des titres préférés: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des titres préférés: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} titres préférés récupérés avec succès`);
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des titres préférés:', error);
        throw error;
    }
}

/**
 * Récupère les titres sauvegardés (likés) de l'utilisateur
 */
async function getUserSavedTracks(userId, limit = 50) {
    try {
        console.log(`Récupération des titres sauvegardés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des titres sauvegardés: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des titres sauvegardés: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} titres sauvegardés récupérés avec succès`);
        // Transformation pour avoir le même format que les autres fonctions
        return data.items.map(item => item.track);
    } catch (error) {
        console.error('Erreur lors de la récupération des titres sauvegardés:', error);
        throw error;
    }
}

/**
 * Récupère l'historique d'écoute récent de l'utilisateur
 */
async function getRecentlyPlayedTracks(userId, limit = 50) {
    try {
        console.log(`Récupération de l'historique d'écoute pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération de l'historique d'écoute: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération de l'historique d'écoute: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} titres récemment écoutés récupérés avec succès`);
        // Transformation pour avoir le même format que les autres fonctions
        return data.items.map(item => item.track);
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'historique d\'écoute:', error);
        throw error;
    }
}

/**
 * Récupère les artistes préférés de l'utilisateur
 */
async function getUserTopArtists(userId, timeRange = 'medium_term', limit = 50) {
    try {
        console.log(`Récupération des artistes préférés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des artistes préférés: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des artistes préférés: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} artistes préférés récupérés avec succès`);
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des artistes préférés:', error);
        throw error;
    }
}

/**
 * Récupère les albums d'un artiste
 */
async function getArtistAlbums(artistId, userId) {
    try {
        console.log(`Récupération des albums pour l'artiste ${artistId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=50`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des albums: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des albums: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} albums récupérés avec succès`);
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des albums:', error);
        throw error;
    }
}

/**
 * Récupère les playlists de l'utilisateur
 */
async function getUserPlaylists(userId, limit = 50) {
    try {
        console.log(`Récupération des playlists pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/playlists?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des playlists: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des playlists: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} playlists récupérées avec succès`);
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des playlists:', error);
        throw error;
    }
}

/**
 * Récupère les pistes d'une playlist
 */
async function getPlaylistTracks(playlistId, userId, limit = 100) {
    try {
        console.log(`Récupération des pistes pour la playlist ${playlistId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des pistes de la playlist: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des pistes de la playlist: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} pistes de playlist récupérées avec succès`);
        // Transformation pour avoir le même format que les autres fonctions
        return data.items.map(item => item.track).filter(track => track !== null);
    } catch (error) {
        console.error('Erreur lors de la récupération des pistes de la playlist:', error);
        throw error;
    }
}

// Exportation des fonctions
module.exports = {
    getValidSpotifyToken,
    getUserTopTracks,
    getUserSavedTracks,
    getRecentlyPlayedTracks,
    getUserTopArtists,
    getArtistAlbums,
    getUserPlaylists,
    getPlaylistTracks
};