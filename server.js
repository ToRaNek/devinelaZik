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

// Stocker les données des salles actives en mémoire pour plus de rapidité
const activeRooms = new Map();
const activeGames = new Map();
const activeConnections = new Map(); // Pour suivre les connexions actives par utilisateur

// Helpers pour la logique du jeu
const QUESTION_DURATION = 30; // secondes
const ROUND_TRANSITION_DELAY = 5; // secondes
const DEFAULT_ROUNDS = 10;

// Fonctions utilitaires
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

  // Contrôle exact
  if (normalizedUser === normalizedCorrect) return true;

  // Contrôle partiel pour les titres très longs (>4 mots)
  const correctWords = normalizedCorrect.split(' ');
  if (correctWords.length > 4) {
    // Si au moins 70% des mots sont présents
    const userWords = normalizedUser.split(' ');
    const commonWords = correctWords.filter(word => userWords.includes(word));
    if (commonWords.length >= correctWords.length * 0.7) return true;
  }

  // Vérifier si la réponse utilisateur est incluse dans la réponse correcte ou inversement
  if (normalizedCorrect.includes(normalizedUser) && normalizedUser.length > 3) return true;
  if (normalizedUser.includes(normalizedCorrect) && normalizedCorrect.length > 3) return true;

  // Vérifier la distance de levenshtein pour les réponses courtes
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

// Créer des échantillons de questions en attendant l'intégration des API musicales
const getSampleQuestions = (count) => {
  // Même implémentation que dans votre code original
  const questions = [
    {
      id: '1',
      type: 'artist',
      previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
      answer: 'Daft Punk',
      artistName: 'Daft Punk',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
    },
    // ... autres questions
  ];

  return getRandomItems(questions, count);
};

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);

  // Configuration améliorée de Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'], // Assurez-vous que les deux transports sont disponibles
    allowEIO3: true, // Pour la compatibilité
  });

  // Logging côté serveur pour les erreurs bas niveau
  io.engine.on("connection_error", (err) => {
    console.log("❌ Socket.IO low-level error:", err.code, err.message, err.context);
  });

  // Middleware pour les logs et la gestion des sessions
  io.use((socket, next) => {
    console.log('Socket middleware executed with auth:', socket.handshake.auth);

    // Si l'authentification contient un userId, l'associer au socket
    if (socket.handshake.auth && socket.handshake.auth.userId) {
      socket.userId = socket.handshake.auth.userId;

      // Vous pourriez valider l'existence de l'utilisateur ici
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
      next(); // Permettre la connexion même sans authentification pour le moment
    }
  });

  // Socket.IO logic
  io.on('connection', (socket) => {
    console.log('✅ New client connected', socket.id, 'User ID:', socket.userId);

    // Émettre un événement de confirmation immédiatement
    socket.emit('serverAck', { message: 'Connected successfully' });

    // Vérifier la santé de la connexion périodiquement
    const heartbeat = setInterval(() => {
      socket.emit('heartbeat', { timestamp: Date.now() });
    }, 30000);

    // Rejoindre une salle
    socket.on('joinRoom', async ({roomCode, user}) => {
      try {
        console.log(`User ${user.id} joining room ${roomCode}`);

        // Store user ID on socket instance for this session
        socket.userId = user.id;

        // Ajouter à la liste des connexions actives
        activeConnections.set(user.id, socket.id);

        // Quitter les autres salles d'abord (pour éviter les connexions multiples)
        for (const room of [...socket.rooms]) {
          if (room !== socket.id) {
            socket.leave(room);
          }
        }

        // Joindre la salle Socket.IO
        socket.join(roomCode);

        // Gérer les données de salle en mémoire
        if (!activeRooms.has(roomCode)) {
          // Récupérer les données de la salle depuis la base de données
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

          // Initialiser la salle active
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
            status: 'waiting'
          });
        }

        const activeRoom = activeRooms.get(roomCode);

        // Vérifier si l'utilisateur est déjà dans la salle
        const existingPlayerIndex = activeRoom.players.findIndex(p => p.userId === user.id);

        if (existingPlayerIndex === -1) {
          // Ajouter le joueur à la salle active
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

          // Ajouter aussi à la base de données si pas déjà présent
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

          // Informer les autres joueurs
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
          // Mettre à jour les informations du joueur existant
          activeRoom.players[existingPlayerIndex].user = {
            id: user.id,
            pseudo: user.pseudo || user.name,
            image: user.image
          };
        }

        // Always send the current room data back to the connecting user
        socket.emit('roomData', activeRoom);

        // Ajouter un message système - use io.to to send to all including sender
        io.to(roomCode).emit('message', {
          system: true,
          message: `${user.pseudo || 'Un joueur'} a rejoint la partie!`
        });
      } catch (error) {
        console.error('Error joining room:', error);
        socket.emit('error', {message: 'Failed to join room: ' + error.message});
      }
    });

    // Le reste de votre logique Socket.IO

    // Vérification de la santé de la connexion
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Déconnexion
    socket.on('disconnect', () => {
      console.log('Client disconnected', socket.id, 'userId:', socket.userId);

      // Arrêter le heartbeat
      clearInterval(heartbeat);

      // Si userId est défini, le supprimer de la liste des connexions actives
      if (socket.userId) {
        activeConnections.delete(socket.userId);
      }

      // Traiter la déconnexion pour toutes les salles
      // (votre code de gestion de déconnexion existant)
    });
  });

  // Routes API Express
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // Fonction pour nettoyer les salles inactives périodiquement
  const cleanupInactiveRooms = () => {
    console.log('Cleaning up inactive rooms');
    const now = Date.now();
    const inactivityThreshold = 3 * 60 * 60 * 1000; // 3 heures

    for (const [roomCode, room] of activeRooms.entries()) {
      // Si la salle n'a pas de jeu actif et est inactive depuis longtemps
      if (!activeGames.has(roomCode) && room.lastActivity && (now - room.lastActivity > inactivityThreshold)) {
        console.log(`Removing inactive room ${roomCode}`);
        activeRooms.delete(roomCode);
      }
    }
  };

  // Nettoyer les salles inactives toutes les heures
  setInterval(cleanupInactiveRooms, 60 * 60 * 1000);

  // Démarrer le serveur
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log('> Socket.IO server is running');
  });
});