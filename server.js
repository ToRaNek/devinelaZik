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
    pingInterval: 25000
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

    socket.emit('serverAck', {
      message: 'Connected successfully',
      socketId: socket.id,
      userId: socket.userId
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 30000);

    // Rejoindre une salle
    socket.on('joinRoom', (data) => {
      console.log(`User ${socket.userId} joining room ${data.roomCode}`);

      // Quitter les autres salles
      for (const room of [...socket.rooms]) {
        if (room !== socket.id) {
          socket.leave(room);
        }
      }

      socket.join(data.roomCode);

      // Informer le client
      socket.emit('roomJoined', {
        roomCode: data.roomCode,
        timestamp: Date.now()
      });

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
    socket.on('startGame', (data) => {
      console.log(`Game start requested in room ${data.roomCode}`);

      io.to(data.roomCode).emit('gameStarted', {
        rounds: data.rounds || 10,
        players: io.sockets.adapter.rooms.get(data.roomCode)?.size || 0,
        timestamp: Date.now()
      });
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);
      clearInterval(heartbeat);
    });
  });

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