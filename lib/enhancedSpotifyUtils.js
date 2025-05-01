// lib/enhancedSpotifyUtils.js

/**
 * Génère des questions à choix multiples à partir des données récupérées
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

    // Allouer 70% des questions aux chansons si possible
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

    // Allouer 70% des questions aux chansons si possible
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

module.exports = {
    generateMultipleChoiceQuestions,
    generateFreeTextQuestions
};