// lib/spotifyAdapter.js
/**
 * Cette fonction crée un adaptateur personnalisé pour l'authentification Spotify
 * qui contourne les problèmes courants avec l'API Spotify.
 */
export function createSpotifyProvider(config) {
    return {
        id: "spotify",
        name: "Spotify",
        type: "oauth",
        wellKnown: null, // Désactiver le wellKnown pour éviter les erreurs
        authorization: {
            url: "https://accounts.spotify.com/authorize", // URL explicite d'autorisation
            params: {
                scope: "user-read-email user-top-read user-read-private",
            }
        },
        token: {
            url: "https://accounts.spotify.com/api/token",
        },
        userinfo: {
            url: "https://api.spotify.com/v1/me",
        },
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        profile(profile) {
            console.log("Formatting Spotify profile");
            return {
                id: profile.id,
                name: profile.display_name || profile.id,
                email: profile.email,
                image: profile.images?.[0]?.url || null,
            };
        },
        style: {
            logo: "/spotify.svg",
            text: "#2ebd59",
            bg: "#fff",
        },
    };
}