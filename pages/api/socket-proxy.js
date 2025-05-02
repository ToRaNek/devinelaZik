// pages/api/socket-proxy.js
import httpProxy from 'http-proxy';

// Création d'un proxy plus simple
const proxy = httpProxy.createProxyServer();

// Log les erreurs pour debugging
proxy.on('error', (err, req, res) => {
    console.error('Proxy error:', err);
    if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Proxy Error: ' + err.message);
    }
});

export default function handler(req, res) {
    // Configuration spéciale pour WebSockets
    res.socket.server.ws = true;

    return new Promise((resolve, reject) => {
        // Extraire le cookie de session pour l'authentification
        const sessionCookie = req.headers.cookie;

        // Configurer le proxy vers le serveur Socket.IO
        const target = process.env.NODE_ENV === 'production'
            ? 'http://192-168-37-98.nip.io:3000'
            : 'http://192-168-37-98.nip.io:3000';

        // Options de proxy plus détaillées
        const options = {
            target,
            changeOrigin: true,
            ws: true,
            headers: {
                cookie: sessionCookie
            },
            // Log détaillé pour debugging
            logLevel: 'debug'
        };

        // Effectuer la redirection
        proxy.web(req, res, options, (err) => {
            if (err) {
                console.error('WebSocket proxy error:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

// Configuration pour supporter les WebSockets
export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
};