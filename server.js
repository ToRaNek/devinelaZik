// server.js
const express = require('express');
const http = require('http');
const next = require('next');
const { Server } = require('socket.io');
const prisma = require('./lib/prisma');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = new Server(httpServer);
  
  // Socket.IO logic
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    // Handle room joining
    socket.on('joinRoom', async (roomCode) => {
      console.log(`User ${socket.id} joining room ${roomCode}`);
      socket.join(roomCode);
      
      // Notify others that a new player has joined
      socket.to(roomCode).emit('playerJoined', { id: socket.id });
    });
    
    // Handle room leaving
    socket.on('leaveRoom', (roomCode) => {
      console.log(`User ${socket.id} leaving room ${roomCode}`);
      socket.leave(roomCode);
      socket.to(roomCode).emit('playerLeft', socket.id);
    });
    
    // Handle game start
    socket.on('startGame', async (roomCode) => {
      console.log(`Starting game in room ${roomCode}`);
      io.to(roomCode).emit('gameStarted');
      
      // TODO: Add logic to fetch music questions when integrated with Spotify/Deezer APIs
      // For now, emit a placeholder question
      const placeholderQuestion = {
        id: Math.random().toString(36).substring(2, 15), // Simple ID generation
        type: 'artist',
        previewUrl: 'https://example.com/preview.mp3',
        answer: 'Example Artist'
      };
      
      io.to(roomCode).emit('newQuestion', placeholderQuestion);
    });
    
    // Handle chat messages
    socket.on('sendMessage', (data) => {
      console.log(`Message in room ${data.roomCode}: ${data.user}: ${data.message}`);
      io.to(data.roomCode).emit('message', {
        user: data.user,
        message: data.message,
        timestamp: new Date()
      });
    });
    
    // Handle disconnections
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
  
  // Handle Next.js requests
  server.all('*', (req, res) => {
    return handle(req, res);
  });
  
  // Start server
  const PORT = process.env.PORT || 3000;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
}).catch((ex) => {
  console.error(ex.stack);
  process.exit(1);
});