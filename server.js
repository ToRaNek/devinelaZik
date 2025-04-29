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

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const io = new Server(httpServer);

  // Socket.IO logic here...

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(3000, (err) => {
    if (err) throw err;
    console.log('> Ready on http://localhost:3000');
  });
});

// Stocker les données des salles actives en mémoire pour plus de rapidité
const activeRooms = new Map();
const activeGames = new Map();

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
    }]
  };