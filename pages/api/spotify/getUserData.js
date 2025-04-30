// pages/api/spotify/getUserData.js
import { getSession } from "next-auth/react";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getSession({ req });
    if (!session) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Get Spotify account
        const spotifyAccount = await prisma.account.findFirst({
            where: {
                userId: session.user.id,
                provider: 'spotify',
            },
        });

        if (!spotifyAccount) {
            return res.status(404).json({ error: 'No Spotify account connected' });
        }

        // Fetch liked tracks
        const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
            headers: {
                Authorization: `Bearer ${spotifyAccount.access_token}`,
            },
        });

        if (!response.ok) {
            throw new Error('Failed to fetch Spotify data');
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching Spotify data:', error);
        return res.status(500).json({ error: 'Failed to fetch Spotify data' });
    }
}