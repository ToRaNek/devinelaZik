// pages/api/socket-health.js
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        socketConfig: {
            enabled: true,
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            origin: process.env.NEXTAUTH_URL || 'https://devinela-zik-wait-for-it.onrender.com'
        },
        note: "Socket.IO fonctionne via le serveur principal, pas via les API routes."
    });
}