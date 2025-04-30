// server.js - Version complètement réécrite
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store active room data in memory
const activeRooms = new Map();
const activeGames = new Map();
const activeConnections = new Map();

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);

  // Configuration Socket.IO directement sur le serveur HTTP
  const io = new Server(httpServer, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    cors: {
      origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Logging des erreurs de connexion de bas niveau
  io.engine.on("connection_error", (err) => {
    console.log("❌ Erreur de connexion Socket.IO:", err.code, err.message, err.context);
  });

  // Middleware d'authentification simplifié
  io.use((socket, next) => {
    console.log('Authentification socket:', socket.handshake.auth);

    // Autoriser toutes les connexions pendant le débogage
    socket.userId = socket.handshake.auth.userId || `anonymous-${socket.id}`;
    next();
  });

  // Gestion des connexions
  io.on('connection', (socket) => {
    console.log(`✅ Client connecté: ${socket.id}, User: ${socket.userId}`);

    // Confirmation immédiate
    socket.emit('serverAck', {
      message: 'Connecté avec succès',
      socketId: socket.id,
      userId: socket.userId
    });

    // Heartbeat
    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, 30000);

    // Implémentation de joinRoom et autres handlers...
    socket.on('joinRoom', (data) => {
      console.log(`User ${socket.userId} joining room ${data.roomCode}`);
      socket.join(data.roomCode);
      socket.to(data.roomCode).emit('playerJoined', {
        userId: data.user.id,
        user: data.user
      });
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
      console.log(`Client déconnecté: ${socket.id}, raison: ${reason}`);
      clearInterval(heartbeat);
    });
  });

  // Toutes les requêtes HTTP passent à Next.js
  server.all('*', (req, res) => {
    return handle(req, res);
  });

  // Démarrage du serveur
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log('> Socket.IO server initialized');
  });
});