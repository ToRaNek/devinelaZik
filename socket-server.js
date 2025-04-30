// socket-server.js
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const server = http.createServer();

// Configuration Socket.IO comme serveur autonome
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["my-custom-header"]
    },
    // Utiliser polling d'abord pour plus de fiabilité
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    connectTimeout: 30000
});

console.log("Socket.IO server configured with CORS:", io.opts.cors);

// Reste du code comme avant...

// Démarrer le serveur
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Socket.IO server running on http://localhost:${PORT}`);
});