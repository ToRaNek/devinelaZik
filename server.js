// server.js
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store active room data in memory for performance
const activeRooms = new Map();
const activeGames = new Map();
const activeConnections = new Map(); // Track active connections by user

// Game logic constants
const QUESTION_DURATION = 30; // seconds
const ROUND_TRANSITION_DELAY = 5; // seconds
const DEFAULT_ROUNDS = 10;

// Utility functions
const getRandomItems = (array, count) => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

const normalizeString = (str) => {
  return str
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^\w\s]/gi, '') // Remove special characters
      .trim();
};

const checkAnswer = (userAnswer, correctAnswer) => {
  const normalizedUser = normalizeString(userAnswer);
  const normalizedCorrect = normalizeString(correctAnswer);

  // Exact match
  if (normalizedUser === normalizedCorrect) return true;

  // Partial match for long titles (>4 words)
  const correctWords = normalizedCorrect.split(' ');
  if (correctWords.length > 4) {
    // If at least 70% of words are present
    const userWords = normalizedUser.split(' ');
    const commonWords = correctWords.filter(word => userWords.includes(word));
    if (commonWords.length >= correctWords.length * 0.7) return true;
  }

  // Check if answer is included in correct answer or vice versa
  if (normalizedCorrect.includes(normalizedUser) && normalizedUser.length > 3) return true;
  if (normalizedUser.includes(normalizedCorrect) && normalizedCorrect.length > 3) return true;

  // Check levenshtein distance for short answers
  if (normalizedCorrect.length < 15 && normalizedUser.length < 15) {
    const distance = levenshteinDistance(normalizedUser, normalizedCorrect);
    if (distance <= 2) return true;
  }

  return false;
};

const levenshteinDistance = (a, b) => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
};

