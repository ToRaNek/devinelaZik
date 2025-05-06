// pages/api/music/preferences.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    // GET - Récupérer les préférences actuelles
    if (req.method === 'GET') {
        try {
            const preferences = await prisma.userMusicPreference.findUnique({
                where: { userId: session.user.id }
            });

            return res.status(200).json(preferences || {
                playlistIds: [],
                playlistNames: [],
                useLikedTracks: true,
                useListeningHistory: true
            });
        } catch (error) {
            console.error('Error fetching music preferences:', error);
            return res.status(500).json({ error: 'Failed to fetch music preferences' });
        }
    }

    // POST - Mettre à jour les préférences
    if (req.method === 'POST') {
        try {
            const { playlistIds, playlistNames, useLikedTracks, useListeningHistory } = req.body;

            // Validation
            if (!Array.isArray(playlistIds) || !Array.isArray(playlistNames)) {
                return res.status(400).json({ error: 'Invalid data format' });
            }

            // Mettre à jour ou créer les préférences
            const preferences = await prisma.userMusicPreference.upsert({
                where: { userId: session.user.id },
                update: {
                    playlistIds,
                    playlistNames,
                    useLikedTracks: useLikedTracks !== false, // Par défaut true
                    useListeningHistory: useListeningHistory !== false // Par défaut true
                },
                create: {
                    userId: session.user.id,
                    playlistIds,
                    playlistNames,
                    useLikedTracks: useLikedTracks !== false,
                    useListeningHistory: useListeningHistory !== false
                }
            });

            return res.status(200).json(preferences);
        } catch (error) {
            console.error('Error updating music preferences:', error);
            return res.status(500).json({ error: 'Failed to update music preferences' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}