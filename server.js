// server.js
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const { generateEnhancedQuestions } = require('./lib/enhancedSpotifyUtils');

const prisma = new PrismaClient();
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store active data in memory
const activeRooms = new Map();
const activeGames = new Map();
const activeConnections = new Map();

// Fonction utilitaire pour mélanger un tableau
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Fonction pour éliminer les questions redondantes
function removeDuplicateQuestions(questions) {
  // Garder trace des artistes et titres déjà utilisés
  const seenArtists = new Set();
  const seenSongs = new Set();
  const seenAlbums = new Set();

  // Normaliser une chaîne pour comparaison
  const normalize = (str) => {
    return str.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, '')
        .trim();
  };

  // Filtrer les questions pour éviter trop de redondances
  return questions.filter(question => {
    const artistKey = normalize(question.artistName);

    // Pour les questions de type "artiste"
    if (question.type === 'artist') {
      // Limiter le nombre de questions par artiste
      if (seenArtists.has(artistKey)) {
        return false; // Éviter la répétition du même artiste
      }
      seenArtists.add(artistKey);
      return true;
    }

    // Pour les questions de type "chanson"
    else if (question.type === 'song') {
      const songKey = normalize(question.answer);
      const combinedKey = `${artistKey}-${songKey}`;

      if (seenSongs.has(combinedKey)) {
        return false; // Éviter la répétition de la même chanson
      }

      // Limiter le nombre de chansons par artiste
      let artistSongCount = 0;
      seenSongs.forEach(key => {
        if (key.startsWith(artistKey + '-')) {
          artistSongCount++;
        }
      });

      // Maximum 2 chansons par artiste
      if (artistSongCount >= 2) {
        return false;
      }

      seenSongs.add(combinedKey);
      return true;
    }

    // Pour les questions de type "album"
    else if (question.type === 'album') {
      const albumKey = normalize(question.answer);
      const combinedKey = `${artistKey}-${albumKey}`;

      if (seenAlbums.has(combinedKey)) {
        return false; // Éviter la répétition du même album
      }

      // Limiter le nombre d'albums par artiste
      let artistAlbumCount = 0;
      seenAlbums.forEach(key => {
        if (key.startsWith(artistKey + '-')) {
          artistAlbumCount++;
        }
      });

      // Maximum 2 albums par artiste
      if (artistAlbumCount >= 2) {
        return false;
      }

      seenAlbums.add(combinedKey);
      return true;
    }

    // Pour les autres types de questions
    return true;
  });
}

