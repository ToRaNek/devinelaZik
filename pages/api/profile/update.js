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

    const { pseudo, photoUrl } = req.body;
    
    // Check if pseudo is already taken by another user
    if (pseudo !== session.user.pseudo) {
      const existingUser = await prisma.user.findUnique({
        where: { pseudo }
      });
      
      if (existingUser && existingUser.id !== session.user.id) {
        // Generate a suggestion
        const suggestion = `${pseudo}${Math.floor(Math.random() * 1000)}`;
        return res.status(400).json({ 
          error: 'Ce pseudo est déjà pris', 
          suggestion 
        });
      }
    }
    
    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { 
        pseudo,
        image: photoUrl
      }
    });
    
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
}