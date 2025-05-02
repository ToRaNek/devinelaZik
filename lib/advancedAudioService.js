// lib/advancedAudioService.js
const audioPreviewService = require('./audioPreviewService');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Promisify des fonctions fs
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const access = promisify(fs.access);

/**
 * Service audio avancé avec mise en cache, parallélisation et reprise sur erreur
 */
class AdvancedAudioService {
    constructor(options = {}) {
        // Répertoire de cache (par défaut ./cache/audio)
        this.cacheDir = options.cacheDir || path.join(process.cwd(), 'cache', 'audio');

        // Durée de validité du cache (par défaut 7 jours)
        this.cacheTTL = options.cacheTTL || 7 * 24 * 60 * 60 * 1000;

        // Nombre maximal de requêtes parallèles
        this.maxParallel = options.maxParallel || 5;

        // File d'attente des requêtes
        this.queue = [];

        // Requêtes en cours
        this.activeRequests = 0;

        // Cache en mémoire
        this.memoryCache = new Map();

        // Initialiser le cache
        this.initCache();
    }

    /**
     * Initialise le répertoire de cache
     */
    async initCache() {
        try {
            await mkdir(this.cacheDir, { recursive: true });
            console.log(`Cache initialisé: ${this.cacheDir}`);
        } catch (error) {
            console.warn(`Impossible de créer le répertoire de cache: ${error.message}`);
        }
    }

    /**
     * Génère une clé de cache à partir des paramètres de recherche
     * @param {string} artistName - Nom de l'artiste
     * @param {string} trackName - Nom de la piste (optionnel)
     * @returns {string} - Clé de cache
     */
    getCacheKey(artistName, trackName = '') {
        const input = `${artistName.toLowerCase()}|${trackName.toLowerCase()}`;
        return crypto.createHash('md5').update(input).digest('hex');
    }

    /**
     * Vérifie si une donnée est en cache et valide
     * @param {string} cacheKey - Clé de cache
     * @returns {Promise<Object|null>} - Données en cache ou null
     */
    async getFromCache(cacheKey) {
        // Vérifier d'abord le cache en mémoire (plus rapide)
        if (this.memoryCache.has(cacheKey)) {
            const cachedData = this.memoryCache.get(cacheKey);

            // Vérifier si les données sont encore valides
            if (Date.now() - cachedData.timestamp < this.cacheTTL) {
                return cachedData.data;
            }

            // Supprimer du cache en mémoire si expiré
            this.memoryCache.delete(cacheKey);
        }

        // Ensuite vérifier le cache sur disque
        const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);

        try {
            // Vérifier si le fichier existe
            await access(cacheFile, fs.constants.R_OK);

            // Lire le fichier
            const rawData = await readFile(cacheFile, 'utf8');
            const cachedData = JSON.parse(rawData);

            // Vérifier si les données sont encore valides
            if (Date.now() - cachedData.timestamp < this.cacheTTL) {
                // Mettre en cache mémoire pour accès plus rapide
                this.memoryCache.set(cacheKey, cachedData);
                return cachedData.data;
            }
        } catch (error) {
            // Fichier non trouvé ou autre erreur, ignorer
        }

