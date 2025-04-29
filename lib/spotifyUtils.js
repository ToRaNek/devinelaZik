// lib/spotifyUtils.js
import prisma from './prisma';

/**
 * Obtient un jeton d'accès valide pour l'API Spotify
 */
export async function getValidSpotifyToken(userId) {
    try {
        // Recherche du compte Spotify de l'utilisateur
        const spotifyAccount = await prisma.account.findFirst({
            where: {
                userId: userId,
                provider: 'spotify'
            }
        });

        if (!spotifyAccount) {
            throw new Error('Aucun compte Spotify lié');
        }

        // Vérifier si le jeton est expiré
        const now = Math.floor(Date.now() / 1000);

        if (spotifyAccount.expires_at <= now) {
            // Le jeton est expiré, il faut le rafraîchir
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(
                        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                    ).toString('base64')}`
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: spotifyAccount.refresh_token
                })
            });

            if (!response.ok) {
                throw new Error('Échec lors du rafraîchissement du jeton Spotify');
            }

            const data = await response.json();

            // Mettre à jour le jeton dans la base de données
            await prisma.account.update({
                where: { id: spotifyAccount.id },
                data: {
                    access_token: data.access_token,
                    expires_at: Math.floor(Date.now() / 1000) + data.expires_in
                }
            });

            return data.access_token;
        }

        return spotifyAccount.access_token;
    } catch (error) {
        console.error('Erreur lors de l\'obtention du jeton Spotify:', error);
        throw error;
    }
}

/**
 * Récupère les chansons préférées de l'utilisateur
 */
export async function getUserTopTracks(userId) {
    try {
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Échec lors de la récupération des titres préférés');
        }

        const data = await response.json();
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des titres préférés:', error);
        throw error;
    }
}

/**
 * Récupère les artistes préférés de l'utilisateur
 */
export async function getUserTopArtists(userId) {
    try {
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch('https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Échec lors de la récupération des artistes préférés');
        }

        const data = await response.json();
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des artistes préférés:', error);
        throw error;
    }
}

/**
 * Récupère les albums d'un artiste
 */
export async function getArtistAlbums(artistId, userId) {
    try {
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=50`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Échec lors de la récupération des albums');
        }

        const data = await response.json();
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des albums:', error);
        throw error;
    }
}

/**
 * Génère des questions pour le jeu à partir des données Spotify
 */
export async function generateQuestionsFromSpotify(userId, count = 10) {
    try {
        // Mélanger les types de questions
        const questionTypes = ['artist', 'song', 'album'];

        // Répartir le nombre de questions par type
        const questionsPerType = Math.floor(count / questionTypes.length);
        let remainingQuestions = count - (questionsPerType * questionTypes.length);

        const questions = [];

        // Récupérer les titres et artistes préférés
        const topTracks = await getUserTopTracks(userId);
        const topArtists = await getUserTopArtists(userId);

        // Sélectionner aléatoirement des artistes pour les questions d'albums
        const selectedArtistsForAlbums = getRandomItems(topArtists, questionsPerType + (questionTypes[2] === 'album' ? remainingQuestions : 0));

        // Questions de type "artiste"
        for (let i = 0; i < questionsPerType + (questionTypes[0] === 'artist' ? remainingQuestions : 0); i++) {
            if (topTracks.length > i) {
                const track = topTracks[i];
                questions.push({
                    type: 'artist',
                    previewUrl: track.preview_url,
                    answer: track.artists[0].name,
                    artistName: track.artists[0].name,
                    albumCover: track.album.images[0]?.url
                });
            }
        }

        // Questions de type "chanson"
        for (let i = 0; i < questionsPerType + (questionTypes[1] === 'song' ? remainingQuestions : 0); i++) {
            if (topTracks.length > i + questionsPerType) {
                const track = topTracks[i + questionsPerType];
                questions.push({
                    type: 'song',
                    previewUrl: track.preview_url,
                    answer: track.name,
                    artistName: track.artists[0].name,
                    albumCover: track.album.images[0]?.url
                });
            }
        }

        // Questions de type "album"
        for (let i = 0; i < selectedArtistsForAlbums.length; i++) {
            try {
                const artist = selectedArtistsForAlbums[i];
                const albums = await getArtistAlbums(artist.id, userId);

                if (albums && albums.length > 0) {
                    const randomAlbum = albums[Math.floor(Math.random() * albums.length)];

                    questions.push({
                        type: 'album',
                        answer: randomAlbum.name,
                        artistName: artist.name,
                        albumCover: randomAlbum.images[0]?.url
                    });
                }
            } catch (error) {
                console.error(`Erreur lors de la récupération des albums pour l'artiste ${i}:`, error);
                continue;
            }
        }

        // S'assurer d'avoir suffisamment de questions
        if (questions.length < count) {
            // Compléter avec des questions génériques si nécessaire
            const sampleQuestions = getSampleQuestions(count - questions.length);
            return [...questions, ...sampleQuestions];
        }

        return getRandomItems(questions, count);
    } catch (error) {
        console.error('Erreur lors de la génération des questions Spotify:', error);
        // En cas d'erreur, revenir aux questions par défaut
        return getSampleQuestions(count);
    }
}

// Fonction utilitaire pour obtenir des éléments aléatoires d'un tableau
function getRandomItems(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// Fonction utilitaire pour obtenir des questions d'exemple
function getSampleQuestions(count) {
    // Même implémentation que dans server.js
    // (Ajoutez ici le même tableau de questions que dans server.js)
    const questions = [
        {
            id: '1',
            type: 'artist',
            previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
            answer: 'Daft Punk',
            artistName: 'Daft Punk',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2'
        },
        // ... autres questions d'exemple
    ];

    return getRandomItems(questions, count);
}