// lib/simpleCacheService.js
const fs = require('fs');
const path = require('path');

class SimpleCacheService {
    constructor() {
        // Chemin du cache - identique à celui utilisé dans le test fonctionnel
        this.cacheDir = '/app/host-cache';
        this.cacheFile = path.join(this.cacheDir, 'music-cache.json');

        // Initialisation immédiate
        this.init();
    }

    init() {
        // Logs très explicites pour le débogage
        console.log(`[CACHE] Initialisation du cache: ${this.cacheFile}`);

        // Vérifier/créer le répertoire
        if (!fs.existsSync(this.cacheDir)) {
            console.log(`[CACHE] Création du répertoire: ${this.cacheDir}`);
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }

        // Créer un fichier JSON vide s'il n'existe pas
        if (!fs.existsSync(this.cacheFile)) {
            console.log(`[CACHE] Création du fichier cache JSON: ${this.cacheFile}`);
            fs.writeFileSync(this.cacheFile, JSON.stringify({}, null, 2));

            // Créer aussi un fichier CSV pour les humains
            const csvFile = path.join(this.cacheDir, 'music-cache.csv');
            fs.writeFileSync(csvFile, 'artist,track,url\n');
            console.log(`[CACHE] Création du fichier cache CSV: ${csvFile}`);
        }

        console.log(`[CACHE] Initialisation terminée`);
    }

    getCache() {
        // Lire le fichier de cache
        try {
            console.log(`[CACHE] Lecture du fichier cache: ${this.cacheFile}`);
            const data = fs.readFileSync(this.cacheFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`[CACHE] Erreur de lecture: ${error.message}`);
            return {};
        }
    }

    get(artist, track) {
        const cache = this.getCache();
        const key = `${artist}::${track}`.toLowerCase();

        if (cache[key]) {
            console.log(`[CACHE] Cache HIT pour ${artist} - ${track}`);
            return cache[key];
        }

        console.log(`[CACHE] Cache MISS pour ${artist} - ${track}`);
        return null;
    }

    set(artist, track, url) {
        if (!url) {
            console.log(`[CACHE] URL vide, pas de mise en cache pour ${artist} - ${track}`);
            return false;
        }

        try {
            // Lire le cache actuel
            const cache = this.getCache();

            // Ajouter l'entrée
            const key = `${artist}::${track}`.toLowerCase();
            cache[key] = {
                url,
                timestamp: Date.now()
            };

            // Sauvegarder le JSON
            console.log(`[CACHE] Sauvegarde de l'entrée pour ${artist} - ${track}`);
            fs.writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));

            // Ajouter au CSV aussi
            const csvFile = path.join(this.cacheDir, 'music-cache.csv');
            const csvLine = `"${artist.replace(/"/g, '""')}","${track.replace(/"/g, '""')}","${url.replace(/"/g, '""')}"\n`;
            fs.appendFileSync(csvFile, csvLine);

            console.log(`[CACHE] Cache mis à jour pour ${artist} - ${track}`);
            return true;
        } catch (error) {
            console.error(`[CACHE] Erreur d'écriture: ${error.message}`);
            return false;
        }
    }
}

module.exports = new SimpleCacheService();