// lib/spotifyUtils.js
import prisma from './prisma';

/**
 * Obtient un jeton d'accès valide pour l'API Spotify
 */
export async function getValidSpotifyToken(userId) {
    try {
        console.log(`Récupération du token Spotify pour l'utilisateur ${userId}`);

        // Recherche du compte Spotify de l'utilisateur
        const spotifyAccount = await prisma.account.findFirst({
            where: {
                userId: userId,
                provider: 'spotify'
            }
        });

        if (!spotifyAccount) {
            console.log(`Aucun compte Spotify lié pour l'utilisateur ${userId}`);
            throw new Error('Aucun compte Spotify lié');
        }

        // Vérifier si le jeton est expiré
        const now = Math.floor(Date.now() / 1000);
        console.log(`Temps actuel: ${now}, expiration du token: ${spotifyAccount.expires_at}`);

        if (!spotifyAccount.expires_at || spotifyAccount.expires_at <= now) {
            console.log(`Le token est expiré ou l'expiration n'est pas définie, rafraîchissement nécessaire`);

            // Vérifier si nous avons un refresh token
            if (!spotifyAccount.refresh_token) {
                console.error(`Pas de refresh token disponible pour l'utilisateur ${userId}`);
                throw new Error('Pas de refresh token disponible');
            }

            // Le jeton est expiré, il faut le rafraîchir
            console.log(`Rafraîchissement du token en cours...`);

            // Préparer l'encodage Basic pour l'authentification
            const basic = Buffer.from(
                `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64');

            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${basic}`
                },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    refresh_token: spotifyAccount.refresh_token
                })
            });

            if (!response.ok) {
                console.error(`Échec lors du rafraîchissement du token: ${response.status} ${response.statusText}`);
                // Log de la réponse pour le débogage
                const errorBody = await response.text();
                console.error(`Réponse d'erreur: ${errorBody}`);
                throw new Error(`Échec lors du rafraîchissement du jeton Spotify: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log(`Token rafraîchi avec succès, nouveau token obtenu`);

            // Mettre à jour le jeton dans la base de données
            const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
            await prisma.account.update({
                where: { id: spotifyAccount.id },
                data: {
                    access_token: data.access_token,
                    expires_at: expiresAt,
                    // Mettre à jour le refresh_token s'il est fourni dans la réponse
                    ...(data.refresh_token && { refresh_token: data.refresh_token })
                }
            });

            console.log(`Token mis à jour dans la base de données, expire à ${expiresAt}`);
            return data.access_token;
        }

        console.log(`Utilisation du token existant, il est encore valide`);
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
        console.log(`Récupération des titres préférés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des titres préférés: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des titres préférés: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} titres préférés récupérés avec succès`);
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
        console.log(`Récupération des artistes préférés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch('https://api.spotify.com/v1/me/top/artists?limit=50&time_range=medium_term', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des artistes préférés: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des artistes préférés: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} artistes préférés récupérés avec succès`);
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
        console.log(`Récupération des albums pour l'artiste ${artistId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/artists/${artistId}/albums?include_groups=album&limit=50`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des albums: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des albums: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} albums récupérés avec succès`);
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
        console.log(`Génération de ${count} questions à partir de Spotify pour l'utilisateur ${userId}`);

        // Mélanger les types de questions
        const questionTypes = ['artist', 'song', 'album'];

        // Répartir le nombre de questions par type
        const questionsPerType = Math.floor(count / questionTypes.length);
        let remainingQuestions = count - (questionsPerType * questionTypes.length);

        const questions = [];

        try {
            // Récupérer les titres et artistes préférés
            const topTracks = await getUserTopTracks(userId);
            const topArtists = await getUserTopArtists(userId);

            console.log(`Récupéré ${topTracks?.length || 0} titres et ${topArtists?.length || 0} artistes`);

            // Sélectionner aléatoirement des artistes pour les questions d'albums
            const selectedArtistsForAlbums = getRandomItems(topArtists || [], questionsPerType + (questionTypes[2] === 'album' ? remainingQuestions : 0));

            // Questions de type "artiste"
            for (let i = 0; i < questionsPerType + (questionTypes[0] === 'artist' ? remainingQuestions : 0); i++) {
                if (topTracks && topTracks.length > i) {
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
                if (topTracks && topTracks.length > i + questionsPerType) {
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
        } catch (error) {
            console.error(`Erreur lors de la récupération des données Spotify:`, error);
            // En cas d'erreur avec l'API Spotify, continuer avec les questions d'exemple
        }

        // S'assurer d'avoir suffisamment de questions
        if (questions.length < count) {
            console.log(`Pas assez de questions (${questions.length}/${count}), complément avec des questions génériques`);
            // Compléter avec des questions génériques si nécessaire
            const sampleQuestions = getSampleQuestions(count - questions.length);
            return [...questions, ...sampleQuestions];
        }

        console.log(`${questions.length} questions générées avec succès`);
        return getRandomItems(questions, count);
    } catch (error) {
        console.error('Erreur lors de la génération des questions Spotify:', error);
        // En cas d'erreur, revenir aux questions par défaut
        return getSampleQuestions(count);
    }
}

// Fonction utilitaire pour obtenir des éléments aléatoires d'un tableau
function getRandomItems(array, count) {
    if (!array || array.length === 0) return [];
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, shuffled.length));
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
        }
    ];

    console.log(`Retourne ${count} questions d'exemple`);
    return getRandomItems(questions, count);
}