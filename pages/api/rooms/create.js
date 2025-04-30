// pages/api/rooms/create.js
import { getServerSession } from "next-auth/next";
import { nanoid } from 'nanoid';
import prisma from '../../../lib/prisma';
import { authOptions } from "../auth/[...nextauth]";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);

    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Generate a room code (6 characters, uppercase)
    const code = nanoid(6).toUpperCase();

    // Create the room
    const room = await prisma.room.create({
      data: {
        code,
        hostId: session.user.id,
        // Add the host as a player too
        players: {
          create: {
            userId: session.user.id,
          }
        }
      }
    });

    return res.status(200).json({ code: room.code });
  } catch (error) {
    console.error('Error creating room:', error);
    return res.status(500).json({ error: 'Failed to create room' });
  }
}