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
const { findAudioPreviewUrl } = require('./lib/youtubeUtils');

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
    let tracks = [];
    let allArtists = [];
    let allAlbums = [];

    // 1. Récupérer les titres préférés (court, moyen et long terme)
    try {
      // Court terme (4 semaines)
      const shortTermTracks = await getUserTopTracks(userId, 'short_term', 50);
      if (shortTermTracks && shortTermTracks.length > 0) {
        tracks = [...tracks, ...shortTermTracks];
        console.log(`Ajout de ${shortTermTracks.length} titres préférés (court terme)`);
      }

      // Moyen terme (6 mois)
      const mediumTermTracks = await getUserTopTracks(userId, 'medium_term', 50);
      if (mediumTermTracks && mediumTermTracks.length > 0) {
        // Éviter les doublons en vérifiant les IDs
        const newTracks = mediumTermTracks.filter(track =>
            !tracks.some(t => t.id === track.id)
        );
        tracks = [...tracks, ...newTracks];
        console.log(`Ajout de ${newTracks.length} titres préférés (moyen terme)`);
      }

      // Long terme (plusieurs années)
      const longTermTracks = await getUserTopTracks(userId, 'long_term', 50);
      if (longTermTracks && longTermTracks.length > 0) {
        // Éviter les doublons
        const newTracks = longTermTracks.filter(track =>
            !tracks.some(t => t.id === track.id)
        );
        tracks = [...tracks, ...newTracks];
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
            !tracks.some(t => t.id === track.id)
        );
        tracks = [...tracks, ...newTracks];
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
            !tracks.some(t => t.id === track.id)
        );
        tracks = [...tracks, ...newTracks];
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
                  track && !tracks.some(t => t.id === track.id)
              );
              tracks = [...tracks, ...newTracks];
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
    const trackAlbums = tracks.map(track => track.album)
        .filter((album, index, self) =>
            index === self.findIndex(a => a.id === album.id)
        );

    // Ajouter les albums extraits des pistes (s'ils ne sont pas déjà présents)
    const newTrackAlbums = trackAlbums.filter(album =>
        !allAlbums.some(a => a.id === album.id)
    );

    allAlbums = [...allAlbums, ...newTrackAlbums];
    console.log(`Ajout de ${newTrackAlbums.length} albums extraits des pistes`);

    console.log(`Données collectées: ${tracks.length} pistes, ${allArtists.length} artistes, ${allAlbums.length} albums`);

    // 8. Vérifier qu'il y a suffisamment de données
    if (tracks.length < 5 && allArtists.length < 5) {
      console.error("Pas assez de données Spotify pour générer des questions");
      throw new Error("Données Spotify insuffisantes");
    }

    // 9. Compte le nombre de pistes avec prévisualisation
    const tracksWithPreview = tracks.filter(track => track.preview_url);
    console.log(`Pistes avec prévisualisation: ${tracksWithPreview.length}/${tracks.length}`);

    // 10. Générer les questions selon le type de quiz
    let questions = [];
    if (quizType === 'multiple_choice') {
      questions = generateMultipleChoiceQuestions(tracks, allArtists, allAlbums, count);
    } else {
      questions = generateFreeTextQuestions(tracks, allArtists, allAlbums, count);
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
    forcePolling: true,
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
    // server.js - Updated startGame logic
    // Add this to the top of server.js after existing requires


// Replace the existing startGame event handler in server.js with this improved version
    // Modification pour server.js - Remplacer la section de startGame qui gère la collecte des données

    socket.on('startGame', async (data) => {
      try {
        const count    = data.rounds   || 10;
        const quizType = data.quizType || 'multiple_choice';
        const source   = data.source   || 'all';
        const selectedPlaylists = data.selectedPlaylists  || [];

        console.log(`Démarrage de partie demandé dans la salle ${data.roomCode} par ${socket.userId}`);
        const roomData = activeRooms.get(data.roomCode);

        // Verify host
        if (!roomData || roomData.hostId !== socket.userId) {
          console.log('Not host, cannot start game');
          socket.emit('error', { message: 'Only the host can start the game' });
          return;
        }

        // Notify all clients that game preparation has started
        io.to(data.roomCode).emit('gameStarting', {
          message: "Préparation de la partie en cours...",
          timestamp: Date.now()
        });

        // Collect music data from ALL players in the room
        console.log(`Collecting music data from ${roomData.players.length} players`);

        // Track unique songs to avoid duplicates
        const uniqueTrackIds = new Set();
        let allTracks = [];
        let allArtists = [];
        let allAlbums = [];

        // Amélioration: Traquer les statistiques de contribution pour le logging
        const playerContributions = {};

        // Process each player's data - Using Promise.all for parallel processing
        const playerPromises = roomData.players.map(async (player) => {
          try {
            // Initialize contribution counter
            playerContributions[player.userId] = {
              tracks: 0,
              artists: 0,
              albums: 0,
              name: player.user.pseudo || 'Joueur'
            };

            // Notify about progress
            io.to(data.roomCode).emit('gamePreparationUpdate', {
              message: `Chargement des données musicales de ${player.user.pseudo || 'Joueur'}...`,
              timestamp: Date.now()
            });

            // Get favorite tracks from this player - with better error handling
            let playerData = { tracks: [], artists: [], albums: [] };
            try {
              // Wrap each API call in try/catch to prevent one failure from blocking everything
              try {
                const tracks = await getUserTopTracks(player.userId) || [];
                playerData.tracks.push(...tracks);
                console.log(`Got ${tracks.length} top tracks from ${player.user.pseudo}`);
              } catch (e) {
                console.error(`Failed to get top tracks for ${player.user.pseudo}:`, e.message);
              }

              let playerTracks = [];
              if (source === 'top') {
                playerTracks = await getUserTopTracks(player.userId);
              } else if (source === 'saved') {
                playerTracks = await getUserSavedTracks(player.userId);
              } else if (source === 'recent') {
                playerTracks = await getRecentlyPlayedTracks(player.userId);
              } else if (source === 'playlists'){
                for (const plId of selectedPlaylists) {
                  const tracks = await getPlaylistTracks(plId);
                  playerTracks.push(...tracks);
                }
              }else {
                // all = on mélange tout
                playerTracks = [
                    ...(await getUserTopTracks(player.userId)),
                  ...(await getUserSavedTracks(player.userId)),
                  ...(await getRecentlyPlayedTracks(player.userId))
                ];
              }
              playerData.tracks.push(...playerTracks);

              // Get playlists from this player
              try {
                const playlists = await getUserPlaylists(player.userId, 3) || [];
                console.log(`Got ${playlists.length} playlists from ${player.user.pseudo}`);

                // Get tracks from player's playlists (limit to 3 playlists for performance)
                const musicPreferences = await prisma.userMusicPreference.findUnique({
                  where: { userId: player.userId }
                });

// Vérifier si l'utilisateur a des préférences de playlist
                if (musicPreferences && musicPreferences.playlistIds && musicPreferences.playlistIds.length > 0) {
                  console.log(`Chargement des ${musicPreferences.playlistIds.length} playlists sélectionnées`);

                  // Ne charger que les playlists sélectionnées
                  for (const playlistId of musicPreferences.playlistIds) {
                    try {
                      // Trouver le nom de la playlist pour le logging
                      const playlistName = playlists.find(p => p.id === playlistId)?.name || playlistId;
                      console.log(`Chargement de la playlist sélectionnée: ${playlistName}`);

                      const playlistTracks = await getPlaylistTracks(playlistId, player.userId);
                      if (playlistTracks && playlistTracks.length > 0) {
                        playerData.tracks.push(...playlistTracks);
                        console.log(`Ajout de ${playlistTracks.length} titres depuis la playlist "${playlistName}"`);
                      }
                    } catch (err) {
                      console.error(`Erreur lors du chargement des titres de la playlist ${playlistId}:`, err.message);
                    }
                  }
                } else {
                  // Si aucune playlist n'est sélectionnée, utiliser les playlists par défaut
                  console.log(`Aucune playlist sélectionnée pour l'utilisateur ${player.userId}, utilisation des playlists par défaut`);

                  // Limiter à 2-3 playlists par défaut pour éviter de surcharger
                  const defaultPlaylists = playlists.slice(0, 3);

                  for (const playlist of defaultPlaylists) {
                    try {
                      const playlistTracks = await getPlaylistTracks(playlist.id, player.userId);
                      if (playlistTracks && playlistTracks.length > 0) {
                        playerData.tracks.push(...playlistTracks);
                        console.log(`Ajout de ${playlistTracks.length} titres depuis la playlist par défaut "${playlist.name}"`);
                      }
                    } catch (err) {
                      console.error(`Erreur lors du chargement des titres de la playlist ${playlist.id}:`, err.message);
                    }
                  }
                }
              } catch (e) {
                console.error(`Failed to get playlists for ${player.user.pseudo}:`, e.message);
              }

              // Get artists from this player
              try {
                const artists = await getUserTopArtists(player.userId) || [];
                playerData.artists.push(...artists);
                console.log(`Got ${artists.length} artists from ${player.user.pseudo}`);
              } catch (e) {
                console.error(`Failed to get top artists for ${player.user.pseudo}:`, e.message);
              }

              // Extract unique albums from tracks
              const trackAlbums = playerData.tracks
                  .map(track => track.album)
                  .filter((album, index, self) =>
                      album && index === self.findIndex(a => a && a.id === album.id)
                  );

              playerData.albums.push(...trackAlbums);
              console.log(`Extracted ${trackAlbums.length} albums from ${player.user.pseudo}'s tracks`);

              // Return processed unique data
              return {
                userId: player.userId,
                name: player.user.pseudo || 'Joueur',
                tracks: playerData.tracks.filter(track => track && track.id),
                artists: playerData.artists.filter(artist => artist && artist.id),
                albums: playerData.albums.filter(album => album && album.id)
              };
            } catch (error) {
              console.error(`Error processing data for ${player.user.pseudo}:`, error);
              // Return empty data on error to prevent blocking other players
              return {
                userId: player.userId,
                name: player.user.pseudo || 'Joueur',
                tracks: [],
                artists: [],
                albums: []
              };
            }
          } catch (error) {
            console.error(`Fatal error getting data for player ${player.userId}:`, error);
            // Return empty data on error
            return {
              userId: player.userId,
              name: player.user.pseudo || 'Joueur',
              tracks: [],
              artists: [],
              albums: []
            };
          }
        });

        // Wait for all player data to be collected in parallel
        const allPlayersData = await Promise.all(playerPromises);

        // Combine all player data and track contribution stats
        allPlayersData.forEach(playerData => {
          // Add unique tracks to the pool
          playerData.tracks.forEach(track => {
            if (track && track.id && !uniqueTrackIds.has(track.id)) {
              uniqueTrackIds.add(track.id);
              allTracks.push(track);
              playerContributions[playerData.userId].tracks++;
            }
          });

          // Add artists (avoiding duplicates)
          const uniqueArtistIds = new Set();
          playerData.artists.forEach(artist => {
            if (artist && artist.id && !uniqueArtistIds.has(artist.id)) {
              uniqueArtistIds.add(artist.id);
              allArtists.push(artist);
              playerContributions[playerData.userId].artists++;
            }
          });

          // Add albums (avoiding duplicates)
          const uniqueAlbumIds = new Set();
          playerData.albums.forEach(album => {
            if (album && album.id && !uniqueAlbumIds.has(album.id)) {
              uniqueAlbumIds.add(album.id);
              allAlbums.push(album);
              playerContributions[playerData.userId].albums++;
            }
          });
        });

        // Log contribution stats
        console.log("Player music contributions:");
        Object.entries(playerContributions).forEach(([userId, stats]) => {
          console.log(`${stats.name}: ${stats.tracks} tracks, ${stats.artists} artists, ${stats.albums} albums`);

          // Notify players about their contributions
          io.to(data.roomCode).emit('gamePreparationUpdate', {
            message: `${stats.name} a contribué avec ${stats.tracks} morceaux`,
            timestamp: Date.now()
          });
        });

        console.log(`Combined pool: ${allTracks.length} tracks, ${allArtists.length} artists, ${allAlbums.length} albums`);

        // If we still don't have enough tracks, use fallback data
        const MIN_REQUIRED_TRACKS = 10;
        if (allTracks.length < MIN_REQUIRED_TRACKS) {
          console.log(`Not enough tracks collected (${allTracks.length}/${MIN_REQUIRED_TRACKS}), using fallback data`);
          io.to(data.roomCode).emit('gamePreparationUpdate', {
            message: "Pas assez de données musicales, utilisation des morceaux populaires...",
            timestamp: Date.now()
          });

          // Au lieu d'utiliser seulement les données de l'hôte, utiliser une liste de morceaux populaires
          try {
            const popularTracks = await getPopularTracks(data.rounds || 10);

            // Ajouter ces morceaux au pool existant (s'il y en a)
            popularTracks.forEach(track => {
              if (track && track.id && !uniqueTrackIds.has(track.id)) {
                uniqueTrackIds.add(track.id);
                allTracks.push(track);
              }
            });

            console.log(`Added ${popularTracks.length} popular tracks to supplement`);
          } catch (error) {
            console.error('Error getting popular tracks:', error);
          }
        }

        // Generate questions from collected data
        io.to(data.roomCode).emit('gamePreparationUpdate', {
          message: "Génération des questions...",
          timestamp: Date.now()
        });

        let questions = [];

        // Amélioration: Utiliser une nouvelle fonction de shuffle améliorée
        function enhancedShuffleArray(array) {
          // Clone the array to avoid modifying the original
          const shuffled = [...array];

          // Add some entropy with current timestamp
          const seed = Date.now();

          // Fisher-Yates shuffle with seeded randomness
          for (let i = shuffled.length - 1; i > 0; i--) {
            // Use a combination of Math.random() and our seed for better randomness
            const randomFactor = Math.sin(seed + i) * 10000;
            const j = Math.floor(Math.abs(randomFactor) % (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }

          return shuffled;
        }

        // Generate questions using the appropriate function based on quiz type
        if (data.quizType === 'multiple_choice') {
          // Modification de la fonction pour assurer que tous les joueurs contribuent également
          questions = generateMultipleChoiceQuestions(
              enhancedShuffleArray(allTracks), // Shuffle tracks for better distribution
              enhancedShuffleArray(allArtists), // Shuffle artists
              enhancedShuffleArray(allAlbums), // Shuffle albums
              data.rounds || 10
          );
        } else {
          questions = generateFreeTextQuestions(
              enhancedShuffleArray(allTracks),
              enhancedShuffleArray(allArtists),
              enhancedShuffleArray(allAlbums),
              data.rounds || 10
          );
        }

        // Ensure we have at least some questions
        if (!questions || questions.length === 0) {
          socket.emit('error', { message: 'Impossible de générer des questions. Veuillez réessayer.' });
          return;
        }

        console.log(`Generated ${questions.length} questions, now enhancing with audio...`);

        // Enhance questions with YouTube previews if needed
        io.to(data.roomCode).emit('gamePreparationUpdate', {
          message: "Amélioration des extraits audio...",
          timestamp: Date.now()
        });

        // Count previews before enhancement
        const previewsBefore = questions.filter(q => q.previewUrl).length;

        // Add YouTube fallback for questions without preview URLs
        for (const question of questions) {
          if (!question.previewUrl && question.type === 'song') {
            try {
              // Try to find YouTube preview
              question.previewUrl = await findAudioPreviewUrl({
                name: question.answer,
                artists: [{ name: question.artistName }]
              });

              if (question.previewUrl && question.previewUrl.includes('youtube')) {
                question.previewSource = 'youtube';
              }
            } catch (err) {
              console.error(`Error enhancing question with YouTube:`, err);
            }
          }
        }

        // Count previews after enhancement
        const previewsAfter = questions.filter(q => q.previewUrl).length;
        console.log(`Enhanced audio: ${previewsBefore} => ${previewsAfter} questions with preview`);

        // Final shuffle of questions to ensure randomness
        questions = enhancedShuffleArray(questions).map((q, index) => ({
          ...q,
          id: `q-${Date.now()}-${index}`,
          round: index + 1
        }));

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
          playersAnswered: new Set()
        };

        activeGames.set(data.roomCode, gameData);
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

// Modification de la fonction generateMultipleChoiceQuestions dans lib/enhancedSpotifyUtils.js
// Cette partie devrait être remplacée dans le fichier lib/enhancedSpotifyUtils.js

    function generateMultipleChoiceQuestions(tracks, artists, albums, count) {
      const questions = [];

      // Fonction utilitaire pour mélanger un tableau avec plus d'entropie
      const shuffleArray = (array) => {
        const shuffled = [...array];
        const seed = Date.now();

        for (let i = shuffled.length - 1; i > 0; i--) {
          // Utiliser une combinaison de Math.random() et du timestamp pour plus d'aléatoire
          const randomFactor = Math.sin(seed + i) * 10000;
          const j = Math.floor(Math.abs(randomFactor) % (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      };

      // Fonction pour générer des options incorrectes uniques
      const generateWrongOptions = (correctOption, allOptions, currentQuestion, count = 3) => {
        // Check if we're working with track objects or just strings
        const isOptionsStrings = typeof allOptions[0] === 'string';

        // Filtrer pour éviter les doublons et assurer au moins count+1 options
        let artistFilter;

        if (currentQuestion.type === 'song' && currentQuestion.artistName && !isOptionsStrings) {
          // For song questions with track objects, filter options by same artist
          artistFilter = allOptions.filter(opt =>
              opt && opt.artists && Array.isArray(opt.artists) &&
              opt.artists.some(a => a && a.name && a.name.toLowerCase() === currentQuestion.artistName.toLowerCase())
          );
        } else {
          // For other question types or when options are strings, use normal filtering
          artistFilter = allOptions;
        }

        // Then filter out the correct answer
        const filteredOptions = artistFilter.filter(opt => {
          if (isOptionsStrings) {
            return opt && opt.toLowerCase() !== correctOption.toLowerCase();
          } else {
            return opt && typeof opt === 'object' && opt.name &&
                opt.name.toLowerCase() !== correctOption.toLowerCase();
          }
        });

        // Add debugging logs
        console.log(`Generating options for: ${correctOption}`);
        console.log(`Found ${filteredOptions.length} filtered options from ${allOptions.length} total options`);
        if (filteredOptions.length === 0) {
          console.log('Warning: No options found, using dummy options');
          // If no options found, generate some dummy options
          return ['Option A', 'Option B', 'Option C'].filter(o =>
              o.toLowerCase() !== correctOption.toLowerCase()
          ).slice(0, count);
        }

        // Mélanger et prendre les count premiers éléments
        return shuffleArray(filteredOptions).slice(0, count);
      };

      // Séparer les pistes avec et sans prévisualisation
      const tracksWithPreview = tracks.filter(track => track.preview_url);
      const tracksWithoutPreview = tracks.filter(track => !track.preview_url);

      console.log(`Pistes avec prévisualisation: ${tracksWithPreview.length}`);
      console.log(`Pistes sans prévisualisation: ${tracksWithoutPreview.length}`);

      // Allouer 70% des questions aux chansons si possible
      const songPercentage = 0.7; // 70% des questions seront des chansons
      let songCount = Math.floor(count * songPercentage);
      const maxSongsAvailable = Math.min(songCount, tracks.length);

      // Calculer combien de questions d'artistes et d'albums nous pouvons avoir
      const remainingCount = count - maxSongsAvailable;
      const artistCount = Math.ceil(remainingCount / 2);
      const albumCount = remainingCount - artistCount;

      // Réajuster si pas assez de ressources disponibles
      const finalSongCount = Math.min(maxSongsAvailable, tracksWithPreview.length);
      const finalArtistCount = Math.min(artistCount, artists.length);
      const finalAlbumCount = Math.min(albumCount, albums.length);

      console.log(`Distribution des questions: ${finalSongCount} chansons, ${finalArtistCount} artistes, ${finalAlbumCount} albums`);

      // Assurer une meilleure distribution des artistes
      // Créer des ensembles pour suivre les artistes/albums déjà utilisés
      const usedArtistIds = new Set();
      const usedAlbumIds = new Set();
      const usedTrackIds = new Set();

      // 1. Questions sur les chansons (priorité)
      // Shuffle les pistes pour éviter de toujours prendre les mêmes
      const shuffledTracks = shuffleArray(tracks);
      let selectedSongTracks = [];

      // Sélectionner des pistes en évitant de trop répéter les mêmes artistes
      for (const track of shuffledTracks) {
        // Si on a assez de pistes, arrêter
        if (selectedSongTracks.length >= finalSongCount) break;

        const artistId = track.artists && track.artists[0] ? track.artists[0].id : null;

        // Éviter de trop privilégier un artiste (max 2 chansons par artiste)
        if (artistId && usedArtistIds.has(artistId)) {
          // Compter combien de chansons on a déjà de cet artiste
          const artistTrackCount = selectedSongTracks.filter(t =>
              t.artists && t.artists[0] && t.artists[0].id === artistId
          ).length;

          // Si on a déjà 2 chansons de cet artiste, passer à la suivante
          if (artistTrackCount >= 2) continue;
        }

        // Ajouter cette piste et marquer l'artiste comme utilisé
        if (artistId) usedArtistIds.add(artistId);
        if (track.id) usedTrackIds.add(track.id);
        selectedSongTracks.push(track);
      }

      for (let i = 0; i < selectedSongTracks.length; i++) {
        const track = selectedSongTracks[i];
        const trackNames = tracks.map(t => t.name);

        const question = {
          type: 'song',
          quizType: 'multiple_choice',
          question: `Quel est ce titre de ${track.artists[0].name} ?`,
          previewUrl: track.preview_url,
          answer: track.name,
          artistName: track.artists[0].name,
          albumCover: track.album.images[0]?.url
        };

        // Logs for debugging
        console.log(`Creating song question for ${track.name} by ${track.artists[0].name}`);
        console.log(`Track names sample: ${trackNames.slice(0, 3).join(', ')}... (${trackNames.length} total)`);

        const wrongOptions = generateWrongOptions(track.name, trackNames, question);

        question.options = shuffleArray([track.name, ...wrongOptions]);
        questions.push(question);
      }

      // 2. Questions de type "artiste"
      // Shuffle les artistes pour éviter de toujours prendre les mêmes
      const shuffledArtists = shuffleArray(artists);

      let artistQuestionCount = 0;
      for (const artist of shuffledArtists) {
        if (artistQuestionCount >= finalArtistCount) break;

        // Éviter les doublons
        if (usedArtistIds.has(artist.id)) continue;

        // Chercher une piste avec preview pour cet artiste
        const artistTracksWithPreview = tracks.filter(track =>
            track.artists.some(a => a.id === artist.id) && track.preview_url
        );

        if (artistTracksWithPreview.length > 0) {
          const track = artistTracksWithPreview[Math.floor(Math.random() * artistTracksWithPreview.length)];
          const artistNames = artists.map(artist => artist.name);

          // Éviter d'utiliser des pistes déjà utilisées pour des questions de chansons
          if (usedTrackIds.has(track.id)) continue;

          usedTrackIds.add(track.id);
          usedArtistIds.add(artist.id);

          const question = {
            type: 'artist',
            quizType: 'multiple_choice',
            question: "Qui est l'artiste de ce morceau ?",
            previewUrl: track.preview_url,
            answer: artist.name,
            artistName: artist.name,
            albumCover: track.album.images[0]?.url
          };

          const wrongOptions = generateWrongOptions(artist.name, artistNames, question);

          question.options = shuffleArray([artist.name, ...wrongOptions]);
          questions.push(question);
          artistQuestionCount++;
        }
      }

      // 3. Questions sur les albums
      // Shuffle les albums pour éviter de toujours prendre les mêmes
      const shuffledAlbums = shuffleArray(albums);

      let albumQuestionCount = 0;
      for (const album of shuffledAlbums) {
        if (albumQuestionCount >= finalAlbumCount) break;

        // Éviter les doublons
        if (usedAlbumIds.has(album.id)) continue;

        // Éviter de trop privilégier un artiste (max 2 albums par artiste)
        const artistId = album.artists && album.artists[0] ? album.artists[0].id : null;
        if (artistId && usedArtistIds.has(artistId)) {
          // Compter combien d'albums on a déjà de cet artiste
          const artistAlbumCount = questions.filter(q =>
              q.type === 'album' && q.artistName === album.artists[0].name
          ).length;

          // Si on a déjà 2 albums de cet artiste, passer au suivant
          if (artistAlbumCount >= 2) continue;
        }

        usedAlbumIds.add(album.id);
        if (artistId) usedArtistIds.add(artistId);

        const albumNames = albums.map(album => album.name);

        // Trouver l'artiste de l'album
        const artistName = album.artists[0]?.name || "Artiste inconnu";

        const question = {
          type: 'album',
          quizType: 'multiple_choice',
          question: `Quel est cet album de ${artistName} ?`,
          answer: album.name,
          artistName: artistName,
          albumCover: album.images[0]?.url
        };

        const wrongOptions = generateWrongOptions(album.name, albumNames, question);

        question.options = shuffleArray([album.name, ...wrongOptions]);
        questions.push(question);
        albumQuestionCount++;
      }

      // Si on n'a pas assez de questions, compléter avec des questions supplémentaires
      if (questions.length < count) {
        const remainingNeeded = count - questions.length;

        // Utiliser les pistes sans preview si nécessaire
        const availableTracks = [...tracksWithoutPreview, ...tracksWithPreview].filter(
            track => !usedTrackIds.has(track.id)
        );

        // Shuffle à nouveau pour plus de randomisation
        const shuffledAvailableTracks = shuffleArray(availableTracks);

        for (let i = 0; i < remainingNeeded && i < shuffledAvailableTracks.length; i++) {
          const track = shuffledAvailableTracks[i];
          const trackNames = tracks.map(t => t.name);

          const question = {
            type: 'song',
            quizType: 'multiple_choice',
            question: `Quel est ce titre de ${track.artists[0].name} ?`,
            previewUrl: track.preview_url, // peut être null
            answer: track.name,
            artistName: track.artists[0].name,
            albumCover: track.album.images[0]?.url
          };

          const wrongOptions = generateWrongOptions(track.name, trackNames, question);

          question.options = shuffleArray([track.name, ...wrongOptions]);
          questions.push(question);
        }
      }

      // Faire un shuffle final des questions
      return shuffleArray(questions);
    }

// Helper function to collect music data from a single player
    async function collectPlayerMusicData(userId) {
      try {
        // Récupérer les préférences musicales de l'utilisateur
        const musicPreferences = await prisma.userMusicPreference.findUnique({
          where: { userId }
        });

        // Valeurs par défaut si aucune préférence n'est trouvée
        const preferences = musicPreferences || {
          playlistIds: [],
          useLikedTracks: true,
          useListeningHistory: true
        };

        const tracks = [];
        const artists = [];
        const albums = [];

        // 1. Récupérer les titres préférés (toujours inclus)
        try {
          const topTracks = await getUserTopTracks(userId, 'short_term', 30);
          if (topTracks && topTracks.length > 0) {
            tracks.push(...topTracks);
            console.log(`Got ${topTracks.length} top tracks for user ${userId}`);
          }
        } catch (e) {
          console.error(`Failed to get top tracks for user ${userId}:`, e.message);
        }

        // 2. Récupérer les titres likés (si activé, par défaut true)
        if (preferences.useLikedTracks) {
          try {
            const savedTracks = await getUserSavedTracks(userId, 50);
            if (savedTracks && savedTracks.length > 0) {
              // Filtrer les doublons
              const uniqueTracks = savedTracks.filter(
                  track => !tracks.some(t => t.id === track.id)
              );
              tracks.push(...uniqueTracks);
              console.log(`Got ${uniqueTracks.length} unique liked tracks for user ${userId}`);
            }
          } catch (e) {
            console.error(`Failed to get liked tracks for user ${userId}:`, e.message);
          }
        }

        // 3. Récupérer l'historique d'écoute (si activé)
        if (preferences.useListeningHistory) {
          try {
            const recentTracks = await getRecentlyPlayedTracks(userId, 30);
            if (recentTracks && recentTracks.length > 0) {
              // Filtrer les doublons
              const uniqueTracks = recentTracks.filter(
                  track => !tracks.some(t => t.id === track.id)
              );
              tracks.push(...uniqueTracks);
              console.log(`Got ${uniqueTracks.length} unique recent tracks for user ${userId}`);
            }
          } catch (e) {
            console.error(`Failed to get recent tracks for user ${userId}:`, e.message);
          }
        }

        // 4. Récupérer les playlists sélectionnées
        if (preferences.playlistIds && preferences.playlistIds.length > 0) {
          console.log(`Fetching ${preferences.playlistIds.length} selected playlists for user ${userId}`);

          for (const playlistId of preferences.playlistIds) {
            try {
              const playlistTracks = await getPlaylistTracks(playlistId, userId, 50);
              if (playlistTracks && playlistTracks.length > 0) {
                // Filtrer les doublons
                const uniqueTracks = playlistTracks.filter(
                    track => !tracks.some(t => t.id === track.id)
                );
                tracks.push(...uniqueTracks);
                console.log(`Added ${uniqueTracks.length} unique tracks from playlist ${playlistId}`);
              }
            } catch (e) {
              console.error(`Failed to get tracks from playlist ${playlistId}:`, e.message);
            }
          }
        } else if (preferences.playlistIds && preferences.playlistIds.length === 0) {
          console.log(`No playlists selected for user ${userId}`);
        } else {
          // Si aucune préférence n'est définie, récupérer quelques playlists par défaut
          try {
            const playlists = await getUserPlaylists(userId, 3);
            console.log(`No playlist preferences found, using top ${playlists.length} playlists as default`);

            for (const playlist of playlists) {
              try {
                const playlistTracks = await getPlaylistTracks(playlist.id, userId, 30);
                if (playlistTracks && playlistTracks.length > 0) {
                  const uniqueTracks = playlistTracks.filter(
                      track => !tracks.some(t => t.id === track.id)
                  );
                  tracks.push(...uniqueTracks);
                  console.log(`Added ${uniqueTracks.length} tracks from default playlist ${playlist.name}`);
                }
              } catch (err) {
                console.error(`Error getting tracks from playlist ${playlist.id}:`, err.message);
              }
            }
          } catch (e) {
            console.error(`Failed to get default playlists for user ${userId}:`, e.message);
          }
        }

        // 5. Récupérer les artistes et extraire les albums
        try {
          const topArtists = await getUserTopArtists(userId);
          if (topArtists && topArtists.length > 0) {
            artists.push(...topArtists);
          }

          // Extraire les albums des pistes
          const trackAlbums = tracks
              .map(track => track.album)
              .filter((album, index, self) =>
                  album && index === self.findIndex(a => a && a.id === album.id)
              );

          albums.push(...trackAlbums);
        } catch (e) {
          console.error(`Failed to process artists/albums for user ${userId}:`, e.message);
        }

        return { tracks, artists, albums };
      } catch (error) {
        console.error(`Error in collectPlayerMusicData for user ${userId}:`, error);
        return { tracks: [], artists: [], albums: [] };
      }
    }

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
  httpServer.listen(PORT, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log(`> Ready on https://vercel-project-toraneks-projects.vercel.app`);
    console.log('> Socket.IO server initialized');
  });
});