// Create sample questions until music API integration is ready
const getSampleQuestions = (count) => {
  const questions = [
    {
      id: '1',
      type: 'artist',
      previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
      answer: 'Daft Punk',
      artistName: 'Daft Punk',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
    },
    {
      id: '2',
      type: 'song',
      previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
      answer: 'Bohemian Rhapsody',
      artistName: 'Queen',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e'
    },
    {
      id: '3',
      type: 'album',
      answer: 'Thriller',
      artistName: 'Michael Jackson',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2734121faee8df82c526cbab2be'
    },
    {
      id: '4',
      type: 'artist',
      previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
      answer: 'Billie Eilish',
      artistName: 'Billie Eilish',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e'
    },
    {
      id: '5',
      type: 'song',
      previewUrl: 'https://p.scdn.co/mp3-preview/452de87e6104ded50e674050d56c7269336a3fe9',
      answer: 'Blinding Lights',
      artistName: 'The Weeknd',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b27348a42a53ea8e0d9e98423a6d'
    },
    {
      id: '6',
      type: 'album',
      answer: 'The Dark Side of the Moon',
      artistName: 'Pink Floyd',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe'
    },
    {
      id: '7',
      type: 'artist',
      previewUrl: 'https://p.scdn.co/mp3-preview/77a5b67f66c1f18353ea5afc6e8628c145267d4a',
      answer: 'Kendrick Lamar',
      artistName: 'Kendrick Lamar',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2732e8ed79e177ff6011076f5f0'
    },
    {
      id: '8',
      type: 'song',
      previewUrl: 'https://p.scdn.co/mp3-preview/7df27a9a6ac1d6c8767b61b38dc37ba5cfa3f19c',
      answer: 'Imagine',
      artistName: 'John Lennon',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2736750daf5f4576e3c25d5c7aa'
    },
    {
      id: '9',
      type: 'album',
      answer: 'Nevermind',
      artistName: 'Nirvana',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b27336c5417732e53e23cb219246'
    },
    {
      id: '10',
      type: 'artist',
      previewUrl: 'https://p.scdn.co/mp3-preview/8de4f9d9671c42e7e6f3ecf0edcba3f08d5593f2',
      answer: 'Taylor Swift',
      artistName: 'Taylor Swift',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273e0b64c8be3c4e804abcb2696'
    },
    {
      id: '11',
      type: 'song',
      previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
      answer: 'Get Lucky',
      artistName: 'Daft Punk',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
    },
    {
      id: '12',
      type: 'album',
      answer: 'Abbey Road',
      artistName: 'The Beatles',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25'
    },
    {
      id: '13',
      type: 'artist',
      previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
      answer: 'Queen',
      artistName: 'Queen',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e'
    },
    {
      id: '14',
      type: 'song',
      previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
      answer: 'Bad Guy',
      artistName: 'Billie Eilish',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e'
    }
  ];

  return getRandomItems(questions, count);
};

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);

  // Improved Socket.IO configuration
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
    allowEIO3: true, // For compatibility
    path: '/socket.io', // Ensure this matches the client config
  });

  // Log low-level errors
  io.engine.on("connection_error", (err) => {
    console.log("❌ Socket.IO low-level error:", err.code, err.message, err.context);
  });

  // Middleware for auth and logging
  io.use((socket, next) => {
    console.log('Socket middleware executed with auth:', socket.handshake.auth);

    // Check for userId in auth
    if (socket.handshake.auth && socket.handshake.auth.userId) {
      socket.userId = socket.handshake.auth.userId;

      // Validate user exists in database
      prisma.user.findUnique({
        where: { id: socket.userId }
      }).then(user => {
        if (!user) {
          console.log(`User ${socket.userId} not found in database`);
          return next(new Error('User not found'));
        }
        console.log(`User ${socket.userId} authenticated successfully`);
        next();
      }).catch(err => {
        console.error('Error validating user:', err);
        next(new Error('Authentication failed'));
      });
    } else {
      console.log('No user ID provided in auth');
      next(new Error('Authentication required')); // Changed to require auth
    }
  });

  // Socket.IO connection handling
  io.on('connection', (socket) => {
    console.log('✅ New client connected', socket.id, 'User ID:', socket.userId);

    // Send confirmation immediately
    socket.emit('serverAck', { message: 'Connected successfully', socketId: socket.id });

    // Heartbeat interval
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 30000);

    // Join room handler
    socket.on('joinRoom', async ({roomCode, user}) => {
      try {
        console.log(`User ${user.id} joining room ${roomCode}`);

        // Update socket userId
        socket.userId = user.id;

        // Track active connection
        activeConnections.set(user.id, socket.id);

        // Leave other rooms first
        for (const room of [...socket.rooms]) {
          if (room !== socket.id) {
            socket.leave(room);
          }
        }

        // Join the Socket.IO room
        socket.join(roomCode);

        // Get or create room data
        if (!activeRooms.has(roomCode)) {
          // Fetch from database
          const room = await prisma.room.findUnique({
            where: {code: roomCode},
            include: {
              host: {
                select: {
                  id: true,
                  pseudo: true,
                  image: true
                }
              },
              players: {
                include: {
                  user: {
                    select: {
                      id: true,
                      pseudo: true,
                      image: true
                    }
                  }
                }
              }
            }
          });

          if (!room) {
            socket.emit('error', {message: 'Room not found'});
            return;
          }

          // Initialize active room
          activeRooms.set(roomCode, {
            id: room.id,
            hostId: room.hostId,
            players: room.players.map(p => ({
              userId: p.userId,
              roomId: p.roomId,
              score: p.score,
              ready: false,
              user: p.user
            })),
            status: 'waiting',
            lastActivity: Date.now()
          });
        }

        const activeRoom = activeRooms.get(roomCode);
        activeRoom.lastActivity = Date.now(); // Update activity timestamp

        // Check if user is already in the room
        const existingPlayerIndex = activeRoom.players.findIndex(p => p.userId === user.id);

        if (existingPlayerIndex === -1) {
          // Add player to active room
          activeRoom.players.push({
            userId: user.id,
            roomId: activeRoom.id,
            score: 0,
            ready: false,
            user: {
              id: user.id,
              pseudo: user.pseudo || user.name,
              image: user.image
            }
          });

          // Add to database if not already present
          try {
            await prisma.roomPlayer.upsert({
              where: {
                roomId_userId: {
                  roomId: activeRoom.id,
                  userId: user.id
                }
              },
              update: {},
              create: {
                roomId: activeRoom.id,
                userId: user.id,
                score: 0
              }
            });
          } catch (err) {
            console.error('Error upserting player to database:', err);
          }

          // Notify other players
          socket.to(roomCode).emit('playerJoined', {
            userId: user.id,
            user: {
              id: user.id,
              pseudo: user.pseudo || user.name,
              image: user.image
            },
            score: 0,
            ready: false
          });
        } else {
          // Update existing player info
          activeRoom.players[existingPlayerIndex].user = {
            id: user.id,
            pseudo: user.pseudo || user.name,
            image: user.image
          };
        }

        // Send room data to connecting user
        socket.emit('roomData', activeRoom);

        // Add system message for all users
        io.to(roomCode).emit('message', {
          system: true,
          message: `${user.pseudo || 'Un joueur'} a rejoint la partie!`
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', {message: 'Failed to join room: ' + error.message});
      }
    });

    // Add other Socket.IO event handlers here for game logic

    // Implement leaveRoom handler
    socket.on('leaveRoom', async (roomCode) => {
      try {
        if (!roomCode || !socket.userId) return;

        console.log(`User ${socket.userId} leaving room ${roomCode}`);

        // Leave the Socket.IO room
        socket.leave(roomCode);

        // Update active room data if it exists
        if (activeRooms.has(roomCode)) {
          const room = activeRooms.get(roomCode);

          // Find the player in the room
          const playerIndex = room.players.findIndex(p => p.userId === socket.userId);

          if (playerIndex !== -1) {
            // Remove player from memory
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);

            // Notify other players
            io.to(roomCode).emit('playerLeft', socket.userId);

            // Add system message
            io.to(roomCode).emit('message', {
              system: true,
              message: `${player.user?.pseudo || 'Un joueur'} a quitté la partie.`
            });

            // If room is empty, remove it from memory
            if (room.players.length === 0) {
              activeRooms.delete(roomCode);
              console.log(`Room ${roomCode} is now empty, removed from memory`);
            }
            // If host left, assign a new host
            else if (room.hostId === socket.userId && room.players.length > 0) {
              const newHost = room.players[0].userId;
              room.hostId = newHost;

              // Update in database
              await prisma.room.update({
                where: { id: room.id },
                data: { hostId: newHost }
              });

              // Notify players about host change
              io.to(roomCode).emit('hostChanged', newHost);
              io.to(roomCode).emit('message', {
                system: true,
                message: `${room.players[0].user?.pseudo || 'Un joueur'} est le nouvel hôte.`
              });
            }
          }
        }
      } catch (error) {
        console.error('Error leaving room:', error);
      }
    });

    // Health check handler
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id, 'userId:', socket.userId);

      // Clear heartbeat
      clearInterval(heartbeat);

      // Clean up active connections
      if (socket.userId) {
        activeConnections.delete(socket.userId);

        // Handle player leaving from all rooms they might be in
        for (const [roomCode, room] of activeRooms.entries()) {
          const playerIndex = room.players.findIndex(p => p.userId === socket.userId);

          if (playerIndex !== -1) {
            console.log(`Auto-removing disconnected user ${socket.userId} from room ${roomCode}`);

            // Get player before removing
            const player = room.players[playerIndex];

            // Remove from room players list
            room.players.splice(playerIndex, 1);

            // Notify other players
            io.to(roomCode).emit('playerLeft', socket.userId);
            io.to(roomCode).emit('message', {
              system: true,
              message: `${player.user?.pseudo || 'Un joueur'} s'est déconnecté.`
            });

            // Handle empty room or host change
            if (room.players.length === 0) {
              activeRooms.delete(roomCode);
            } else if (room.hostId === socket.userId && room.players.length > 0) {
              const newHost = room.players[0].userId;
              room.hostId = newHost;

              // Update in database (async, don't await)
              prisma.room.update({
                where: { id: room.id },
                data: { hostId: newHost }
              }).catch(err => console.error('Error updating host:', err));

              // Notify about host change
              io.to(roomCode).emit('hostChanged', newHost);
              io.to(roomCode).emit('message', {
                system: true,
                message: `${room.players[0].user?.pseudo || 'Un joueur'} est le nouvel hôte.`
              });
            }
          }
        }
      }
    });
  });

  // API routes
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // Clean up inactive rooms periodically
  const cleanupInactiveRooms = () => {
    console.log('Cleaning up inactive rooms');
    const now = Date.now();
    const inactivityThreshold = 3 * 60 * 60 * 1000; // 3 hours

    for (const [roomCode, room] of activeRooms.entries()) {
      if (!activeGames.has(roomCode) && room.lastActivity && (now - room.lastActivity > inactivityThreshold)) {
        console.log(`Removing inactive room ${roomCode}`);
        activeRooms.delete(roomCode);
      }
    }
  };

  // Run cleanup every hour
  setInterval(cleanupInactiveRooms, 60 * 60 * 1000);

  // Start the server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log('> Socket.IO server is running');
  });
});