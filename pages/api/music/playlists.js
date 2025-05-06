// pages/api/music/playlists.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { getUserPlaylists } from '../../../lib/spotifyPlayDL';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const session = await getServerSession(req, res, authOptions);

        if (!session) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Vérifier si l'utilisateur a connecté Spotify
        if (!session.user.spotify) {
            return res.status(400).json({
                error: 'Spotify not connected',
                message: 'Vous devez connecter votre compte Spotify pour accéder à vos playlists'
            });
        }

        // Récupérer toutes les playlists de l'utilisateur (pas de limite)
        const playlists = await getUserPlaylists(session.user.id, 50);

        return res.status(200).json({
            playlists: playlists.map(playlist => ({
                id: playlist.id,
                name: playlist.name,
                description: playlist.description,
                images: playlist.images,
                tracks: playlist.tracks?.total || 0
            }))
        });
    } catch (error) {
        console.error('Error fetching playlists:', error);
        return res.status(500).json({
            error: 'Failed to fetch playlists',
            message: error.message
        });
    }
}