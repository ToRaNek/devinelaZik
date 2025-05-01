// handlers/youtube.js
const ytdl       = require('@distube/ytdl-core');
const { CookieAgent } = require('http-cookie-agent/undici'); // Undici v7+
// Pour Undici v6 (Node 20/22), utilisez:
// const { CookieAgent } = require('http-cookie-agent/undici/v6');
const { CookieJar } = require('tough-cookie');               // Gestionnaire de cookies
const ytSearch   = require('yt-search');

/**
 * Override de ytdl.createAgent pour injecter un CookieAgent
 * @param {Array<{ name:string, value:string, domain?:string }>} cookies
 * @returns {import('undici').Agent} un agent Undici avec gestion des cookies
 */
ytdl.createAgent = (cookies = []) => {
    // 1) Crée le jar et y ajoute chaque cookie
    const jar = new CookieJar();
    cookies.forEach(({ name, value, domain }) => {
        // setCookie est asynchrone en v4+, mais http-cookie-agent supporte Jar synchro/v4
        jar.setCookieSync(
            `${name}=${value}`,
            `https://${domain || 'youtube.com'}`
        );
    });  // :contentReference[oaicite:3]{index=3}

    // 2) Retourne un CookieAgent Undici préconfiguré
    return new CookieAgent({ cookies: { jar } });
};

/**
 * Recherche YouTube (Démonstration)
 */
async function searchYouTubeVideo(query) {
    const res = await ytSearch(query);
    return (res.videos[0] || {}).videoId || null;
}

/**
 * Récupère un flux audio avec repli
 */
async function getYouTubeAudioStream(videoId) {
    const strategies = [
        async () => {
            const info = await ytdl.getInfo(videoId);
            return ytdl.downloadFromInfo(info, { filter: 'audioonly', quality: 'highestaudio' });
        },
        async () => {
            const info = await ytdl.getInfo(videoId);
            const audio = ytdl.filterFormats(info.formats, 'audioonly')[0];
            return ytdl.downloadFromInfo(info, {
                format: audio,
                requestOptions: {
                    headers: {
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            });
        },
        () => ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
            filter: 'audioonly',
            quality: 'lowest'
        })
    ];

    for (const strat of strategies) {
        try {
            const stream = await strat();
            stream.on('error', e => console.error('Stream error:', e));
            return stream;
        } catch {
            console.warn('Échec d’une stratégie, tentative suivante…');
        }
    }
    throw new Error('Toutes les stratégies de streaming ont échoué');
}

/**
 * Exports de votre module
 */
module.exports = {
    searchYouTubeVideo,
    getYouTubeAudioStream
};
