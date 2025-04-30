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

  // Configuration améliorée de Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'], // Assurez-vous que les deux transports sont disponibles
    allowEIO3: true, // Pour la compatibilité
  });

  // Middleware pour les logs et la gestion des sessions
  io.use((socket, next) => {
    console.log('Socket middleware executed with auth:', socket.handshake.auth);

    // Si l'authentification contient un userId, l'associer au socket
    if (socket.handshake.auth && socket.handshake.auth.userId) {
      socket.userId = socket.handshake.auth.userId;
    }

    next();
  });

  // Socket.IO logic
  io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

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

    // Quitter une salle
    socket.on('leaveRoom', (roomCode) => {
      console.log(`User ${socket.userId} leaving room ${roomCode}`);
      if (!activeRooms.has(roomCode)) {
        console.log(`Room ${roomCode} not found, cannot leave`);
        return;
      }

      const activeRoom = activeRooms.get(roomCode);
      const playerIndex = activeRoom.players.findIndex(p => p.userId === socket.userId);

      if (playerIndex !== -1) {
        const player = activeRoom.players[playerIndex];
        console.log(`Player ${player.user?.pseudo || player.userId} found, removing from room`);

        // Supprimer le joueur de la salle active
        activeRoom.players.splice(playerIndex, 1);

        // Informer les autres joueurs
        socket.to(roomCode).emit('playerLeft', player.userId);

        // Ajouter un message système
        io.to(roomCode).emit('message', {
          system: true,
          message: `${player.user?.pseudo || 'Un joueur'} a quitté la partie.`
        });

        // Si plus aucun joueur, supprimer la salle
        if (activeRoom.players.length === 0) {
          console.log(`No players left in room ${roomCode}, removing room`);
          activeRooms.delete(roomCode);

          // Si un jeu est en cours, le supprimer aussi
          if (activeGames.has(roomCode)) {
            clearTimeout(activeGames.get(roomCode).timer);
            activeGames.delete(roomCode);
          }
        }
        // Si l'hôte quitte, transférer l'hôte au joueur suivant
        else if (player.userId === activeRoom.hostId && activeRoom.players.length > 0) {
          console.log(`Host has left, transferring host role to ${activeRoom.players[0].user?.pseudo || activeRoom.players[0].userId}`);
          activeRoom.hostId = activeRoom.players[0].userId;

          // Informer les joueurs du changement d'hôte
          io.to(roomCode).emit('hostChanged', activeRoom.hostId);

          // Ajouter un message système
          io.to(roomCode).emit('message', {
            system: true,
            message: `${activeRoom.players[0].user?.pseudo || 'Un joueur'} est maintenant l'hôte.`
          });
        }
      } else {
        console.log(`Player ${socket.userId} not found in room ${roomCode}`);
      }

      // Quitter la salle Socket.IO
      socket.leave(roomCode);
    });

    // Définir l'état "prêt" du joueur
    socket.on('setReady', ({roomCode, userId, ready}) => {
      console.log(`User ${userId} setting ready state to ${ready} in room ${roomCode}`);
      if (!activeRooms.has(roomCode)) return;

      const activeRoom = activeRooms.get(roomCode);
      const player = activeRoom.players.find(p => p.userId === userId);

      if (player) {
        player.ready = ready;

        // Informer tous les joueurs
        io.to(roomCode).emit('playerReady', {userId, ready});
      }
    });

    // Démarrer une partie
    socket.on('startGame', ({roomCode, rounds, source}) => {
      console.log(`Starting game in room ${roomCode} with ${rounds} rounds using ${source}`);
      if (!activeRooms.has(roomCode)) {
        console.log(`Room ${roomCode} not found, cannot start game`);
        socket.emit('error', {message: 'Room not found'});
        return;
      }

      const activeRoom = activeRooms.get(roomCode);

      // Vérifier que l'émetteur est bien l'hôte
      if (socket.userId !== activeRoom.hostId) {
        console.log(`User ${socket.userId} tried to start game but is not the host (${activeRoom.hostId})`);
        socket.emit('error', {message: 'Only the host can start the game'});
        return;
      }

      // Initialiser le jeu
      const gameRounds = rounds || DEFAULT_ROUNDS;
      activeRoom.status = 'playing';

      // Réinitialiser les scores
      activeRoom.players.forEach(p => {
        p.score = 0;
      });

      // Générer les questions
      const gameQuestions = getSampleQuestions(gameRounds);

      // Créer le jeu actif
      activeGames.set(roomCode, {
        currentRound: 0,
        totalRounds: gameRounds,
        questions: gameQuestions,
        correctAnswers: new Set(),
        timer: null,
        source: source || 'sample' // 'spotify', 'deezer' ou 'sample'
      });

      // Informer tous les joueurs que la partie commence
      io.to(roomCode).emit('gameStarted', {rounds: gameRounds});

      // Lancer le premier round après un court délai
      setTimeout(() => {
        startNextRound(roomCode);
      }, 2000);
    });

    // Fonction pour démarrer le round suivant
    function startNextRound(roomCode) {
      if (!activeRooms.has(roomCode) || !activeGames.has(roomCode)) {
        console.log(`Cannot start next round: room ${roomCode} or game not found`);
        return;
      }

      const activeRoom = activeRooms.get(roomCode);
      const activeGame = activeGames.get(roomCode);

      // Incrémenter le compteur de rounds
      activeGame.currentRound++;
      console.log(`Starting round ${activeGame.currentRound}/${activeGame.totalRounds} in room ${roomCode}`);

      // Vérifier si la partie est terminée
      if (activeGame.currentRound > activeGame.totalRounds) {
        console.log(`All rounds completed in room ${roomCode}, ending game`);
        endGame(roomCode);
        return;
      }

      // Obtenir la question pour ce round
      const question = activeGame.questions[activeGame.currentRound - 1];

      // Réinitialiser les réponses correctes pour ce round
      activeGame.correctAnswers = new Set();

      // Préparer la question à envoyer
      const roundQuestion = {
        ...question,
        id: `${question.id}-${activeGame.currentRound}`, // ID unique pour éviter les doublons
        round: activeGame.currentRound,
        totalRounds: activeGame.totalRounds
      };

      // Envoyer la nouvelle question à tous les joueurs
      io.to(roomCode).emit('newQuestion', roundQuestion);

      // Initialiser le temps de début de la question
      activeGame.questionStartTime = Date.now();

      // Démarrer le timer pour ce round
      activeGame.timer = setTimeout(() => {
        // Temps écoulé pour cette question
        console.log(`Time's up for question in round ${activeGame.currentRound} in room ${roomCode}`);
        io.to(roomCode).emit('questionTimeout', {
          correctAnswer: question.answer,
          round: activeGame.currentRound,
          totalRounds: activeGame.totalRounds
        });

        // Attendre un peu avant de passer au round suivant
        setTimeout(() => {
          // Envoyer les scores à la fin du round
          const scores = activeRoom.players.map(p => ({
            userId: p.userId,
            score: p.score,
            user: p.user
          })).sort((a, b) => b.score - a.score); // Trier par score décroissant

          io.to(roomCode).emit('roundEnd', {
            scores,
            nextRound: activeGame.currentRound < activeGame.totalRounds ?
                activeGame.currentRound + 1 : null
          });

          // Lancer le round suivant ou terminer la partie
          if (activeGame.currentRound < activeGame.totalRounds) {
            startNextRound(roomCode);
          } else {
            endGame(roomCode);
          }
        }, ROUND_TRANSITION_DELAY * 1000);
      }, QUESTION_DURATION * 1000);
    }

    // Fonction pour terminer une partie
    function endGame(roomCode) {
      if (!activeRooms.has(roomCode) || !activeGames.has(roomCode)) {
        console.log(`Cannot end game: room ${roomCode} or game not found`);
        return;
      }

      const activeRoom = activeRooms.get(roomCode);
      const activeGame = activeGames.get(roomCode);

      console.log(`Ending game in room ${roomCode}`);

      // Mettre à jour le statut de la salle
      activeRoom.status = 'finished';

      // Annuler tout timer en cours
      if (activeGame.timer) {
        clearTimeout(activeGame.timer);
      }

      // Obtenir les scores finaux
      const finalScores = activeRoom.players.map(p => ({
        userId: p.userId,
        score: p.score,
        user: p.user
      })).sort((a, b) => b.score - a.score); // Trier par score décroissant

      // Envoyer les résultats finaux à tous les joueurs
      io.to(roomCode).emit('gameEnded', {
        scores: finalScores,
        winner: finalScores.length > 0 ? finalScores[0] : null
      });

      // Sauvegarder les scores en base de données
      saveFinalScores(roomCode, finalScores);

      // Supprimer le jeu actif
      activeGames.delete(roomCode);
    }

    // Fonction pour sauvegarder les scores finaux
    async function saveFinalScores(roomCode, scores) {
      try {
        const activeRoom = activeRooms.get(roomCode);
        console.log(`Saving final scores for room ${roomCode}`);

        // Mise à jour des scores dans la base de données
        for (const player of scores) {
          await prisma.roomPlayer.updateMany({
            where: {
              roomId: activeRoom.id,
              userId: player.userId
            },
            data: {
              score: player.score
            }
          });
        }
        console.log(`Scores saved for ${scores.length} players`);
      } catch (error) {
        console.error('Error saving scores:', error);
      }
    }

    // Soumettre une réponse
    socket.on('submitAnswer', ({roomCode, userId, answer, questionId}) => {
      console.log(`User ${userId} submitted answer "${answer}" in room ${roomCode}`);
      if (!activeRooms.has(roomCode) || !activeGames.has(roomCode)) {
        console.log(`Room ${roomCode} or game not found for answer submission`);
        return;
      }

      const activeRoom = activeRooms.get(roomCode);
      const activeGame = activeGames.get(roomCode);

      // Vérifier si le joueur a déjà répondu correctement
      if (activeGame.correctAnswers.has(userId)) {
        console.log(`User ${userId} already answered correctly`);
        return;
      }

      // Obtenir la question actuelle
      const currentQuestion = activeGame.questions[activeGame.currentRound - 1];

      // Vérifier si la réponse est correcte
      const isCorrect = checkAnswer(answer, currentQuestion.answer);
      console.log(`Answer is ${isCorrect ? 'correct' : 'incorrect'}, correct answer: ${currentQuestion.answer}`);

      if (isCorrect) {
        // Marquer que ce joueur a répondu correctement
        activeGame.correctAnswers.add(userId);

        // Calculer les points (plus vite = plus de points)
        const timeLeft = QUESTION_DURATION -
            Math.min(QUESTION_DURATION, Math.floor((Date.now() - activeGame.questionStartTime) / 1000));
        const timeBonus = Math.max(0, Math.floor(timeLeft / 5)); // 1 point tous les 5 secondes restantes
        const points = 10 + timeBonus; // Score de base + bonus de temps

        console.log(`User ${userId} awarded ${points} points (${timeBonus} time bonus)`);

        // Mettre à jour le score du joueur
        const player = activeRoom.players.find(p => p.userId === userId);
        if (player) {
          player.score += points;
        }

        // Informer le joueur de sa réponse correcte
        const playerSocketId = activeConnections.get(userId);
        if (playerSocketId) {
          io.to(playerSocketId).emit('answerResult', {
            correct: true,
            points: points,
            timeBonus: timeBonus,
            answer: currentQuestion.answer
          });
        }

        // Informer les autres joueurs qu'un joueur a trouvé la réponse
        socket.to(roomCode).emit('playerCorrect', {
          userId: userId,
          user: player?.user
        });

        // Ajouter un message système
        io.to(roomCode).emit('message', {
          system: true,
          message: `${player?.user?.pseudo || 'Un joueur'} a trouvé la bonne réponse !`
        });

        // Si tous les joueurs ont répondu correctement, passer au round suivant
        if (activeGame.correctAnswers.size === activeRoom.players.length) {
          console.log(`All players answered correctly, ending round early`);
          clearTimeout(activeGame.timer);

          // Envoyer les scores à la fin du round
          const scores = activeRoom.players.map(p => ({
            userId: p.userId,
            score: p.score,
            user: p.user
          })).sort((a, b) => b.score - a.score);

          io.to(roomCode).emit('roundEnd', {
            scores,
            nextRound: activeGame.currentRound < activeGame.totalRounds ?
                activeGame.currentRound + 1 : null
          });

          // Attendre un peu avant de passer au round suivant
          setTimeout(() => {
            if (activeGame.currentRound < activeGame.totalRounds) {
              startNextRound(roomCode);
            } else {
              endGame(roomCode);
            }
          }, ROUND_TRANSITION_DELAY * 1000);
        }
      } else {
        // Informer le joueur de sa réponse incorrecte
        socket.emit('answerResult', {
          correct: false,
          answer: null // Ne pas révéler la réponse pour laisser les autres joueurs deviner
        });
      }
    });

    // Envoyer un message dans le chat
    socket.on('sendMessage', ({roomCode, user, message}) => {
      console.log(`Message received from ${user.id} in room ${roomCode}: ${message}`);

      if (!activeRooms.has(roomCode)) {
        console.error(`Room ${roomCode} not found for message`);
        return;
      }

      // Vérifier que le message n'est pas vide
      if (!message || !message.trim()) {
        console.warn('Empty message ignored');
        return;
      }

      const messageObject = {
        user: {
          id: user.id,
          pseudo: user.pseudo || user.name,
          image: user.image
        },
        message: message.trim(),
        timestamp: Date.now()
      };

      console.log(`Sending message to room ${roomCode}: ${JSON.stringify(messageObject)}`);

      // Envoyer le message à tous les joueurs dans la salle
      io.to(roomCode).emit('message', messageObject);
    });

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

      // Trouver toutes les salles où ce socket est présent
      for (const [roomCode, room] of activeRooms.entries()) {
        const playerIndex = room.players.findIndex(p => p.userId === socket.userId);

        if (playerIndex !== -1) {
          console.log(`Found player in room ${roomCode}, handling disconnect`);
          // Quitter cette salle
          const player = room.players[playerIndex];

          // Supprimer le joueur de la salle active
          room.players.splice(playerIndex, 1);

          // Informer les autres joueurs
          io.to(roomCode).emit('playerLeft', player.userId);

          // Ajouter un message système
          io.to(roomCode).emit('message', {
            system: true,
            message: `${player.user?.pseudo || 'Un joueur'} a quitté la partie.`
          });

          // Si plus aucun joueur, supprimer la salle
          if (room.players.length === 0) {
            console.log(`No players left in room ${roomCode}, removing room`);
            activeRooms.delete(roomCode);

            // Si un jeu est en cours, le supprimer aussi
            if (activeGames.has(roomCode)) {
              clearTimeout(activeGames.get(roomCode).timer);
              activeGames.delete(roomCode);
            }
          }
          // Si l'hôte quitte, transférer l'hôte au joueur suivant
          else if (player.userId === room.hostId && room.players.length > 0) {
            console.log(`Host has left, transferring host role to ${room.players[0].user?.pseudo || room.players[0].userId}`);
            room.hostId = room.players[0].userId;

            // Informer les joueurs du changement d'hôte
            io.to(roomCode).emit('hostChanged', room.hostId);

            // Ajouter un message système
            io.to(roomCode).emit('message', {
              system: true,
              message: `${room.players[0].user?.pseudo || 'Un joueur'} est maintenant l'hôte.`
            });
          }
        }
      }
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
  httpServer.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
    console.log('> Socket.IO server is running');
  });
});