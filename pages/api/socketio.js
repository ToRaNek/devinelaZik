import { Server as SocketIOServer } from 'socket.io';
import { getToken } from "next-auth/jwt";

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
        pingInterval: 25000,
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

        // Envoyer une confirmation immédiate au client
        socket.emit('serverAck', {
            message: 'Connecté avec succès',
            socketId: socket.id,
            userId: socket.userId,
            timestamp: Date.now()
        });

        // Heartbeat pour maintenir la connexion
        const heartbeat = setInterval(() => {
            if (socket.connected) {
                socket.emit('heartbeat', { timestamp: Date.now() });
            }
        }, 30000);

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

                // Informer le client
                socket.emit('roomJoined', {
                    roomCode,
                    timestamp: Date.now()
                });

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
        socket.on('startGame', ({roomCode, rounds, source}) => {
            console.log(`Démarrage de partie demandé dans la salle ${roomCode}`);

            io.to(roomCode).emit('gameStarted', {
                rounds: rounds || 10,
                players: io.sockets.adapter.rooms.get(roomCode)?.size || 0,
                timestamp: Date.now()
            });
        });

        // Gestionnaire de déconnexion
        socket.on('disconnect', (reason) => {
            console.log(`Client déconnecté: ${socket.id}, raison: ${reason}`);
            clearInterval(heartbeat);
        });
    });

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