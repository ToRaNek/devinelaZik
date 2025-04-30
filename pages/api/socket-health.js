// pages/api/socket-health.js
import { getToken } from 'next-auth/jwt';

export default async function handler(req, res) {
    // Options pour CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Extraire les informations de session
    let session = null;
    let token = null;

    try {
        token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
        if (token) {
            session = { userId: token.sub };
        }
    } catch (error) {
        console.error('Error getting token:', error);
    }

    // Recueillir les en-têtes pertinents
    const headers = {
        origin: req.headers.origin || 'none',
        referer: req.headers.referer || 'none',
        'user-agent': req.headers['user-agent'] || 'none',
        cookie: req.headers.cookie ? 'present' : 'absent',
        'content-type': req.headers['content-type'] || 'none',
        host: req.headers.host || 'none'
    };

    res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: {
            nodeEnv: process.env.NODE_ENV || 'not set',
            nextAuthUrl: process.env.NEXTAUTH_URL || 'not set',
        },
        request: {
            url: req.url,
            method: req.method,
            headers: headers
        },
        auth: {
            session: session ? 'present' : 'absent',
            userId: session?.userId || null
        },
        socketConfig: {
            supportedTransports: ['websocket', 'polling'],
            path: '/socket.io',
            origin: process.env.NEXTAUTH_URL || 'http://localhost:3000'
        }
    });
}