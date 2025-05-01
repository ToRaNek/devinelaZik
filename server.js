// server.js
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const {
  getUserTopTracks,
  getUserSavedTracks,
  getRecentlyPlayedTracks,
  getUserTopArtists,
  getArtistAlbums,
  getUserPlaylists,
  getPlaylistTracks
} = require('./lib/spotifyPlayDL');
const { generateMultipleChoiceQuestions, generateFreeTextQuestions } = require('./lib/enhancedSpotifyUtils');

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

/**
 * Génère des questions à partir de toutes les sources disponibles
 * @param {string} userId - ID de l'utilisateur
 * @param {number} count - Nombre de questions à générer
 * @param {string} quizType - Type de quiz: 'multiple_choice' ou 'free_text'
 * @returns {Promise<Array>} - Questions générées
 */
async function generateQuestionsFromAllSources(userId, count = 10, quizType = 'multiple_choice') {
  try {
    console.log(`Génération de ${count} questions à partir des données Spotify pour l'utilisateur ${userId}`);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          where: {
            provider: { in: ['spotify'] }
          }
        }
      }
    });

    if (!user || !user.accounts || user.accounts.length === 0) {
      console.log('Aucun compte Spotify lié trouvé pour cet utilisateur');
      throw new Error('Utilisateur sans compte Spotify');
    }

    // Collecter les données de Spotify
    let allTracks = [];
    let allArtists = [];
    let allAlbums = [];

    // 1. Récupérer les titres préférés (court, moyen et long terme)
    try {
      // Court terme (4 semaines)
      const shortTermTracks = await getUserTopTracks(userId, 'short_term', 50);
      if (shortTermTracks && shortTermTracks.length > 0) {
        allTracks = [...allTracks, ...shortTermTracks];
        console.log(`Ajout de ${shortTermTracks.length} titres préférés (court terme)`);
      }

      // Moyen terme (6 mois)
      const mediumTermTracks = await getUserTopTracks(userId, 'medium_term', 50);
      if (mediumTermTracks && mediumTermTracks.length > 0) {
        // Éviter les doublons en vérifiant les IDs
        const newTracks = mediumTermTracks.filter(track =>
            !allTracks.some(t => t.id === track.id)
        );
        allTracks = [...allTracks, ...newTracks];
        console.log(`Ajout de ${newTracks.length} titres préférés (moyen terme)`);
      }

      // Long terme (plusieurs années)
      const longTermTracks = await getUserTopTracks(userId, 'long_term', 50);
      if (longTermTracks && longTermTracks.length > 0) {
        // Éviter les doublons
        const newTracks = longTermTracks.filter(track =>
            !allTracks.some(t => t.id === track.id)
        );
        allTracks = [...allTracks, ...newTracks];
        console.log(`Ajout de ${newTracks.length} titres préférés (long terme)`);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des titres préférés:", error);
    }

    // 2. Récupérer les titres sauvegardés (likés)
    try {
      const savedTracks = await getUserSavedTracks(userId, 50);
      if (savedTracks && savedTracks.length > 0) {
        // Éviter les doublons
        const newTracks = savedTracks.filter(track =>
            !allTracks.some(t => t.id === track.id)
        );
        allTracks = [...allTracks, ...newTracks];
        console.log(`Ajout de ${newTracks.length} titres sauvegardés`);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des titres sauvegardés:", error);
    }

    // 3. Récupérer l'historique d'écoute récent
    try {
      const recentTracks = await getRecentlyPlayedTracks(userId, 50);
      if (recentTracks && recentTracks.length > 0) {
        // Éviter les doublons
        const newTracks = recentTracks.filter(track =>
            !allTracks.some(t => t.id === track.id)
        );
        allTracks = [...allTracks, ...newTracks];
        console.log(`Ajout de ${newTracks.length} titres récemment écoutés`);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération de l'historique d'écoute:", error);
    }

    // 4. Récupérer les playlists et leurs titres
    try {
      const playlists = await getUserPlaylists(userId, 10);
      if (playlists && playlists.length > 0) {
        // Prendre les 5 premières playlists maximum pour éviter de surcharger l'API
        const limitedPlaylists = playlists.slice(0, 5);

        for (const playlist of limitedPlaylists) {
          try {
            const playlistTracks = await getPlaylistTracks(playlist.id, userId, 30);
            if (playlistTracks && playlistTracks.length > 0) {
              // Éviter les doublons
              const newTracks = playlistTracks.filter(track =>
                  track && !allTracks.some(t => t.id === track.id)
              );
              allTracks = [...allTracks, ...newTracks];
              console.log(`Ajout de ${newTracks.length} titres de la playlist "${playlist.name}"`);
            }
          } catch (playlistError) {
            console.error(`Erreur lors de la récupération des titres de la playlist ${playlist.name}:`, playlistError);
            continue;
          }
        }
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des playlists:", error);
    }

    // 5. Récupérer les artistes préférés
    try {
      // Court terme
      const shortTermArtists = await getUserTopArtists(userId, 'short_term', 50);
      if (shortTermArtists && shortTermArtists.length > 0) {
        allArtists = [...allArtists, ...shortTermArtists];
        console.log(`Ajout de ${shortTermArtists.length} artistes préférés (court terme)`);
      }

      // Moyen terme
      const mediumTermArtists = await getUserTopArtists(userId, 'medium_term', 50);
      if (mediumTermArtists && mediumTermArtists.length > 0) {
        // Éviter les doublons
        const newArtists = mediumTermArtists.filter(artist =>
            !allArtists.some(a => a.id === artist.id)
        );
        allArtists = [...allArtists, ...newArtists];
        console.log(`Ajout de ${newArtists.length} artistes préférés (moyen terme)`);
      }

      // Long terme
      const longTermArtists = await getUserTopArtists(userId, 'long_term', 50);
      if (longTermArtists && longTermArtists.length > 0) {
        // Éviter les doublons
        const newArtists = longTermArtists.filter(artist =>
            !allArtists.some(a => a.id === artist.id)
        );
        allArtists = [...allArtists, ...newArtists];
        console.log(`Ajout de ${newArtists.length} artistes préférés (long terme)`);
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des artistes préférés:", error);
    }

    // 6. Récupérer les albums des artistes préférés
    try {
      // Limiter à 10 artistes pour éviter de surcharger l'API
      const limitedArtists = allArtists.slice(0, 10);

      for (const artist of limitedArtists) {
        try {
          const artistAlbums = await getArtistAlbums(artist.id, userId);
          if (artistAlbums && artistAlbums.length > 0) {
            // Éviter les doublons
            const newAlbums = artistAlbums.filter(album =>
                !allAlbums.some(a => a.id === album.id)
            );
            allAlbums = [...allAlbums, ...newAlbums];
            console.log(`Ajout de ${newAlbums.length} albums de ${artist.name}`);
          }
        } catch (albumError) {
          console.error(`Erreur lors de la récupération des albums de ${artist.name}:`, albumError);
          continue;
        }
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des albums:", error);
    }

    // 7. Extraire les albums des pistes
    const trackAlbums = allTracks.map(track => track.album)
        .filter((album, index, self) =>
            index === self.findIndex(a => a.id === album.id)
        );

    // Ajouter les albums extraits des pistes (s'ils ne sont pas déjà présents)
    const newTrackAlbums = trackAlbums.filter(album =>
        !allAlbums.some(a => a.id === album.id)
    );

    allAlbums = [...allAlbums, ...newTrackAlbums];
    console.log(`Ajout de ${newTrackAlbums.length} albums extraits des pistes`);

    console.log(`Données collectées: ${allTracks.length} pistes, ${allArtists.length} artistes, ${allAlbums.length} albums`);

    // 8. Vérifier qu'il y a suffisamment de données
    if (allTracks.length < 5 && allArtists.length < 5) {
      console.error("Pas assez de données Spotify pour générer des questions");
      throw new Error("Données Spotify insuffisantes");
    }

    // 9. Compte le nombre de pistes avec prévisualisation
    const tracksWithPreview = allTracks.filter(track => track.preview_url);
    console.log(`Pistes avec prévisualisation: ${tracksWithPreview.length}/${allTracks.length}`);

    // 10. Générer les questions selon le type de quiz
    let questions = [];
    if (quizType === 'multiple_choice') {
      questions = generateMultipleChoiceQuestions(allTracks, allArtists, allAlbums, count);
    } else {
      questions = generateFreeTextQuestions(allTracks, allArtists, allAlbums, count);
    }

    // 11. Éliminer les doublons potentiels
    questions = removeDuplicateQuestions(questions);

    console.log(`${questions.length} questions générées avec succès`);
    console.log(`Dont ${questions.filter(q => q.type === 'song').length} questions de type "song"`);
    console.log(`Dont ${questions.filter(q => q.previewUrl).length} questions avec prévisualisation audio`);

    // 12. S'assurer d'avoir suffisamment de questions
    if (questions.length < count) {
      console.warn(`Seulement ${questions.length}/${count} questions générées, ajustement nécessaire`);

      // Si nous n'avons pas assez de questions, nous pouvons adapter en:
      // 1. Réutilisant certaines questions (avec variations si possible)
      // 2. Généralement génère moins de questions au total

      // Dans ce cas, nous réduisons simplement le nombre de questions
      console.log(`Le jeu sera plus court: ${questions.length} questions au lieu de ${count}`);
    }

    return questions;
  } catch (error) {
    console.error('Erreur lors de la génération des questions:', error);
    throw error;
  }
}

// Lancement de l'application
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
        console.log(`Démarrage de partie demandé dans la salle ${data.roomCode} par ${socket.userId}`);
        const roomData = activeRooms.get(data.roomCode);

        // Verify host
        if (!roomData || roomData.hostId !== socket.userId) {
          console.log('Not host, cannot start game');
          socket.emit('error', { message: 'Only the host can start the game' });
          return;
        }

        // Generate questions using data from Spotify
        let questions = [];
        try {
          console.log(`Generating questions for user ${socket.userId}`);

          // Générer des questions à partir des données Spotify
          questions = await generateQuestionsFromAllSources(socket.userId, data.rounds || 10, data.quizType || 'multiple_choice');

          console.log(`Generated ${questions.length} questions`);
        } catch (error) {
          console.error('Error generating questions:', error);
          socket.emit('error', { message: `Failed to generate questions: ${error.message}` });
          return;
        }

        // Store game data
        const gameData = {
          roomCode: data.roomCode,
          status: 'playing',
          hostId: socket.userId,
          currentRound: 0,
          totalRounds: questions.length,
          questions: questions,
          quizType: data.quizType || 'multiple_choice',
          scores: roomData.players.map(player => ({
            userId: player.userId,
            user: player.user,
            score: 0
          })),
          startTime: Date.now(),
          // Initialiser la liste des joueurs ayant répondu
          playersAnswered: new Set()
        };

        activeGames.set(data.roomCode, gameData);

        // Update room status
        roomData.status = 'playing';

        // Inform clients that game is starting
        io.to(data.roomCode).emit('gameStarted', {
          rounds: questions.length,
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