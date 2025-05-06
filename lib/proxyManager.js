// lib/proxyManager.js
const { HttpsProxyAgent } = require('https-proxy-agent');
const proxyChain = require('proxy-chain');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

class ProxyManager {
    constructor() {
        this.proxies = [];
        this.bannedProxies = new Set();
        this.workingProxies = [];
        this.proxyAgents = {};
        this.currentProxyIndex = 0;
        this.lastRefresh = 0;
        this.refreshInterval = 30 * 60 * 1000; // 30 minutes
        this.proxyCachePath = path.join(process.cwd(), 'data', 'proxy-cache.json');

        // Configuration des sources de proxys
        this.proxySources = [
            'https://www.proxy-list.download/api/v1/get?type=http',
            'https://api.proxyscrape.com/v2/?request=getproxies&protocol=http&timeout=10000&country=all',
            'https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt',
            'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt',
            'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list.txt'
        ];

        // Proxys fiables qui seront toujours inclus s'ils sont disponibles
        this.reliableProxies = [
            // Format: 'http://username:password@ip:port'
            // Remplacez avec vos proxys privés si vous en avez
        ];
    }

    async init() {
        console.log('Initialisation du gestionnaire de proxys...');
        // Créer le dossier data s'il n'existe pas
        try {
            await fs.mkdir(path.join(process.cwd(), 'data'), { recursive: true });
        } catch (err) {
            console.log('Dossier data existe déjà ou erreur:', err.message);
        }

        // Essayer de charger le cache des proxys
        await this.loadProxyCache();

        // Si pas assez de proxys dans le cache ou cache trop ancien, rafraîchir
        if (this.proxies.length < 20 || Date.now() - this.lastRefresh > this.refreshInterval) {
            await this.refreshProxies();
        }

        console.log(`ProxyManager initialisé avec ${this.proxies.length} proxys`);
        return this;
    }

    async loadProxyCache() {
        try {
            const data = await fs.readFile(this.proxyCachePath, 'utf8');
            const cache = JSON.parse(data);
            this.proxies = cache.proxies || [];
            this.bannedProxies = new Set(cache.bannedProxies || []);
            this.workingProxies = cache.workingProxies || [];
            this.lastRefresh = cache.lastRefresh || 0;
            console.log(`Cache de proxys chargé: ${this.proxies.length} proxys, ${this.workingProxies.length} fonctionnels`);
        } catch (err) {
            console.log('Pas de cache de proxys ou erreur:', err.message);
            this.proxies = [];
            this.workingProxies = [];
            this.lastRefresh = 0;
        }
    }

    async saveProxyCache() {
        try {
            const cacheData = {
                proxies: this.proxies,
                bannedProxies: Array.from(this.bannedProxies),
                workingProxies: this.workingProxies,
                lastRefresh: this.lastRefresh
            };
            await fs.writeFile(this.proxyCachePath, JSON.stringify(cacheData, null, 2));
            console.log('Cache de proxys sauvegardé');
        } catch (err) {
            console.error('Erreur lors de la sauvegarde du cache de proxys:', err);
        }
    }

    async fetchFromSource(url) {
        try {
            console.log(`Récupération des proxys depuis ${url}...`);
            const response = await fetch(url, { timeout: 10000 });
            if (!response.ok) {
                throw new Error(`Erreur HTTP: ${response.status}`);
            }

            let text = await response.text();

            // Extraction des proxys (format IP:PORT)
            const proxyRegex = /\b(?:\d{1,3}\.){3}\d{1,3}:\d{2,5}\b/g;
            const matches = text.match(proxyRegex) || [];

            console.log(`Trouvé ${matches.length} proxys depuis ${url}`);
            return matches.map(proxy => `http://${proxy}`);
        } catch (err) {
            console.error(`Erreur récupération proxys depuis ${url}:`, err.message);
            return [];
        }
    }

    async refreshProxies() {
        console.log('Rafraîchissement de la liste de proxys...');

        // Récupérer les proxys de toutes les sources
        let allProxies = [];

        // Ajouter d'abord les proxys fiables
        allProxies.push(...this.reliableProxies);

        // Proxys à partir des sources en ligne
        const proxyPromises = this.proxySources.map(source => this.fetchFromSource(source));
        const proxyResults = await Promise.all(proxyPromises);

        // Fusionner tous les résultats
        proxyResults.forEach(proxies => {
            allProxies.push(...proxies);
        });

        // Filtrer les doublons et les proxys bannis
        const uniqueProxies = [...new Set(allProxies)]
            .filter(proxy => !this.bannedProxies.has(proxy));

        console.log(`Récupéré ${uniqueProxies.length} proxys uniques`);

        // Mise à jour de la liste des proxys
        this.proxies = uniqueProxies;
        this.lastRefresh = Date.now();
        this.currentProxyIndex = 0;

        // Test des proxys pour trouver ceux qui fonctionnent
        await this.testProxies();

        // Sauvegarder dans le cache
        await this.saveProxyCache();

        return this.proxies.length;
    }

