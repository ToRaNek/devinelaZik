// pages/api/socketio.js
import { Server as SocketIOServer } from 'socket.io';
import { getToken } from "next-auth/jwt";
import prisma from '../../lib/prisma';
const { generateQuestionsFromSpotify } = require('../../lib/spotifyUtils');
// Store active data in memory
const activeRooms = new Map();
const activeGames = new Map();
const activeConnections = new Map();

// Cette fonction ne s'exécute qu'une seule fois pour initialiser le serveur Socket.IO
// Les connexions WebSocket ultérieures réutiliseront la même instance
export default async function handler(req, res) {
    // Vérifier si Socket.IO est déjà initialisé
    if (res.socket.server.io) {
        console.log('Socket.IO est déjà initialisé - réutilisation de l\'instance existante');
        res.end();
        return;
    }

    console.log('Initialisation du serveur Socket.IO');

    // Configuration du serveur Socket.IO optimisée pour Next.js
    const io = new SocketIOServer(res.socket.server, {
        path: '/socket.io', // Uniformisé avec la configuration client
        addTrailingSlash: false,
        transports: ['websocket', 'polling'],
        cors: {
            origin: process.env.NEXTAUTH_URL || "http://localhost:3000",
            methods: ["GET", "POST"],
            credentials: true
        },
        // Paramètres de timeout et reconnexion ajustés
        pingTimeout: 60000,
        pingInterval: 15000, // More frequent pings to keep connection alive
        upgradeTimeout: 30000,
        maxHttpBufferSize: 1e8
    });

    // Logging des erreurs de connexion de bas niveau
    io.engine.on("connection_error", (err) => {
        console.log("❌ Erreur de connexion Socket.IO de bas niveau:", err.code, err.message, err.context);
    });

    // Middleware d'authentification
    io.use(async (socket, next) => {
        try {
            // Log des informations de connexion pour debug
            console.log('Tentative d\'authentification Socket:', {
                id: socket.id,
                headers: Object.keys(socket.handshake.headers),
                cookiesPresent: !!socket.handshake.headers.cookie,
                query: socket.handshake.query,
                auth: socket.handshake.auth
            });

            // Authentication depuis Socket auth (prioritaire)
            if (socket.handshake.auth && socket.handshake.auth.userId) {
                socket.userId = socket.handshake.auth.userId;
                console.log(`Utilisateur ${socket.userId} authentifié via Socket auth`);
                return next();
            }

            // Tenter l'authentification via NextAuth JWT
            const token = await getToken({
                req: socket.request,
                secret: process.env.NEXTAUTH_SECRET
            });

            if (token) {
                // Utilisateur authentifié avec succès
                console.log(`Utilisateur ${token.sub} authentifié via NextAuth JWT`);
                socket.userId = token.sub;
                return next();
            }

            // Autorisation anonyme temporaire (à retirer en production)
            console.log('Aucun token NextAuth trouvé, autorisation anonyme temporaire');
            socket.userId = `anonymous-${socket.id}`;
            next();
        } catch (error) {
            console.error('Erreur d\'authentification Socket:', error);
            next(new Error("Erreur d'authentification"));
        }
    });

    // Gestionnaire de connexion principal
    io.on('connection', (socket) => {
        console.log(`✅ Client connecté: ${socket.id}, Utilisateur: ${socket.userId}`);

        // Track active connections
        activeConnections.set(socket.id, {
            userId: socket.userId,
            connected: true,
            lastActivity: Date.now()
        });

        // Envoyer une confirmation immédiate au client
        socket.emit('serverAck', {
            message: 'Connecté avec succès',
            socketId: socket.id,
            userId: socket.userId,
            timestamp: Date.now()
        });

        // Heartbeat avec plus d'informations
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
        socket.on('joinRoom', async ({roomCode, user}) => {
            try {
                console.log(`Utilisateur ${user.id} rejoint la salle ${roomCode}`);

                // Quitter d'abord toutes les autres salles
                for (const room of [...socket.rooms]) {
                    if (room !== socket.id) {
                        socket.leave(room);
                    }
                }

                // Rejoindre la nouvelle salle
                socket.join(roomCode);

                // Store room data if not already tracked
                if (!activeRooms.has(roomCode)) {
                    // Get room details from database
                    const roomData = await prisma.room.findUnique({
                        where: { code: roomCode },
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
                        activeRooms.set(roomCode, {
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
                const roomData = activeRooms.get(roomCode);

                // Add player to room if not already present
                if (roomData && !roomData.players.some(p => p.userId === socket.userId)) {
                    roomData.players.push({
                        userId: socket.userId,
                        score: 0,
                        user: {
                            id: user.id,
                            pseudo: user.pseudo || user.name,
                            name: user.name,
                            image: user.image
                        }
                    });
                }

                // Informer le client
                socket.emit('roomJoined', {
                    roomCode,
                    roomData: roomData,
                    timestamp: Date.now()
                });

                // Send full room data to all clients
                io.to(roomCode).emit('roomData', roomData);

                // Informer les autres membres de la salle
                socket.to(roomCode).emit('playerJoined', {
                    userId: user.id,
                    user: {
                        id: user.id,
                        pseudo: user.pseudo || user.name,
                        image: user.image
                    },
                    timestamp: Date.now()
                });

                // Ajouter un message système dans le chat
                io.to(roomCode).emit('message', {
                    system: true,
                    message: `${user.pseudo || 'Un joueur'} a rejoint la partie!`,
                    timestamp: Date.now()
                });
            } catch (error) {
                console.error('Erreur lors de joinRoom:', error);
                socket.emit('error', {message: 'Échec de l\'accès à la salle: ' + error.message});
            }
        });

        // Envoyer un message dans le chat
        socket.on('sendMessage', ({roomCode, user, message}) => {
            if (!roomCode || !user || !message) return;

            io.to(roomCode).emit('message', {
                user: {
                    id: user.id,
                    pseudo: user.pseudo,
                    image: user.image
                },
                message: message,
                timestamp: Date.now()
            });
        });

        // Démarrer une partie (hôte uniquement)
        socket.on('startGame', async ({roomCode, rounds, source}) => {
            try {
                console.log(`Démarrage de partie demandé dans la salle ${roomCode} par ${socket.userId}`);
                const roomData = activeRooms.get(roomCode);

                // Verify host
                if (!roomData || roomData.hostId !== socket.userId) {
                    console.log('Not host, cannot start game');
                    socket.emit('error', { message: 'Only the host can start the game' });
                    return;
                }

                // Generate questions using Spotify data
                let questions = [];
                try {
                    // Get questions from Spotify
                    console.log(`Generating questions from ${source} for user ${socket.userId}`);
                    questions = await generateQuestionsFromSpotify(socket.userId, rounds || 10);

                    // Add IDs and round numbers to questions
                    questions = questions.map((q, index) => ({
                        ...q,
                        id: `q-${Date.now()}-${index}`,
                        round: index + 1
                    }));

                    console.log(`Generated ${questions.length} questions`);
                } catch (error) {
                    console.error('Error generating questions:', error);
                    // Use sample questions as fallback
                    questions = getSampleQuestions(rounds || 10);
                }

                // Store game data
                const gameData = {
                    roomCode: roomCode,
                    status: 'playing',
                    hostId: socket.userId,
                    currentRound: 0,
                    totalRounds: rounds || 10,
                    questions: questions,
                    scores: roomData.players.map(player => ({
                        userId: player.userId,
                        user: player.user,
                        score: 0
                    })),
                    startTime: Date.now()
                };

                activeGames.set(roomCode, gameData);

                // Update room status
                roomData.status = 'playing';

                // Inform clients that game is starting
                io.to(roomCode).emit('gameStarted', {
                    rounds: rounds || 10,
                    players: roomData.players.length,
                    timestamp: Date.now()
                });

                // Send first question after a short delay
                setTimeout(() => {
                    sendNextQuestion(roomCode, io);
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

                    // Move to next question
                    clearTimeout(gameData.questionTimer);

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

                    // Wait a moment before next question
                    setTimeout(() => {
                        sendNextQuestion(roomCode, io);
                    }, 3000);
                } else {
                    // Incorrect answer
                    socket.emit('answerResult', {
                        correct: false,
                        points: 0,
                        answer: null // Don't reveal correct answer yet
                    });
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

        // Gestionnaire de déconnexion
        socket.on('disconnect', (reason) => {
            console.log(`Client déconnecté: ${socket.id}, raison: ${reason}`);
            clearInterval(heartbeat);

            // Update active connections
            activeConnections.delete(socket.id);

            // Handle player leaving rooms
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    const roomData = activeRooms.get(room);
                    if (roomData) {
                        // Remove player from room data
                        roomData.players = roomData.players.filter(p => p.userId !== socket.userId);

                        // If host left, assign new host if there are still players
                        if (roomData.players.length > 0 && roomData.hostId === socket.userId) {
                            roomData.hostId = roomData.players[0].userId;
                            io.to(room).emit('hostChanged', roomData.hostId);
                        }

                        // Notify room of player leaving
                        io.to(room).emit('playerLeft', socket.userId);

                        // Update room data
                        io.to(room).emit('roomData', roomData);

                        // If room is now empty, remove it
                        if (roomData.players.length === 0) {
                            activeRooms.delete(room);
                            activeGames.delete(room);
                        }
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

        console.log(`Sending question for round ${gameData.currentRound}/${gameData.totalRounds} to room ${roomCode}`);

        // Send question to all clients
        io.to(roomCode).emit('newQuestion', {
            ...currentQuestion,
            answer: undefined, // Don't send the answer to clients!
        });

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

    // Function to get sample questions if Spotify API fails
    function getSampleQuestions(count) {
        const questions = [
            {
                type: 'artist',
                previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
                answer: 'Daft Punk',
                artistName: 'Daft Punk',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
            },
            {
                type: 'song',
                previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
                answer: 'Bohemian Rhapsody',
                artistName: 'Queen',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e'
            },
            {
                type: 'album',
                answer: 'Thriller',
                artistName: 'Michael Jackson',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b2734121faee8df82c526cbab2be'
            },
            {
                type: 'artist',
                previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
                answer: 'Billie Eilish',
                artistName: 'Billie Eilish',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e'
            },
            {
                type: 'song',
                previewUrl: 'https://p.scdn.co/mp3-preview/452de87e6104ded50e674050d56c7269336a3fe9',
                answer: 'Blinding Lights',
                artistName: 'The Weeknd',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b27348a42a53ea8e0d9e98423a6d'
            },
            {
                type: 'album',
                answer: 'The Dark Side of the Moon',
                artistName: 'Pink Floyd',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe'
            },
            {
                type: 'artist',
                previewUrl: 'https://p.scdn.co/mp3-preview/77a5b67f66c1f18353ea5afc6e8628c145267d4a',
                answer: 'Kendrick Lamar',
                artistName: 'Kendrick Lamar',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b2732e8ed79e177ff6011076f5f0'
            },
            {
                type: 'song',
                previewUrl: 'https://p.scdn.co/mp3-preview/7df27a9a6ac1d6c8767b61b38dc37ba5cfa3f19c',
                answer: 'Imagine',
                artistName: 'John Lennon',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b2736750daf5f4576e3c25d5c7aa'
            },
            {
                type: 'album',
                answer: 'Nevermind',
                artistName: 'Nirvana',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b27336c5417732e53e23cb219246'
            },
            {
                type: 'artist',
                previewUrl: 'https://p.scdn.co/mp3-preview/8de4f9d9671c42e7e6f3ecf0edcba3f08d5593f2',
                answer: 'Taylor Swift',
                artistName: 'Taylor Swift',
                albumCover: 'https://i.scdn.co/image/ab67616d0000b273e0b64c8be3c4e804abcb2696'
            }
        ];

        // Add IDs and round numbers
        const selectedQuestions = questions
            .slice(0, count)
            .map((q, index) => ({
                ...q,
                id: `sample-${Date.now()}-${index}`,
                round: index + 1
            }));

        return selectedQuestions;
    }

    // Stocker l'instance io sur l'objet server pour réutilisation
    res.socket.server.io = io;

    // Terminer la requête HTTP
    res.end();
}

// Configuration spéciale pour Next.js API Routes avec WebSockets
export const config = {
    api: {
        bodyParser: false,
    },
};