// Fonction pour générer des questions à partir de toutes les sources
async function generateQuestionsFromAllSources(userId, count = 10, quizType = 'multiple_choice') {
  try {
    console.log(`Génération de ${count} questions à partir de toutes les sources pour l'utilisateur ${userId}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: {
            provider: { in: ['spotify', 'deezer'] }
          }
        }
      }
    });

    if (!user || !user.accounts || user.accounts.length === 0) {
      console.error('Aucun compte de musique lié trouvé pour cet utilisateur');
      return getSampleQuestions(count, quizType);
    }

    // Collecter des questions de toutes les sources disponibles
    let allQuestions = [];

    // 1. Pour chaque compte connecté, récupérer des questions
    for (const account of user.accounts) {
      let sourceQuestions = [];

      if (account.provider === 'spotify') {
        // Utiliser la fonction existante pour Spotify
        sourceQuestions = await generateEnhancedQuestions(userId, count * 2, quizType);
      } else if (account.provider === 'deezer') {
        // Pour Deezer - ajouter implémentation si disponible
        // sourceQuestions = await generateDeezerQuestions(userId, count * 2, quizType);
        // Pour l'instant, utiliser des exemples
        sourceQuestions = getSampleQuestions(Math.floor(count / 2), quizType);
      }

      // Ajouter les questions à notre pool global
      allQuestions = [...allQuestions, ...sourceQuestions];
    }

    // S'il n'y a pas assez de questions, compléter avec des exemples
    if (allQuestions.length < count) {
      const sampleQuestions = getSampleQuestions(count - allQuestions.length, quizType);
      allQuestions = [...allQuestions, ...sampleQuestions];
    }

    // Éliminer les doublons potentiels
    const uniqueQuestions = removeDuplicateQuestions(allQuestions);

    // Prioritiser les questions avec des extraits audio
    const questionsWithPreview = uniqueQuestions.filter(q => q.previewUrl);
    const questionsWithoutPreview = uniqueQuestions.filter(q => !q.previewUrl);

    // Mélanger les deux groupes séparément
    const shuffledWithPreview = shuffleArray(questionsWithPreview);
    const shuffledWithoutPreview = shuffleArray(questionsWithoutPreview);

    // Prendre d'abord les questions avec extraits audio, puis compléter avec celles sans
    let selectedQuestions = [...shuffledWithPreview];
    if (selectedQuestions.length < count) {
      selectedQuestions = [...selectedQuestions, ...shuffledWithoutPreview.slice(0, count - selectedQuestions.length)];
    } else {
      selectedQuestions = selectedQuestions.slice(0, count);
    }

    // Réinitialiser les numéros de round
    const finalQuestions = selectedQuestions.map((q, index) => ({
      ...q,
      round: index + 1
    }));

    console.log(`${finalQuestions.length} questions générées avec succès à partir de toutes les sources`);
    console.log(`Dont ${finalQuestions.filter(q => q.type === 'song').length} questions de type "song"`);
    return finalQuestions;
  } catch (error) {
    console.error('Erreur lors de la génération des questions:', error);
    return getSampleQuestions(count, quizType);
  }
}

// Function to get sample questions if other methods fail
function getSampleQuestions(count, quizType = 'multiple_choice') {
  const questions = [
    {
      type: 'artist',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
      answer: 'Daft Punk',
      artistName: 'Daft Punk',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
      question: "Qui est l'artiste de ce morceau ?"
    },
    {
      type: 'song',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
      answer: 'Bohemian Rhapsody',
      artistName: 'Queen',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e',
      question: "Quel est ce titre de Queen ?"
    },
    {
      type: 'album',
      quizType: quizType,
      answer: 'Thriller',
      artistName: 'Michael Jackson',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2734121faee8df82c526cbab2be',
      question: "Quel est cet album de Michael Jackson ?"
    },
    {
      type: 'artist',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
      answer: 'Billie Eilish',
      artistName: 'Billie Eilish',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e',
      question: "Quel est le nom de cet artiste ?"
    },
    {
      type: 'song',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/452de87e6104ded50e674050d56c7269336a3fe9',
      answer: 'Blinding Lights',
      artistName: 'The Weeknd',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b27348a42a53ea8e0d9e98423a6d',
      question: "Quel est ce titre de The Weeknd ?"
    },
    {
      type: 'album',
      quizType: quizType,
      answer: 'The Dark Side of the Moon',
      artistName: 'Pink Floyd',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe',
      question: "Quel est cet album de Pink Floyd ?"
    },
    {
      type: 'artist',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/77a5b67f66c1f18353ea5afc6e8628c145267d4a',
      answer: 'Kendrick Lamar',
      artistName: 'Kendrick Lamar',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2732e8ed79e177ff6011076f5f0',
      question: "Quel est le nom de cet artiste ?"
    },
    {
      type: 'song',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/7df27a9a6ac1d6c8767b61b38dc37ba5cfa3f19c',
      answer: 'Imagine',
      artistName: 'John Lennon',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2736750daf5f4576e3c25d5c7aa',
      question: "Quel est ce titre de John Lennon ?"
    },
    {
      type: 'album',
      quizType: quizType,
      answer: 'Nevermind',
      artistName: 'Nirvana',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b27336c5417732e53e23cb219246',
      question: "Quel est cet album de Nirvana ?"
    },
    {
      type: 'artist',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/8de4f9d9671c42e7e6f3ecf0edcba3f08d5593f2',
      answer: 'Taylor Swift',
      artistName: 'Taylor Swift',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273e0b64c8be3c4e804abcb2696',
      question: "Quel est le nom de cet artiste ?"
    },
    {
      type: 'song',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
      answer: 'Get Lucky',
      artistName: 'Daft Punk',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
      question: "Quel est ce titre de Daft Punk ?"
    },
    {
      type: 'album',
      quizType: quizType,
      answer: 'Abbey Road',
      artistName: 'The Beatles',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25',
      question: "Quel est cet album des Beatles ?"
    },
    {
      type: 'artist',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
      answer: 'Queen',
      artistName: 'Queen',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e',
      question: "Qui est l'artiste de ce morceau ?"
    },
    {
      type: 'song',
      quizType: quizType,
      previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
      answer: 'Bad Guy',
      artistName: 'Billie Eilish',
      albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e',
      question: "Quel est ce titre de Billie Eilish ?"
    }
  ];

  // Séparer et prioriser les questions de type "song" avec previewUrl
  const songQuestionsWithPreview = questions.filter(q => q.type === 'song' && q.previewUrl);
  const otherQuestions = questions.filter(q => !(q.type === 'song' && q.previewUrl));

  // S'assurer que 70% des questions sont des chansons avec preview si possible
  const targetSongCount = Math.min(Math.ceil(count * 0.7), songQuestionsWithPreview.length);
  const targetOtherCount = count - targetSongCount;

  // Mélanger les deux groupes
  const shuffledSongs = shuffleArray(songQuestionsWithPreview).slice(0, targetSongCount);
  const shuffledOthers = shuffleArray(otherQuestions).slice(0, targetOtherCount);

  // Combiner et remélanger
  let finalQuestions = [...shuffledSongs, ...shuffledOthers];
  finalQuestions = shuffleArray(finalQuestions);

  if (quizType === 'multiple_choice') {
    // Ajouter des options pour les questions à choix multiples
    finalQuestions.forEach(q => {
      // Générer des options en incluant la bonne réponse
      let allOptions = [q.answer];

      // Ajouter des options incorrectes selon le type de question
      if (q.type === 'artist') {
        const artistOptions = ['Daft Punk', 'Queen', 'Michael Jackson', 'Billie Eilish',
          'The Weeknd', 'Kendrick Lamar', 'John Lennon', 'Nirvana',
          'Taylor Swift', 'The Beatles', 'Radiohead', 'Adele']
            .filter(a => a !== q.answer);

        // Sélectionner 3 options aléatoires
        allOptions = [...allOptions, ...shuffleArray(artistOptions).slice(0, 3)];
      }
      else if (q.type === 'song') {
        const songOptions = ['Bohemian Rhapsody', 'Blinding Lights', 'Imagine', 'Bad Guy',
          'Get Lucky', 'Thriller', 'Smells Like Teen Spirit', 'Shake It Off',
          'Yesterday', 'Creep', 'Hello', 'Billie Jean']
            .filter(s => s !== q.answer);

        allOptions = [...allOptions, ...shuffleArray(songOptions).slice(0, 3)];
      }
      else if (q.type === 'album') {
        const albumOptions = ['Thriller', 'The Dark Side of the Moon', 'Nevermind', 'Abbey Road',
          'Random Access Memories', 'A Night at the Opera', 'When We All Fall Asleep...',
          'After Hours', 'To Pimp a Butterfly', 'Imagine', 'Let It Be', '25']
            .filter(a => a !== q.answer);

        allOptions = [...allOptions, ...shuffleArray(albumOptions).slice(0, 3)];
      }

      // Mélanger les options
      q.options = shuffleArray(allOptions);
    });
  }

  // Numéroter les questions
  return finalQuestions.map((q, index) => ({
    ...q,
    id: `sample-${Date.now()}-${index}`,
    round: index + 1
  }));
}

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

        // SUPPRIMÉ: Ne plus ajouter de message quand un joueur rejoint
        // Message système
        // io.to(data.roomCode).emit('message', {
        //   system: true,
        //   message: `${data.user?.pseudo || 'Un joueur'} a rejoint la partie!`,
        //   timestamp: Date.now()
        // });
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

        // Generate questions using all sources
        let questions = [];
        try {
          // Utiliser la nouvelle fonction qui combine toutes les sources
          console.log(`Generating questions from all sources for user ${socket.userId} with quiz type ${data.quizType || 'multiple_choice'}`);
          questions = await generateQuestionsFromAllSources(
              socket.userId,
              data.rounds || 10,
              data.quizType || 'multiple_choice'
          );

          console.log(`Generated ${questions.length} questions of type ${data.quizType || 'multiple_choice'}`);
        } catch (error) {
          console.error('Error generating questions:', error);
          // Fallback to sample questions
          questions = getSampleQuestions(data.rounds || 10, data.quizType || 'multiple_choice');
        }

        // Si aucune question n'a été générée, loguer erreur et notifier l'utilisateur
        if (questions.length === 0) {
          console.error('Failed to generate any questions');
          socket.emit('error', { message: 'Impossible de générer des questions. Veuillez réessayer.' });
          return;
        }

        // Store game data
        const gameData = {
          roomCode: data.roomCode,
          status: 'playing',
          hostId: socket.userId,
          currentRound: 0,
          totalRounds: data.rounds || 10,
          questions: questions,
          quizType: data.quizType || 'multiple_choice',
          scores: roomData.players.map(player => ({
            userId: player.userId,
            user: player.user,
            score: 0
          })),
          startTime: Date.now(),
          playersAnswered: new Set() // Initialiser la liste des joueurs ayant répondu
        };

        activeGames.set(data.roomCode, gameData);

        // Update room status
        roomData.status = 'playing';

        // Inform clients that game is starting
        io.to(data.roomCode).emit('gameStarted', {
          rounds: data.rounds || 10,
          quizType: data.quizType || 'multiple_choice',
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

        // Si le joueur a déjà répondu, ignorer
        if (gameData.playersAnswered.has(userId)) {
          console.log(`Player ${userId} already answered this question`);
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

        // Marquer ce joueur comme ayant répondu
        gameData.playersAnswered.add(userId);

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
        } else {
          // Incorrect answer - montrer immédiatement la bonne réponse
          socket.emit('answerResult', {
            correct: false,
            points: 0,
            answer: currentQuestion.answer // Envoyer la bonne réponse immédiatement
          });
        }

        // Vérifier si tous les joueurs ont répondu
        const playersInRoom = activeRooms.get(roomCode)?.players || [];
        const totalPlayers = playersInRoom.length;

        if (gameData.playersAnswered.size >= totalPlayers) {
          // Tous les joueurs ont répondu, passer à la question suivante
          console.log(`Tous les joueurs ont répondu à la question ${currentQuestion.id}`);

          // Annuler le timer existant
          clearTimeout(gameData.questionTimer);

          // Passer à la question suivante après un court délai
          setTimeout(() => {
            // Envoyer les scores actuels
            io.to(roomCode).emit('roundEnd', {
              round: gameData.currentRound,
              nextRound: gameData.currentRound < gameData.totalRounds ? gameData.currentRound + 1 : null,
              scores: gameData.scores.sort((a, b) => b.score - a.score),
              isLastRound: gameData.currentRound >= gameData.totalRounds
            });

            // Passer à la question suivante si ce n'est pas la dernière
            if (gameData.currentRound < gameData.totalRounds) {
              setTimeout(() => {
                sendNextQuestion(roomCode, io);
              }, 3000);
            } else {
              endGame(roomCode, io);
            }
          }, 3000);
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

    // Réinitialiser la liste des joueurs ayant répondu
    gameData.playersAnswered = new Set();

    console.log(`Sending question for round ${gameData.currentRound}/${gameData.totalRounds} to room ${roomCode}`);

    // Clone the question and remove the answer
    const questionForClient = { ...currentQuestion };
    // Don't delete the answer for free text questions as it's needed for autocomplete
    if (gameData.quizType === 'multiple_choice') {
      delete questionForClient.answer; // Don't send the answer to clients in multiple choice mode
    }

    // Send question to all clients
    io.to(roomCode).emit('newQuestion', questionForClient);

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