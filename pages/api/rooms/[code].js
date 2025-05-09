// pages/api/rooms/[code].js
import { getSession } from 'next-auth/react';
import prisma from '../../../lib/prisma';

export default async function handler(req, res) {
  const { code } = req.query;

  try {
    const session = await getSession({ req });

    if (!session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get room details
    const room = await prisma.room.findUnique({
      where: { code },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            pseudo: true,
            image: true
          }
        },
        players: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                pseudo: true,
                image: true
              }
            }
          }
        }
      }
    });

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if the user is already a player in this room
    const isPlayer = room.players.some(player => player.userId === session.user.id);

    // If the user is not already a player, add them automatically
    if (!isPlayer) {
      await prisma.roomPlayer.create({
        data: {
          roomId: room.id,
          userId: session.user.id
        }
      });

      // Refresh room data to include the new player
      const updatedRoom = await prisma.room.findUnique({
        where: { code },
        include: {
          host: {
            select: {
              id: true,
              name: true,
              pseudo: true,
              image: true
            }
          },
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  pseudo: true,
                  image: true
                }
              }
            }
          }
        }
      });

      return res.status(200).json({ room: updatedRoom });
    }

    return res.status(200).json({ room });

  } catch (error) {
    console.error('Error fetching room:', error);
    return res.status(500).json({ error: 'Failed to fetch room' });
  }
}