        return null;
    }

    /**
     * Enregistre des données dans le cache
     * @param {string} cacheKey - Clé de cache
     * @param {Object} data - Données à mettre en cache
     */
    async saveToCache(cacheKey, data) {
        // Ne rien mettre en cache si les données sont null
        if (!data) return;

        const cachedData = {
            timestamp: Date.now(),
            data: data
        };

        // Mettre en cache mémoire
        this.memoryCache.set(cacheKey, cachedData);

        // Et aussi sur disque
        try {
            const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
            await writeFile(cacheFile, JSON.stringify(cachedData));
        } catch (error) {
            console.warn(`Impossible d'écrire dans le cache: ${error.message}`);
        }
    }

    /**
     * Ajoute une requête à la file d'attente et la traite quand possible
     * @param {Function} requestFunc - Fonction qui effectue la requête
     * @returns {Promise<any>} - Résultat de la requête
     */
    async enqueueRequest(requestFunc) {
        return new Promise((resolve, reject) => {
            const task = async () => {
                this.activeRequests++;

                try {
                    const result = await requestFunc();
                    resolve(result);
                } catch (error) {
                    reject(error);
                } finally {
                    this.activeRequests--;
                    this.processQueue();
                }
            };

            this.queue.push(task);
            this.processQueue();
        });
    }

    /**
     * Traite la file d'attente des requêtes
     */
    processQueue() {
        while (this.queue.length > 0 && this.activeRequests < this.maxParallel) {
            const task = this.queue.shift();
            task();
        }
    }

    /**
     * Obtient les métadonnées et l'URL d'aperçu audio pour une chanson
     * @param {string} artistName - Nom de l'artiste
     * @param {string} trackName - Nom de la piste
     * @param {Object} options - Options supplémentaires
     * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
     */
    async getSongPreview(artistName, trackName, options = {}) {
        const cacheKey = this.getCacheKey(artistName, trackName);

        // Vérifier le cache sauf si explicitement ignoré
        if (!options.skipCache) {
            const cachedData = await this.getFromCache(cacheKey);
            if (cachedData) {
                return cachedData;
            }
        }

        // Si pas en cache, faire la requête avec gestion de file d'attente
        const result = await this.enqueueRequest(async () => {
            try {
                return await audioPreviewService.getSongPreview(artistName, trackName);
            } catch (error) {
                console.error(`Erreur lors de la récupération de l'aperçu pour ${artistName} - ${trackName}:`, error);
                return null;
            }
        });

        // Mettre en cache si un résultat est trouvé
        if (result) {
            await this.saveToCache(cacheKey, result);
        }

        return result;
    }

    /**
     * Obtient les métadonnées et l'URL d'aperçu audio pour un artiste
     * @param {string} artistName - Nom de l'artiste
     * @param {Object} options - Options supplémentaires
     * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
     */
    async getArtistPreview(artistName, options = {}) {
        const cacheKey = this.getCacheKey(artistName);

        // Vérifier le cache sauf si explicitement ignoré
        if (!options.skipCache) {
            const cachedData = await this.getFromCache(cacheKey);
            if (cachedData) {
                return cachedData;
            }
        }

        // Si pas en cache, faire la requête avec gestion de file d'attente
        const result = await this.enqueueRequest(async () => {
            try {
                return await audioPreviewService.getArtistPreview(artistName);
            } catch (error) {
                console.error(`Erreur lors de la récupération de l'aperçu pour ${artistName}:`, error);
                return null;
            }
        });

        // Mettre en cache si un résultat est trouvé
        if (result) {
            await this.saveToCache(cacheKey, result);
        }

        return result;
    }

    /**
     * Précharge les aperçus audio pour un lot de questions
     * @param {Array} questions - Questions à précharger
     * @param {Function} progressCallback - Callback de progression
     * @returns {Promise<Array>} - Questions avec aperçus ajoutés
     */
    async preloadQuestionPreviews(questions, progressCallback = null) {
        const totalQuestions = questions.length;
        let processedCount = 0;
        let previewCount = 0;

        // Éviter de modifier les questions originales
        const enhancedQuestions = [...questions];

        // Traiter les questions par lots pour limiter la concurrence
        const batchSize = Math.min(10, this.maxParallel * 2);

        for (let i = 0; i < totalQuestions; i += batchSize) {
            const batch = enhancedQuestions.slice(i, i + batchSize);

            // Traiter le lot en parallèle
            await Promise.all(batch.map(async (question, index) => {
                // Ignorer si déjà un aperçu
                if (question.previewUrl) {
                    processedCount++;
                    previewCount++;

                    // Mettre à jour la progression
                    if (progressCallback) {
                        progressCallback({
                            processed: processedCount,
                            total: totalQuestions,
                            withPreview: previewCount
                        });
                    }
                    return;
                }

                // Pour les questions de type chanson ou artiste
                if ((question.type === 'song' || question.type === 'artist') && question.artistName) {
                    try {
                        // Rechercher l'aperçu selon le type
                        const audioPreview = question.type === 'song'
                            ? await this.getSongPreview(question.artistName, question.answer)
                            : await this.getArtistPreview(question.artistName);

                        if (audioPreview) {
                            // Ajouter les données d'aperçu à la question
                            if (audioPreview.directAudioUrl) {
                                question.previewUrl = audioPreview.directAudioUrl;
                                question.previewSource = 'youtube_direct';
                            } else if (audioPreview.embedUrl) {
                                question.previewUrl = audioPreview.embedUrl;
                                question.previewSource = 'youtube_embed';
                            }

                            // Ajouter les métadonnées
                            question.previewMetadata = {
                                videoId: audioPreview.videoId,
                                title: audioPreview.title,
                                channelName: audioPreview.channelName,
                                thumbnailUrl: audioPreview.thumbnailUrl
                            };

                            previewCount++;
                        }
                    } catch (error) {
                        console.error(`Erreur de préchargement pour la question ${i + index}:`, error);
                    }
                }

                processedCount++;

                // Mettre à jour la progression
                if (progressCallback) {
                    progressCallback({
                        processed: processedCount,
                        total: totalQuestions,
                        withPreview: previewCount
                    });
                }
            }));

            // Petite pause entre les lots pour éviter de surcharger les API
            if (i + batchSize < totalQuestions) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`Préchargement terminé: ${previewCount}/${totalQuestions} questions avec aperçus`);
        return enhancedQuestions;
    }

    /**
     * Vide le cache pour une entrée spécifique ou tout le cache
     * @param {string} artistName - Nom de l'artiste (optionnel)
     * @param {string} trackName - Nom de la piste (optionnel)
     */
    async clearCache(artistName = null, trackName = null) {
        if (artistName) {
            // Supprimer une entrée spécifique
            const cacheKey = this.getCacheKey(artistName, trackName || '');
            this.memoryCache.delete(cacheKey);

            try {
                const cacheFile = path.join(this.cacheDir, `${cacheKey}.json`);
                await fs.promises.unlink(cacheFile).catch(() => {});
            } catch (error) {
                // Ignorer les erreurs
            }
        } else {
            // Vider tout le cache
            this.memoryCache.clear();

            try {
                const files = await fs.promises.readdir(this.cacheDir);
                for (const file of files) {
                    if (file.endsWith('.json')) {
                        await fs.promises.unlink(path.join(this.cacheDir, file)).catch(() => {});
                    }
                }
            } catch (error) {
                console.error('Erreur lors du vidage du cache:', error);
            }
        }
    }
}

module.exports = new AdvancedAudioService();