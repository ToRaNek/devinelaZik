// server.js
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { generateQuestionsFromSpotify } = require('./lib/spotifyUtils');

// Rest of your server code...
const prisma = new PrismaClient();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store active data in memory
const activeRooms = new Map();
const activeGames = new Map();
const activeConnections = new Map();

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);

  // Configuration Socket.IO directement sur le serveur HTTP
  const io = new Server(httpServer, {
    path: '/socket.io',
    // Utiliser polling en premier pour plus de fiabilité
    transports: ['polling', 'websocket'],
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    connectTimeout: 45000,
    pingTimeout: 60000,
    pingInterval: 15000 // More frequent pings to keep connection alive
  });

  // Log toutes les erreurs de bas niveau
  io.engine.on("connection_error", (err) => {
    console.log("Socket.IO connection error:", err.code, err.message, err.context);
  });

  // Authentification simplifiée
  io.use((socket, next) => {
    console.log('Auth attempt:', socket.handshake.auth);

    // Accepter toutes les connexions pour débogage
    socket.userId = socket.handshake.auth.userId || `anonymous-${socket.id}`;
    next();
  });

  // Gestion des connexions
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}, User: ${socket.userId}`);

    // Track active connections
    activeConnections.set(socket.id, {
      userId: socket.userId,
      connected: true,
      lastActivity: Date.now()
    });

    socket.emit('serverAck', {
      message: 'Connected successfully',
      socketId: socket.id,
      userId: socket.userId
    });

    // Heartbeat with more detailed info
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', {
          timestamp: Date.now(),
          id: socket.id,
          rooms: Array.from(socket.rooms)
        });
      }
    }, 15000);

    // Rejoindre une salle
    socket.on('joinRoom', async (data) => {
      try {
        console.log(`User ${socket.userId} joining room ${data.roomCode}`);

        // Quitter les autres salles
        for (const room of [...socket.rooms]) {
          if (room !== socket.id) {
            socket.leave(room);
          }
        }

        socket.join(data.roomCode);

        // Store room data if not already tracked
        if (!activeRooms.has(data.roomCode)) {
          // Get room details from database
          const roomData = await prisma.room.findUnique({
            where: { code: data.roomCode },
            include: {
              host: true,
              players: {
                include: {
                  user: true
                }
              }
            }
          });

          if (roomData) {
            activeRooms.set(data.roomCode, {
              id: roomData.id,
              code: roomData.code,
              hostId: roomData.hostId,
              players: roomData.players.map(player => ({
                userId: player.userId,
                score: player.score,
                user: {
                  id: player.user.id,
                  pseudo: player.user.pseudo,
                  name: player.user.name,
                  image: player.user.image
                }
              })),
              status: 'waiting',
              createdAt: roomData.createdAt
            });
          }
        }

        // Get room data to send to client
        const roomData = activeRooms.get(data.roomCode);

        // Add player to room if not already present
        if (roomData && !roomData.players.some(p => p.userId === socket.userId)) {
          roomData.players.push({
            userId: socket.userId,
            score: 0,
            user: data.user
          });
        }

        // Informer le client
        socket.emit('roomJoined', {
          roomCode: data.roomCode,
          roomData: roomData,
          timestamp: Date.now()
        });

        // Send full room data to all clients
        io.to(data.roomCode).emit('roomData', roomData);

        // Informer les autres membres
        socket.to(data.roomCode).emit('playerJoined', {
          userId: data.user.id,
          user: data.user
        });

        // Message système
        io.to(data.roomCode).emit('message', {
          system: true,
          message: `${data.user?.pseudo || 'Un joueur'} a rejoint la partie!`,
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error in joinRoom:', error);
        socket.emit('error', { message: `Failed to join room: ${error.message}` });
      }
    });

    // Chat
    socket.on('sendMessage', (data) => {
      if (!data.roomCode || !data.message) return;

      io.to(data.roomCode).emit('message', {
        user: data.user,
        message: data.message,
        timestamp: Date.now()
      });
    });

    // Démarrer une partie
    socket.on('startGame', async (data) => {
      try {
        console.log(`Game start requested in room ${data.roomCode} by ${socket.userId}`);
        const roomData = activeRooms.get(data.roomCode);

        // Verify host
        if (!roomData || roomData.hostId !== socket.userId) {
          console.log('Not host, cannot start game');
          socket.emit('error', { message: 'Only the host can start the game' });
          return;
        }

        // Generate questions using Spotify data
        let questions = [];
        try {
          // Get questions from Spotify
          console.log(`Generating questions from ${data.source} for user ${socket.userId}`);
          questions = await generateQuestionsFromSpotify(socket.userId, data.rounds || 10);

          // Add IDs and round numbers to questions
          questions = questions.map((q, index) => ({
            ...q,
            id: `q-${Date.now()}-${index}`,
            round: index + 1
          }));

          console.log(`Generated ${questions.length} questions`);
        } catch (error) {
          console.error('Error generating questions:', error);
          // Use sample questions as fallback
          questions = getSampleQuestions(data.rounds || 10);
        }

        // Store game data
        const gameData = {
          roomCode: data.roomCode,
          status: 'playing',
          hostId: socket.userId,
          currentRound: 0,
          totalRounds: data.rounds || 10,
          questions: questions,
          scores: roomData.players.map(player => ({
            userId: player.userId,
            user: player.user,
            score: 0
          })),
          startTime: Date.now()
        };

        activeGames.set(data.roomCode, gameData);

        // Update room status
        roomData.status = 'playing';

        // Inform clients that game is starting
        io.to(data.roomCode).emit('gameStarted', {
          rounds: data.rounds || 10,
          players: roomData.players.length,
          timestamp: Date.now()
        });

        // Send first question after a short delay
        setTimeout(() => {
          sendNextQuestion(data.roomCode, io);
        }, 2000);
      } catch (error) {
        console.error('Error starting game:', error);
        socket.emit('error', { message: `Failed to start game: ${error.message}` });
      }
    });

    // Handle answer submission
    socket.on('submitAnswer', (data) => {
      try {
        const { roomCode, userId, answer, questionId } = data;

        if (!roomCode || !userId || !answer || !questionId) {
          console.log('Invalid answer submission data');
          return;
        }

        const gameData = activeGames.get(roomCode);

        if (!gameData || gameData.status !== 'playing') {
          console.log('No active game found for this room');
          return;
        }

        // Get current question
        const currentQuestion = gameData.questions[gameData.currentRound - 1];

        if (!currentQuestion || currentQuestion.id !== questionId) {
          console.log('Question mismatch or no current question');
          return;
        }

        // Check answer (allow for case and accent insensitivity)
        const normalizeString = (str) => {
          return str.toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
              .replace(/[^\w\s]/g, '') // Remove special chars
              .trim();
        };

        const userAnswer = normalizeString(answer);
        const correctAnswer = normalizeString(currentQuestion.answer);

        const isCorrect = userAnswer === correctAnswer;

        // Calculate points (more points for faster answers)
        let points = 0;
        if (isCorrect) {
          // Base points + time bonus
          const elapsedTime = currentQuestion.sentAt ? Date.now() - currentQuestion.sentAt : 0;
          const timeRemaining = Math.max(0, 30000 - elapsedTime); // 30 seconds max
          points = 100 + Math.floor(timeRemaining / 1000) * 10; // 10 points per remaining second

          // Update player score
          const playerScore = gameData.scores.find(s => s.userId === userId);
          if (playerScore) {
            playerScore.score += points;
          }

          // Move to next question
          clearTimeout(gameData.questionTimer);

          // Notify player of correct answer
          socket.emit('answerResult', {
            correct: true,
            points: points,
            answer: currentQuestion.answer
          });

          // Notify others
          socket.to(roomCode).emit('message', {
            system: true,
            message: `${gameData.scores.find(s => s.userId === userId)?.user?.pseudo || 'Un joueur'} a trouvé la bonne réponse!`
          });

          // Wait a moment before next question
          setTimeout(() => {
            sendNextQuestion(roomCode, io);
          }, 3000);
        } else {
          // Incorrect answer
          socket.emit('answerResult', {
            correct: false,
            points: 0,
            answer: null // Don't reveal correct answer yet
          });
        }
      } catch (error) {
        console.error('Error processing answer:', error);
      }
    });

    // When player leaves a room
    socket.on('leaveRoom', (roomCode) => {
      if (!roomCode) return;

      console.log(`Player ${socket.userId} leaving room ${roomCode}`);
      socket.leave(roomCode);

      // Update room data
      const roomData = activeRooms.get(roomCode);
      if (roomData) {
        // Remove player from room
        roomData.players = roomData.players.filter(p => p.userId !== socket.userId);

        // If room is empty, remove it
        if (roomData.players.length === 0) {
          activeRooms.delete(roomCode);
          activeGames.delete(roomCode);
        }
        // If host left, assign new host
        else if (roomData.hostId === socket.userId) {
          roomData.hostId = roomData.players[0].userId;

          // Notify clients of host change
          io.to(roomCode).emit('hostChanged', roomData.hostId);

          io.to(roomCode).emit('message', {
            system: true,
            message: `${roomData.players.find(p => p.userId === roomData.hostId)?.user?.pseudo || 'Un joueur'} est maintenant l'hôte de la partie.`
          });
        }

        // Notify remaining players
        io.to(roomCode).emit('playerLeft', socket.userId);

        // Update room data for all clients
        io.to(roomCode).emit('roomData', roomData);
      }
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
      clearInterval(heartbeat);

      // Update active connections
      activeConnections.delete(socket.id);

      // Leave all rooms
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          // Use the same logic as leaveRoom event
          const roomData = activeRooms.get(room);
          if (roomData) {
            // Remove player from room
            roomData.players = roomData.players.filter(p => p.userId !== socket.userId);

            // If room is empty, remove it
            if (roomData.players.length === 0) {
              activeRooms.delete(room);
              activeGames.delete(room);
            }
            // If host left, assign new host
            else if (roomData.hostId === socket.userId) {
              roomData.hostId = roomData.players[0].userId;

              // Notify clients of host change
              io.to(room).emit('hostChanged', roomData.hostId);

              io.to(room).emit('message', {
                system: true,
                message: `${roomData.players.find(p => p.userId === roomData.hostId)?.user?.pseudo || 'Un joueur'} est maintenant l'hôte de la partie.`
              });
            }

            // Notify remaining players
            io.to(room).emit('playerLeft', socket.userId);

            // Update room data for all clients
            io.to(room).emit('roomData', roomData);
          }
        }
      }
    });
  });

  // Function to send next question
  function sendNextQuestion(roomCode, io) {
    const gameData = activeGames.get(roomCode);

    if (!gameData) {
      console.log(`No game data found for room ${roomCode}`);
      return;
    }

    // Move to next round
    gameData.currentRound++;

    // Check if game is over
    if (gameData.currentRound > gameData.totalRounds) {
      endGame(roomCode, io);
      return;
    }

    // Get current question
    const currentQuestion = gameData.questions[gameData.currentRound - 1];
    currentQuestion.sentAt = Date.now();

    console.log(`Sending question for round ${gameData.currentRound}/${gameData.totalRounds} to room ${roomCode}`);

    // Send question to all clients
    io.to(roomCode).emit('newQuestion', {
      ...currentQuestion,
      answer: undefined, // Don't send the answer to clients!
    });

    // Set timer for 30 seconds
    gameData.questionTimer = setTimeout(() => {
      // Time's up for this question
      console.log(`Time's up for question ${currentQuestion.id} in room ${roomCode}`);

      io.to(roomCode).emit('questionTimeout', {
        questionId: currentQuestion.id,
        correctAnswer: currentQuestion.answer
      });

      // Wait a moment before next question
      setTimeout(() => {
        // Before moving to the next question, notify clients of current standings
        io.to(roomCode).emit('roundEnd', {
          round: gameData.currentRound,
          nextRound: gameData.currentRound < gameData.totalRounds ? gameData.currentRound + 1 : null,
          scores: gameData.scores.sort((a, b) => b.score - a.score), // Sort by score
          isLastRound: gameData.currentRound >= gameData.totalRounds
        });

        // If not the last round, proceed to next question
        if (gameData.currentRound < gameData.totalRounds) {
          // Short delay between rounds
          setTimeout(() => {
            sendNextQuestion(roomCode, io);
          }, 3000);
        } else {
          endGame(roomCode, io);
        }
      }, 3000);
    }, 30000); // 30 seconds for each question
  }

  // Function to end game
  function endGame(roomCode, io) {
    const gameData = activeGames.get(roomCode);
    const roomData = activeRooms.get(roomCode);

    if (!gameData || !roomData) return;

    console.log(`Game ended in room ${roomCode}`);

    gameData.status = 'finished';
    roomData.status = 'waiting';

    // Update scores in database
    try {
      gameData.scores.forEach(async (playerScore) => {
        await prisma.roomPlayer.updateMany({
          where: {
            roomId: roomData.id,
            userId: playerScore.userId
          },
          data: {
            score: playerScore.score
          }
        });
      });
    } catch (error) {
      console.error('Error updating scores in database:', error);
    }

    // Send final results to clients
    io.to(roomCode).emit('gameOver', {
      scores: gameData.scores.sort((a, b) => b.score - a.score),
      totalRounds: gameData.totalRounds,
      elapsedTime: Date.now() - gameData.startTime
    });

    // Clean up
    activeGames.delete(roomCode);
  }

  // Function to get sample questions if Spotify API fails
  function getSampleQuestions(count) {
    const questions = [
      {
        type: 'artist',
        previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
        answer: 'Daft Punk',
        artistName: 'Daft Punk',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
      },
      {
        type: 'song',
        previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
        answer: 'Bohemian Rhapsody',
        artistName: 'Queen',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e'
      },
      {
        type: 'album',
        answer: 'Thriller',
        artistName: 'Michael Jackson',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b2734121faee8df82c526cbab2be'
      },
      {
        type: 'artist',
        previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
        answer: 'Billie Eilish',
        artistName: 'Billie Eilish',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e'
      },
      {
        type: 'song',
        previewUrl: 'https://p.scdn.co/mp3-preview/452de87e6104ded50e674050d56c7269336a3fe9',
        answer: 'Blinding Lights',
        artistName: 'The Weeknd',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b27348a42a53ea8e0d9e98423a6d'
      },
      {
        type: 'album',
        answer: 'The Dark Side of the Moon',
        artistName: 'Pink Floyd',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe'
      },
      {
        type: 'artist',
        previewUrl: 'https://p.scdn.co/mp3-preview/77a5b67f66c1f18353ea5afc6e8628c145267d4a',
        answer: 'Kendrick Lamar',
        artistName: 'Kendrick Lamar',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b2732e8ed79e177ff6011076f5f0'
      },
      {
        type: 'song',
        previewUrl: 'https://p.scdn.co/mp3-preview/7df27a9a6ac1d6c8767b61b38dc37ba5cfa3f19c',
        answer: 'Imagine',
        artistName: 'John Lennon',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b2736750daf5f4576e3c25d5c7aa'
      },
      {
        type: 'album',
        answer: 'Nevermind',
        artistName: 'Nirvana',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b27336c5417732e53e23cb219246'
      },
      {
        type: 'artist',
        previewUrl: 'https://p.scdn.co/mp3-preview/8de4f9d9671c42e7e6f3ecf0edcba3f08d5593f2',
        answer: 'Taylor Swift',
        artistName: 'Taylor Swift',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b273e0b64c8be3c4e804abcb2696'
      },
      {
        type: 'song',
        previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
        answer: 'Get Lucky',
        artistName: 'Daft Punk',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
      },
      {
        type: 'album',
        answer: 'Abbey Road',
        artistName: 'The Beatles',
        albumCover: 'https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25'
      }
    ];

    // Add IDs and round numbers
    const selectedQuestions = questions
        .slice(0, count)
        .map((q, index) => ({
          ...q,
          id: `sample-${Date.now()}-${index}`,
          round: index + 1
        }));

    return selectedQuestions;
  }

  // Add a periodic cleanup task to remove stale data
  setInterval(() => {
    const now = Date.now();

    // Clean up inactive connections (older than 1 hour)
    for (const [id, connection] of activeConnections.entries()) {
      if (now - connection.lastActivity > 3600000) {
        activeConnections.delete(id);
      }
    }

    // Clean up finished games (older than 1 hour)
    for (const [roomCode, gameData] of activeGames.entries()) {
      if (gameData.status === 'finished' && now - gameData.startTime > 3600000) {
        activeGames.delete(roomCode);
      }
    }
  }, 300000); // Run every 5 minutes

  // Toutes les requêtes HTTP passent à Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // Démarrage du serveur
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log('> Socket.IO server initialized');
  });
});