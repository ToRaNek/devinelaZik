// lib/enhancedSpotifyUtils.js
const prisma = require('./prisma');

/**
 * Obtient un jeton d'accès valide pour l'API Spotify
 */
async function getValidSpotifyToken(userId) {
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

        // Forcer le rafraîchissement si le jeton expire dans moins de 5 minutes
        if (!spotifyAccount.expires_at || spotifyAccount.expires_at <= now + 300) {
            console.log(`Le token est expiré ou expire bientôt, rafraîchissement nécessaire`);

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

                // Si l'erreur indique que le refresh token est invalide, on supprime le compte pour permettre une nouvelle liaison
                if (response.status === 400 || response.status === 403) {
                    await prisma.account.delete({
                        where: { id: spotifyAccount.id }
                    });
                    console.log(`Compte Spotify supprimé pour permettre une nouvelle liaison`);
                    throw new Error('Compte Spotify invalide, veuillez vous reconnecter');
                }

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
async function getUserTopTracks(userId, timeRange = 'medium_term', limit = 50) {
    try {
        console.log(`Récupération des titres préférés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${timeRange}`, {
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
 * Récupère les titres sauvegardés (likés) de l'utilisateur
 */
async function getUserSavedTracks(userId, limit = 50) {
    try {
        console.log(`Récupération des titres sauvegardés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/tracks?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des titres sauvegardés: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des titres sauvegardés: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} titres sauvegardés récupérés avec succès`);
        // Transformation pour avoir le même format que les autres fonctions
        return data.items.map(item => item.track);
    } catch (error) {
        console.error('Erreur lors de la récupération des titres sauvegardés:', error);
        throw error;
    }
}

/**
 * Récupère l'historique d'écoute récent de l'utilisateur
 */
async function getRecentlyPlayedTracks(userId, limit = 50) {
    try {
        console.log(`Récupération de l'historique d'écoute pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération de l'historique d'écoute: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération de l'historique d'écoute: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} titres récemment écoutés récupérés avec succès`);
        // Transformation pour avoir le même format que les autres fonctions
        return data.items.map(item => item.track);
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'historique d\'écoute:', error);
        throw error;
    }
}

/**
 * Récupère les artistes préférés de l'utilisateur
 */
async function getUserTopArtists(userId, timeRange = 'medium_term', limit = 50) {
    try {
        console.log(`Récupération des artistes préférés pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/top/artists?limit=${limit}&time_range=${timeRange}`, {
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
async function getArtistAlbums(artistId, userId) {
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
 * Récupère les playlists de l'utilisateur
 */
async function getUserPlaylists(userId, limit = 50) {
    try {
        console.log(`Récupération des playlists pour l'utilisateur ${userId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/me/playlists?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des playlists: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des playlists: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} playlists récupérées avec succès`);
        return data.items;
    } catch (error) {
        console.error('Erreur lors de la récupération des playlists:', error);
        throw error;
    }
}

/**
 * Récupère les pistes d'une playlist
 */
async function getPlaylistTracks(playlistId, userId, limit = 100) {
    try {
        console.log(`Récupération des pistes pour la playlist ${playlistId}`);
        const accessToken = await getValidSpotifyToken(userId);

        const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            console.error(`Échec lors de la récupération des pistes de la playlist: ${response.status} ${response.statusText}`);
            const errorBody = await response.text();
            console.error(`Réponse d'erreur: ${errorBody}`);
            throw new Error(`Échec lors de la récupération des pistes de la playlist: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`${data.items?.length || 0} pistes de playlist récupérées avec succès`);
        // Transformation pour avoir le même format que les autres fonctions
        return data.items.map(item => item.track).filter(track => track !== null);
    } catch (error) {
        console.error('Erreur lors de la récupération des pistes de la playlist:', error);
        throw error;
    }
}

/**
 * Génère des questions à choix multiples (QCM) à partir des données récupérées
 * @param {array} tracks - Liste de pistes
 * @param {array} artists - Liste d'artistes
 * @param {array} albums - Liste d'albums
 * @param {number} count - Nombre de questions à générer
 * @returns {array} - Questions générées
 */
function generateMultipleChoiceQuestions(tracks, artists, albums, count) {
    const questions = [];

    // Fonction utilitaire pour mélanger un tableau
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Fonction pour générer des options incorrectes uniques
    const generateWrongOptions = (correctOption, allOptions, count = 3) => {
        // Filtrer pour éviter les doublons et assurer au moins count+1 options
        const filteredOptions = allOptions.filter(opt =>
            opt.toLowerCase() !== correctOption.toLowerCase()
        );

        if (filteredOptions.length < count) {
            // Si pas assez d'options, compléter avec des options génériques
            const genericOptions = [
                "Inconnu", "Divers artistes", "Compilation", "Remix",
                "Version live", "Démo", "Session acoustique", "Single",
                "Extended Play", "B-Side", "Bonus Track"
            ];

            // Ajouter des options génériques jusqu'à atteindre count
            for (let i = 0; i < count - filteredOptions.length; i++) {
                filteredOptions.push(genericOptions[i % genericOptions.length]);
            }
        }

        // Mélanger et prendre les count premiers éléments
        return shuffleArray(filteredOptions).slice(0, count);
    };

    // Séparer les pistes avec et sans prévisualisation
    const tracksWithPreview = tracks.filter(track => track.preview_url);
    const tracksWithoutPreview = tracks.filter(track => !track.preview_url);

    console.log(`Pistes avec prévisualisation: ${tracksWithPreview.length}`);
    console.log(`Pistes sans prévisualisation: ${tracksWithoutPreview.length}`);

    // MODIFIÉ: Allouer 70% des questions aux chansons si possible
    const songPercentage = 0.7; // 70% des questions seront des chansons
    let songCount = Math.floor(count * songPercentage);
    const maxSongsAvailable = Math.min(songCount, tracksWithPreview.length);

    // Calculer combien de questions d'artistes et d'albums nous pouvons avoir
    const remainingCount = count - maxSongsAvailable;
    const artistCount = Math.ceil(remainingCount / 2);
    const albumCount = remainingCount - artistCount;

    // Réajuster si pas assez de ressources disponibles
    const finalSongCount = Math.min(maxSongsAvailable, tracksWithPreview.length);
    const finalArtistCount = Math.min(artistCount, artists.length);
    const finalAlbumCount = Math.min(albumCount, albums.length);

    console.log(`Distribution des questions: ${finalSongCount} chansons, ${finalArtistCount} artistes, ${finalAlbumCount} albums`);

    // 1. Questions sur les chansons (priorité)
    const selectedSongTracks = shuffleArray(tracksWithPreview).slice(0, finalSongCount);

    for (let i = 0; i < finalSongCount; i++) {
        if (i < selectedSongTracks.length) {
            const track = selectedSongTracks[i];
            const trackNames = tracks.map(t => t.name);
            const wrongOptions = generateWrongOptions(track.name, trackNames);

            questions.push({
                type: 'song',
                quizType: 'multiple_choice',
                question: `Quel est ce titre de ${track.artists[0].name} ?`,
                previewUrl: track.preview_url,
                answer: track.name,
                artistName: track.artists[0].name,
                albumCover: track.album.images[0]?.url,
                options: shuffleArray([track.name, ...wrongOptions])
            });
        }
    }

    // 2. Questions de type "artiste"
    for (let i = 0; i < finalArtistCount; i++) {
        if (artists && artists.length > i) {
            const artist = artists[i];

            // Chercher une piste avec preview pour cet artiste
            const artistTracksWithPreview = tracks.filter(track =>
                track.artists.some(a => a.id === artist.id) && track.preview_url
            );

            if (artistTracksWithPreview.length > 0) {
                const track = artistTracksWithPreview[Math.floor(Math.random() * artistTracksWithPreview.length)];
                const artistNames = artists.map(artist => artist.name);
                const wrongOptions = generateWrongOptions(artist.name, artistNames);

                questions.push({
                    type: 'artist',
                    quizType: 'multiple_choice',
                    question: "Qui est l'artiste de ce morceau ?",
                    previewUrl: track.preview_url,
                    answer: artist.name,
                    artistName: artist.name,
                    albumCover: track.album.images[0]?.url,
                    options: shuffleArray([artist.name, ...wrongOptions])
                });
            }
            // S'il n'y a pas de pistes avec preview, on passe au prochain artiste
        }
    }

    // 3. Questions sur les albums
    for (let i = 0; i < finalAlbumCount; i++) {
        if (albums && albums.length > i) {
            const album = albums[i];
            const albumNames = albums.map(album => album.name);
            const wrongOptions = generateWrongOptions(album.name, albumNames);

            // Trouver l'artiste de l'album
            const artistName = album.artists[0]?.name || "Artiste inconnu";

            questions.push({
                type: 'album',
                quizType: 'multiple_choice',
                question: `Quel est cet album de ${artistName} ?`,
                answer: album.name,
                artistName: artistName,
                albumCover: album.images[0]?.url,
                options: shuffleArray([album.name, ...wrongOptions])
            });
        }
    }

    // Si on n'a pas assez de questions, compléter avec des questions supplémentaires
    if (questions.length < count) {
        const remainingNeeded = count - questions.length;

        // Utiliser les pistes sans preview si nécessaire
        const availableTracks = [...tracksWithoutPreview, ...tracksWithPreview].filter(
            track => !selectedSongTracks.some(t => t.id === track.id)
        );

        for (let i = 0; i < remainingNeeded && i < availableTracks.length; i++) {
            const track = availableTracks[i];
            const trackNames = tracks.map(t => t.name);
            const wrongOptions = generateWrongOptions(track.name, trackNames);

            // Déterminer si on a une preview ou non
            const hasPreview = !!track.preview_url;

            questions.push({
                type: 'song',
                quizType: 'multiple_choice',
                question: `Quel est ce titre de ${track.artists[0].name} ?`,
                previewUrl: track.preview_url, // peut être null
                answer: track.name,
                artistName: track.artists[0].name,
                albumCover: track.album.images[0]?.url,
                options: shuffleArray([track.name, ...wrongOptions])
            });
        }
    }

    // Ajouter des IDs et numéros de rounds
    return shuffleArray(questions).map((q, index) => ({
        ...q,
        id: `q-${Date.now()}-${index}`,
        round: index + 1
    }));
}

/**
 * Génère des questions à réponse libre à partir des données récupérées
 * @param {array} tracks - Liste de pistes
 * @param {array} artists - Liste d'artistes
 * @param {array} albums - Liste d'albums
 * @param {number} count - Nombre de questions à générer
 * @returns {array} - Questions générées
 */
function generateFreeTextQuestions(tracks, artists, albums, count) {
    const questions = [];

    // Fonction utilitaire pour mélanger un tableau
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Séparer les pistes avec et sans prévisualisation
    const tracksWithPreview = tracks.filter(track => track.preview_url);
    const tracksWithoutPreview = tracks.filter(track => !track.preview_url);

    console.log(`Pistes avec prévisualisation: ${tracksWithPreview.length}`);
    console.log(`Pistes sans prévisualisation: ${tracksWithoutPreview.length}`);

    // MODIFIÉ: Allouer 70% des questions aux chansons si possible
    const songPercentage = 0.7; // 70% des questions seront des chansons
    let songCount = Math.floor(count * songPercentage);
    const maxSongsAvailable = Math.min(songCount, tracksWithPreview.length);

    // Calculer combien de questions d'artistes et d'albums nous pouvons avoir
    const remainingCount = count - maxSongsAvailable;
    const artistCount = Math.ceil(remainingCount / 2);
    const albumCount = remainingCount - artistCount;

    // Réajuster si pas assez de ressources disponibles
    const finalSongCount = Math.min(maxSongsAvailable, tracksWithPreview.length);
    const finalArtistCount = Math.min(artistCount, artists.length);
    const finalAlbumCount = Math.min(albumCount, albums.length);

    console.log(`Distribution des questions: ${finalSongCount} chansons, ${finalArtistCount} artistes, ${finalAlbumCount} albums`);

    // 1. Questions sur les chansons (priorité)
    const selectedSongTracks = shuffleArray(tracksWithPreview).slice(0, finalSongCount);

    for (let i = 0; i < finalSongCount; i++) {
        if (i < selectedSongTracks.length) {
            const track = selectedSongTracks[i];

            questions.push({
                type: 'song',
                quizType: 'free_text',
                question: `Quel est ce titre de ${track.artists[0].name} ?`,
                previewUrl: track.preview_url,
                answer: track.name,
                artistName: track.artists[0].name,
                albumCover: track.album.images[0]?.url,
                // Format d'indentation pour l'auto-complétion
                displayFormat: `${track.name} (${track.artists[0].name})`
            });
        }
    }

    // 2. Questions de type "artiste"
    for (let i = 0; i < finalArtistCount; i++) {
        if (artists && artists.length > i) {
            const artist = artists[i];

            // Chercher une piste avec preview pour cet artiste
            const artistTracksWithPreview = tracks.filter(track =>
                track.artists.some(a => a.id === artist.id) && track.preview_url
            );

            if (artistTracksWithPreview.length > 0) {
                const track = artistTracksWithPreview[Math.floor(Math.random() * artistTracksWithPreview.length)];

                questions.push({
                    type: 'artist',
                    quizType: 'free_text',
                    question: "Quel est le nom de cet artiste ?",
                    previewUrl: track.preview_url,
                    answer: artist.name,
                    artistName: artist.name,
                    albumCover: track.album.images[0]?.url,
                    displayFormat: artist.name
                });
            }
            // S'il n'y a pas de pistes avec preview, on passe au prochain artiste
        }
    }

    // 3. Questions sur les albums
    for (let i = 0; i < finalAlbumCount; i++) {
        if (albums && albums.length > i) {
            const album = albums[i];

            // Trouver l'artiste de l'album
            const artistName = album.artists[0]?.name || "Artiste inconnu";

            questions.push({
                type: 'album',
                quizType: 'free_text',
                question: `Quel est cet album de ${artistName} ?`,
                answer: album.name,
                artistName: artistName,
                albumCover: album.images[0]?.url,
                // Format d'indentation pour l'auto-complétion
                displayFormat: `${album.name} (${artistName})`
            });
        }
    }

    // Si on n'a pas assez de questions, compléter avec des questions supplémentaires
    if (questions.length < count) {
        const remainingNeeded = count - questions.length;

        // Utiliser les pistes sans preview si nécessaire
        const availableTracks = [...tracksWithoutPreview, ...tracksWithPreview].filter(
            track => !selectedSongTracks.some(t => t.id === track.id)
        );

        for (let i = 0; i < remainingNeeded && i < availableTracks.length; i++) {
            const track = availableTracks[i];

            questions.push({
                type: 'song',
                quizType: 'free_text',
                question: `Quel est ce titre de ${track.artists[0].name} ?`,
                previewUrl: track.preview_url, // peut être null
                answer: track.name,
                artistName: track.artists[0].name,
                albumCover: track.album.images[0]?.url,
                displayFormat: `${track.name} (${track.artists[0].name})`
            });
        }
    }

    // Ajouter des IDs et numéros de rounds
    return shuffleArray(questions).map((q, index) => ({
        ...q,
        id: `q-${Date.now()}-${index}`,
        round: index + 1
    }));
}

/**
 * Fonction principale pour générer des questions à partir des données Spotify
 * @param {string} userId - ID de l'utilisateur
 * @param {number} count - Nombre de questions à générer
 * @param {string} quizType - Type de quiz: 'multiple_choice' ou 'free_text'
 */
async function generateEnhancedQuestions(userId, count = 10, quizType = 'multiple_choice') {
    try {
        console.log(`Génération de ${count} questions de type ${quizType} pour l'utilisateur ${userId}`);

        // Collecter les données de différentes sources
        let allTracks = [];
        let allArtists = [];
        let allAlbums = [];

        // Récupérer les titres préférés (court, moyen et long terme)
        try {
            // Court terme (4 semaines)
            const shortTermTracks = await getUserTopTracks(userId, 'short_term', 50);
            if (shortTermTracks && shortTermTracks.length > 0) {
                allTracks = [...allTracks, ...shortTermTracks];
                console.log(`Ajout de ${shortTermTracks.length} titres préférés (court terme)`);
            }

            // Moyen terme (6 mois)
            const mediumTermTracks = await getUserTopTracks(userId, 'medium_term', 50);
            if (mediumTermTracks && mediumTermTracks.length > 0) {
                // Éviter les doublons en vérifiant les IDs
                const newTracks = mediumTermTracks.filter(track =>
                    !allTracks.some(t => t.id === track.id)
                );
                allTracks = [...allTracks, ...newTracks];
                console.log(`Ajout de ${newTracks.length} titres préférés (moyen terme)`);
            }

            // Long terme (plusieurs années)
            const longTermTracks = await getUserTopTracks(userId, 'long_term', 50);
            if (longTermTracks && longTermTracks.length > 0) {
                // Éviter les doublons
                const newTracks = longTermTracks.filter(track =>
                    !allTracks.some(t => t.id === track.id)
                );
                allTracks = [...allTracks, ...newTracks];
                console.log(`Ajout de ${newTracks.length} titres préférés (long terme)`);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des titres préférés:", error);
        }

        // Récupérer les titres sauvegardés (likés)
        try {
            const savedTracks = await getUserSavedTracks(userId, 50);
            if (savedTracks && savedTracks.length > 0) {
                // Éviter les doublons
                const newTracks = savedTracks.filter(track =>
                    !allTracks.some(t => t.id === track.id)
                );
                allTracks = [...allTracks, ...newTracks];
                console.log(`Ajout de ${newTracks.length} titres sauvegardés`);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des titres sauvegardés:", error);
        }

        // Récupérer l'historique d'écoute récent
        try {
            const recentTracks = await getRecentlyPlayedTracks(userId, 50);
            if (recentTracks && recentTracks.length > 0) {
                // Éviter les doublons
                const newTracks = recentTracks.filter(track =>
                    !allTracks.some(t => t.id === track.id)
                );
                allTracks = [...allTracks, ...newTracks];
                console.log(`Ajout de ${newTracks.length} titres récemment écoutés`);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération de l'historique d'écoute:", error);
        }

        // Récupérer les playlists et leurs titres
        try {
            const playlists = await getUserPlaylists(userId, 10);
            if (playlists && playlists.length > 0) {
                // Prendre les 5 premières playlists maximum pour éviter de surcharger l'API
                const limitedPlaylists = playlists.slice(0, 5);

                for (const playlist of limitedPlaylists) {
                    try {
                        const playlistTracks = await getPlaylistTracks(playlist.id, userId, 30);
                        if (playlistTracks && playlistTracks.length > 0) {
                            // Éviter les doublons
                            const newTracks = playlistTracks.filter(track =>
                                track && !allTracks.some(t => t.id === track.id)
                            );
                            allTracks = [...allTracks, ...newTracks];
                            console.log(`Ajout de ${newTracks.length} titres de la playlist "${playlist.name}"`);
                        }
                    } catch (playlistError) {
                        console.error(`Erreur lors de la récupération des titres de la playlist ${playlist.name}:`, playlistError);
                        continue;
                    }
                }
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des playlists:", error);
        }

        // Récupérer les artistes préférés
        try {
            // Court terme
            const shortTermArtists = await getUserTopArtists(userId, 'short_term', 50);
            if (shortTermArtists && shortTermArtists.length > 0) {
                allArtists = [...allArtists, ...shortTermArtists];
                console.log(`Ajout de ${shortTermArtists.length} artistes préférés (court terme)`);
            }

            // Moyen terme
            const mediumTermArtists = await getUserTopArtists(userId, 'medium_term', 50);
            if (mediumTermArtists && mediumTermArtists.length > 0) {
                // Éviter les doublons
                const newArtists = mediumTermArtists.filter(artist =>
                    !allArtists.some(a => a.id === artist.id)
                );
                allArtists = [...allArtists, ...newArtists];
                console.log(`Ajout de ${newArtists.length} artistes préférés (moyen terme)`);
            }

            // Long terme
            const longTermArtists = await getUserTopArtists(userId, 'long_term', 50);
            if (longTermArtists && longTermArtists.length > 0) {
                // Éviter les doublons
                const newArtists = longTermArtists.filter(artist =>
                    !allArtists.some(a => a.id === artist.id)
                );
                allArtists = [...allArtists, ...newArtists];
                console.log(`Ajout de ${newArtists.length} artistes préférés (long terme)`);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des artistes préférés:", error);
        }

        // Récupérer les albums des artistes préférés
        try {
            // Limiter à 10 artistes pour éviter de surcharger l'API
            const limitedArtists = allArtists.slice(0, 10);

            for (const artist of limitedArtists) {
                try {
                    const artistAlbums = await getArtistAlbums(artist.id, userId);
                    if (artistAlbums && artistAlbums.length > 0) {
                        // Éviter les doublons
                        const newAlbums = artistAlbums.filter(album =>
                            !allAlbums.some(a => a.id === album.id)
                        );
                        allAlbums = [...allAlbums, ...newAlbums];
                        console.log(`Ajout de ${newAlbums.length} albums de ${artist.name}`);
                    }
                } catch (albumError) {
                    console.error(`Erreur lors de la récupération des albums de ${artist.name}:`, albumError);
                    continue;
                }
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des albums:", error);
        }

        // Extraire les albums des pistes
        const trackAlbums = allTracks.map(track => track.album)
            .filter((album, index, self) =>
                index === self.findIndex(a => a.id === album.id)
            );

        // Ajouter les albums extraits des pistes (s'ils ne sont pas déjà présents)
        const newTrackAlbums = trackAlbums.filter(album =>
            !allAlbums.some(a => a.id === album.id)
        );

        allAlbums = [...allAlbums, ...newTrackAlbums];
        console.log(`Ajout de ${newTrackAlbums.length} albums extraits des pistes`);

        console.log(`Données collectées: ${allTracks.length} pistes, ${allArtists.length} artistes, ${allAlbums.length} albums`);

        // Vérifier si nous avons suffisamment de données
        if (allTracks.length < 5 && allArtists.length < 5) {
            console.warn("Pas assez de données collectées, utilisation des questions d'exemple");
            return getSampleQuestions(count, quizType);
        }

        // Compte le nombre de pistes avec prévisualisation
        const tracksWithPreview = allTracks.filter(track => track.preview_url);
        console.log(`Pistes avec prévisualisation: ${tracksWithPreview.length}/${allTracks.length}`);

        // Générer les questions selon le type de quiz
        let questions = [];
        if (quizType === 'multiple_choice') {
            questions = generateMultipleChoiceQuestions(allTracks, allArtists, allAlbums, count);
        } else {
            questions = generateFreeTextQuestions(allTracks, allArtists, allAlbums, count);
        }

        console.log(`${questions.length} questions générées avec succès`);
        console.log(`Dont ${questions.filter(q => q.type === 'song').length} questions de type "song"`);
        console.log(`Dont ${questions.filter(q => q.previewUrl).length} questions avec prévisualisation audio`);

        // S'assurer d'avoir suffisamment de questions
        if (questions.length < count) {
            console.warn(`Seulement ${questions.length}/${count} questions générées, complément avec des questions d'exemple`);
            // Compléter avec des questions génériques si nécessaire
            const sampleQuestions = getSampleQuestions(count - questions.length, quizType);
            questions = [...questions, ...sampleQuestions];
        }

        return questions;
    } catch (error) {
        console.error('Erreur lors de la génération des questions:', error);
        // En cas d'erreur, revenir aux questions par défaut
        return getSampleQuestions(count, quizType);
    }
}

/**
 * Fonction utilitaire pour obtenir des questions d'exemple
 * @param {number} count - Nombre de questions
 * @param {string} quizType - Type de quiz
 */
function getSampleQuestions(count, quizType = 'multiple_choice') {
    // Questions d'exemple avec les deux formats (QCM et texte libre)
    const sampleQuestions = [
        // Format QCM
        {
            id: '1',
            type: 'artist',
            quizType: 'multiple_choice',
            question: "Qui est l'artiste de ce morceau ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
            answer: 'Daft Punk',
            artistName: 'Daft Punk',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
            options: ['Daft Punk', 'Justice', 'Kavinsky', 'The Chemical Brothers']
        },
        {
            id: '2',
            type: 'song',
            quizType: 'multiple_choice',
            question: "Quel est ce titre de Queen ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
            answer: 'Bohemian Rhapsody',
            artistName: 'Queen',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e',
            options: ['Bohemian Rhapsody', 'We Will Rock You', 'Radio Ga Ga', 'Under Pressure']
        },
        {
            id: '3',
            type: 'album',
            quizType: 'multiple_choice',
            question: "Quel est cet album de Michael Jackson ?",
            answer: 'Thriller',
            artistName: 'Michael Jackson',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b2734121faee8df82c526cbab2be',
            options: ['Thriller', 'Bad', 'Dangerous', 'Off the Wall']
        },

        // Format texte libre
        {
            id: '4',
            type: 'artist',
            quizType: 'free_text',
            question: "Quel est le nom de cet artiste ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
            answer: 'Billie Eilish',
            artistName: 'Billie Eilish',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e',
            displayFormat: 'Billie Eilish'
        },
        {
            id: '5',
            type: 'song',
            quizType: 'free_text',
            question: "Quel est ce titre de The Weeknd ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/452de87e6104ded50e674050d56c7269336a3fe9',
            answer: 'Blinding Lights',
            artistName: 'The Weeknd',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b27348a42a53ea8e0d9e98423a6d',
            displayFormat: 'Blinding Lights (The Weeknd)'
        },
        {
            id: '6',
            type: 'album',
            quizType: 'free_text',
            question: "Quel est cet album de Pink Floyd ?",
            answer: 'The Dark Side of the Moon',
            artistName: 'Pink Floyd',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273ea7caaff71dea1051d49b2fe',
            displayFormat: 'The Dark Side of the Moon (Pink Floyd)'
        },
        {
            id: '7',
            type: 'artist',
            quizType: 'free_text',
            question: "Quel est le nom de cet artiste ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/77a5b67f66c1f18353ea5afc6e8628c145267d4a',
            answer: 'Kendrick Lamar',
            artistName: 'Kendrick Lamar',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b2732e8ed79e177ff6011076f5f0',
            displayFormat: 'Kendrick Lamar'
        },
        {
            id: '8',
            type: 'song',
            quizType: 'free_text',
            question: "Quel est ce titre de John Lennon ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/7df27a9a6ac1d6c8767b61b38dc37ba5cfa3f19c',
            answer: 'Imagine',
            artistName: 'John Lennon',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b2736750daf5f4576e3c25d5c7aa',
            displayFormat: 'Imagine (John Lennon)'
        },
        {
            id: '9',
            type: 'album',
            quizType: 'free_text',
            question: "Quel est cet album de Nirvana ?",
            answer: 'Nevermind',
            artistName: 'Nirvana',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b27336c5417732e53e23cb219246',
            displayFormat: 'Nevermind (Nirvana)'
        },
        {
            id: '10',
            type: 'artist',
            quizType: 'free_text',
            question: "Quel est le nom de cet artiste ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/8de4f9d9671c42e7e6f3ecf0edcba3f08d5593f2',
            answer: 'Taylor Swift',
            artistName: 'Taylor Swift',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273e0b64c8be3c4e804abcb2696',
            displayFormat: 'Taylor Swift'
        },
        {
            id: '11',
            type: 'song',
            quizType: 'multiple_choice',
            question: "Quel est ce titre de Daft Punk ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/3eb16018c2a700240e9dfb5a3f1834af7c33a128',
            answer: 'Get Lucky',
            artistName: 'Daft Punk',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273b33d46dfa2635a47eebf63b2',
            options: ['Get Lucky', 'Around the World', 'One More Time', 'Harder, Better, Faster, Stronger']
        },
        {
            id: '12',
            type: 'album',
            quizType: 'multiple_choice',
            question: "Quel est cet album des Beatles ?",
            answer: 'Abbey Road',
            artistName: 'The Beatles',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273dc30583ba717007b00cceb25',
            options: ['Abbey Road', 'Sgt. Pepper\'s Lonely Hearts Club Band', 'Revolver', 'The White Album']
        },
        {
            id: '13',
            type: 'artist',
            quizType: 'multiple_choice',
            question: "Qui est l'artiste de ce morceau ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/5a12483aa3b51331aba663131dbac8c26a4e9aef',
            answer: 'Queen',
            artistName: 'Queen',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b273d254ca498b52d66b80085a1e',
            options: ['Queen', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones']
        },
        {
            id: '14',
            type: 'song',
            quizType: 'multiple_choice',
            question: "Quel est ce titre de Billie Eilish ?",
            previewUrl: 'https://p.scdn.co/mp3-preview/0c068b0d5b1d4afb4ce01c731eddfe271a4ab5bb',
            answer: 'Bad Guy',
            artistName: 'Billie Eilish',
            albumCover: 'https://i.scdn.co/image/ab67616d0000b2732a038d3bf875d23e4aeaa84e',
            options: ['Bad Guy', 'Bury a Friend', 'Ocean Eyes', 'When the Party\'s Over']
        }
    ];

    // Séparer et prioriser les questions de type "song" avec previewUrl
    const songQuestionsWithPreview = sampleQuestions.filter(q =>
        q.type === 'song' && q.previewUrl && q.quizType === quizType
    );
    const otherQuestions = sampleQuestions.filter(q =>
        !(q.type === 'song' && q.previewUrl && q.quizType === quizType)
        && q.quizType === quizType
    );

    // S'assurer que 70% des questions sont des chansons avec preview si possible
    const targetSongCount = Math.min(Math.ceil(count * 0.7), songQuestionsWithPreview.length);
    const targetOtherCount = count - targetSongCount;

    // Fonction utilitaire pour mélanger un tableau
    const shuffleArray = (array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Sélectionner et mélanger les questions
    const shuffledSongs = shuffleArray(songQuestionsWithPreview).slice(0, targetSongCount);
    const shuffledOthers = shuffleArray(otherQuestions).slice(0, targetOtherCount);

    // Combiner et remélanger
    let finalQuestions = shuffleArray([...shuffledSongs, ...shuffledOthers]);

    // Si on n'a toujours pas assez de questions, ajouter des questions de l'autre type de quiz
    if (finalQuestions.length < count) {
        const otherTypeQuestions = sampleQuestions.filter(q => q.quizType !== quizType);
        const additionalNeeded = count - finalQuestions.length;
        const additionalQuestions = shuffleArray(otherTypeQuestions).slice(0, additionalNeeded);

        // Modifier le type de quiz pour ces questions supplémentaires
        additionalQuestions.forEach(q => {
            q.quizType = quizType;

            // Adapter les options pour le type de quiz si nécessaire
            if (quizType === 'multiple_choice' && !q.options) {
                // Générer des options si c'était une question à texte libre
                const allOptions = [q.answer];
                const genericOptions = ['Option A', 'Option B', 'Option C', 'Option D'];

                q.options = shuffleArray([...allOptions, ...genericOptions.slice(0, 3)]);
            } else if (quizType === 'free_text' && !q.displayFormat) {
                // Ajouter un format d'affichage si c'était une question à choix multiple
                q.displayFormat = q.type === 'song' ?
                    `${q.answer} (${q.artistName})` :
                    q.answer;
            }
        });

        finalQuestions = [...finalQuestions, ...additionalQuestions];
    }

    // Mettre à jour les numéros de rounds et assurer un maximum de count questions
    return finalQuestions.slice(0, count).map((q, index) => ({
        ...q,
        round: index + 1
    }));
}

// Exporter les fonctions
module.exports = {
    getValidSpotifyToken,
    getUserTopTracks,
    getUserSavedTracks,
    getRecentlyPlayedTracks,
    getUserTopArtists,
    getArtistAlbums,
    getUserPlaylists,
    getPlaylistTracks,
    generateEnhancedQuestions,
    getSampleQuestions
};