import { getSession } from 'next-auth/react';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getSession({ req });
    
    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { provider } = req.body;
    
    // Make sure the provider is valid
    if (!['spotify', 'deezer'].includes(provider)) {
      return res.status(400).json({ error: 'Invalid provider' });
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