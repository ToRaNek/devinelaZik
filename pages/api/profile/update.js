// pages/apinext-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import prisma from "../../../lib/prisma";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Non authentifié' });
  }

  try {
    const { pseudo } = req.body;

    // Check if pseudo is already taken
    const existingUser = await prisma.user.findUnique({
      where: { pseudo },
      select: { id: true }
    });

    if (existingUser && existingUser.id !== session.user.id) {
      const suggestion = `${pseudo}${Math.floor(Math.random() * 1000)}`;
      return res.status(400).json({
        error: 'Ce pseudo est déjà pris',
        suggestion
      });
    }

    // Update user
    await prisma.user.update({
      where: { id: session.user.id },
      data: { pseudo }
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Profile update error:', error);
    return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
}