    async testProxies(maxTestCount = 50) {
        console.log('Test des proxys...');
        this.workingProxies = [];

        // Limiter le nombre de proxys à tester pour économiser du temps
        const proxySubset = this.proxies.slice(0, maxTestCount);

        // Tester les proxys par lots de 10
        const batchSize = 10;

        for (let i = 0; i < proxySubset.length; i += batchSize) {
            const batch = proxySubset.slice(i, i + batchSize);
            const results = await Promise.allSettled(
                batch.map(proxy => this.testProxy(proxy))
            );

            // Collecter les proxys fonctionnels
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    this.workingProxies.push(batch[index]);
                }
            });

            console.log(`Test de proxys: ${i + batch.length}/${proxySubset.length}, trouvés ${this.workingProxies.length} fonctionnels`);
        }

        console.log(`Test de proxys terminé: ${this.workingProxies.length} fonctionnels sur ${proxySubset.length} testés`);
        return this.workingProxies;
    }

    async testProxy(proxyUrl, timeout = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const agent = new HttpsProxyAgent(proxyUrl);
            const response = await fetch('https://www.google.com', {
                agent,
                signal: controller.signal,
                timeout: timeout
            });

            return response.ok;
        } catch (error) {
            return false;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async getAgent() {
        // Si pas de proxys disponibles, essayer de rafraîchir
        if (this.proxies.length === 0) {
            await this.refreshProxies();
        }

        // S'il y a des proxys qui fonctionnent, les privilégier
        const proxyList = this.workingProxies.length > 0 ? this.workingProxies : this.proxies;

        if (proxyList.length === 0) {
            console.log('Aucun proxy disponible, connexion directe');
            return null;
        }

        // Rotation des proxys
        const proxyUrl = proxyList[this.currentProxyIndex];
        this.currentProxyIndex = (this.currentProxyIndex + 1) % proxyList.length;

        try {
            // Gérer les proxys avec authentification
            if (proxyUrl.includes('@') && !this.proxyAgents[proxyUrl]) {
                const newProxyUrl = await proxyChain.anonymizeProxy(proxyUrl);
                this.proxyAgents[proxyUrl] = new HttpsProxyAgent(newProxyUrl);
                console.log(`Proxy anonymisé: ${proxyUrl.replace(/\/\/.*@/, '//****@')} -> [anonymisé]`);
            } else if (!this.proxyAgents[proxyUrl]) {
                this.proxyAgents[proxyUrl] = new HttpsProxyAgent(proxyUrl);
            }

            console.log(`Utilisation du proxy: ${proxyUrl.replace(/\/\/.*@/, '//****@')}`);
            return this.proxyAgents[proxyUrl];
        } catch (error) {
            console.error(`Erreur avec le proxy ${proxyUrl.replace(/\/\/.*@/, '//****@')}:`, error.message);

            // Marquer ce proxy comme problématique
            this.bannedProxies.add(proxyUrl);

            // Essayer le prochain proxy
            return this.getAgent();
        }
    }

    banProxy(proxyUrl) {
        if (proxyUrl) {
            console.log(`Bannissement du proxy: ${proxyUrl.replace(/\/\/.*@/, '//****@')}`);
            this.bannedProxies.add(proxyUrl);

            // Retirer des listes
            this.proxies = this.proxies.filter(p => p !== proxyUrl);
            this.workingProxies = this.workingProxies.filter(p => p !== proxyUrl);

            // Supprimer l'agent si existant
            if (this.proxyAgents[proxyUrl]) {
                delete this.proxyAgents[proxyUrl];
            }

            // Sauvegarder les modifications
            this.saveProxyCache();
        }
    }

    async cleanup() {
        console.log('Nettoyage des proxys anonymisés...');

        // Nettoyage des proxys anonymisés
        for (const proxyUrl of Object.keys(this.proxyAgents)) {
            if (proxyUrl.includes('@')) {
                try {
                    await proxyChain.closeAnonymizedProxy(this.proxyAgents[proxyUrl]);
                } catch (err) {
                    console.error('Erreur lors du nettoyage du proxy:', err);
                }
            }
        }

        this.proxyAgents = {};
    }

    async addReliableProxy(proxyUrl) {
        if (!this.reliableProxies.includes(proxyUrl)) {
            this.reliableProxies.push(proxyUrl);

            // Tester ce proxy
            const isWorking = await this.testProxy(proxyUrl);

            if (isWorking) {
                console.log(`Nouveau proxy fiable ajouté et fonctionnel: ${proxyUrl.replace(/\/\/.*@/, '//****@')}`);
                if (!this.workingProxies.includes(proxyUrl)) {
                    this.workingProxies.push(proxyUrl);
                }
            } else {
                console.log(`Nouveau proxy fiable ajouté mais non fonctionnel: ${proxyUrl.replace(/\/\/.*@/, '//****@')}`);
            }

            // Ajouter à la liste principale si pas déjà présent
            if (!this.proxies.includes(proxyUrl)) {
                this.proxies.push(proxyUrl);
            }

            await this.saveProxyCache();
        }
    }
}

// Singleton
const proxyManager = new ProxyManager();

// Export
module.exports = proxyManager;