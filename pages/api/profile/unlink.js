// pages/api/profile/unlink.js
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { provider } = req.body;

    // Make sure the provider is valid
    if (!['spotify', 'deezer'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
    }

    // Get the count of music service accounts
    const accountCount = await prisma.account.count({
      where: {
        userId: session.user.id,
        provider: { in: ['spotify', 'deezer'] }
      }
    });

    // Check if this is the user's only music service
    if (accountCount <= 1) {
      return res.status(400).json({
        error: 'Vous ne pouvez pas délier votre seul service de musique. Connectez un autre service d\'abord.'
      });
    }

    // Delete the account connection
    await prisma.account.deleteMany({
      where: {
        userId: session.user.id,
        provider: provider
      }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error unlinking account:', error);
    return res.status(500).json({ error: 'Failed to unlink account' });
  }
}