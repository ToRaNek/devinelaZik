// scripts/setup-youtube.js
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

console.log('🎵 Configuration du service audio amélioré pour Devine la Zik 🎵');

// Vérifier les dépendances nécessaires
const dependencies = [
    'ytdl-core',
    'youtube-sr',
    'play-dl'
];

console.log('📦 Vérification des dépendances...');

let needsInstall = false;
try {
    const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

    for (const dep of dependencies) {
        if (!packageJson.dependencies[dep]) {
            console.log(`❌ Dépendance manquante: ${dep}`);
            needsInstall = true;
        } else {
            console.log(`✅ Dépendance trouvée: ${dep}`);
        }
    }
} catch (error) {
    console.error('❌ Erreur lors de la lecture du package.json:', error.message);
    needsInstall = true;
}

if (needsInstall) {
    console.log('📥 Installation des dépendances manquantes...');
    try {
        childProcess.execSync(`npm install ${dependencies.join(' ')} --save`, { stdio: 'inherit' });
        console.log('✅ Dépendances installées avec succès');
    } catch (error) {
        console.error('❌ Erreur lors de l\'installation des dépendances:', error.message);
        process.exit(1);
    }
}

// Créer les répertoires nécessaires
const directories = [
    './lib'
];

for (const dir of directories) {
    if (!fs.existsSync(dir)) {
        console.log(`📁 Création du répertoire ${dir}...`);
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Créer les fichiers nécessaires
const files = [
    {
        path: './lib/enhancedYoutubeService.js',
        content: `// lib/enhancedYoutubeService.js
const ytdl = require('ytdl-core');
const ytsr = require('youtube-sr').default;

/**
 * Service d'extraction audio YouTube sans utiliser l'API officielle
 * Inspiré de l'approche utilisée par Spotube
 */
class EnhancedYoutubeService {
  /**
   * Recherche une vidéo YouTube et retourne l'URL de prévisualisation audio
   * @param {string} query - Requête de recherche (artiste + titre)
   * @returns {Promise<Object>} - Informations audio avec URL de prévisualisation
   */
  async getAudioPreviewUrl(query) {
    try {
      console.log(\`Recherche audio pour: \${query}\`);
      
      // Ajout de mots-clés pour améliorer la recherche
      const searchQuery = \`\${query} audio official\`;
      
      // Rechercher la vidéo sans utiliser l'API YouTube
      const searchResults = await ytsr.search(searchQuery, { limit: 3, type: 'video' });
      
      if (!searchResults || searchResults.length === 0) {
        console.warn(\`Aucun résultat trouvé pour: \${searchQuery}\`);
        return null;
      }
      
      // Prendre le premier résultat de la recherche
      const bestMatch = searchResults[0];
      const videoId = bestMatch.id;
      
      console.log(\`Meilleure correspondance: "\${bestMatch.title}" (\${videoId})\`);
      
      // Obtenir le flux audio uniquement
      const videoInfo = await ytdl.getInfo(videoId);
      
      // Filtrer pour obtenir le format audio avec la meilleure qualité
      const audioFormats = ytdl.filterFormats(videoInfo.formats, 'audioonly');
      if (audioFormats.length === 0) {
        console.warn(\`Aucun format audio trouvé pour \${videoId}\`);
        return null;
      }
      
      // Trouver le format avec la meilleure qualité audio
      const bestAudioFormat = audioFormats.reduce((prev, curr) => 
        (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr
      );
      
      // Créer le point de départ aléatoire pour éviter de spoiler le début
      const startTime = Math.floor(Math.random() * 30) + 15;
      
      // Deux options pour utiliser le flux:
      
      // 1. URL directe pour le streaming (expire après un certain temps)
      const directAudioUrl = bestAudioFormat.url;
      
      // 2. URL d'un lecteur YouTube intégré avec paramètres de contrôle
      const embedUrl = \`https://www.youtube.com/embed/\${videoId}?autoplay=1&start=\${startTime}&end=\${startTime + 30}&controls=0&enablejsapi=1\`;
      
      return {
        videoId,
        title: bestMatch.title,
        channelName: bestMatch.channel?.name || 'Unknown',
        thumbnailUrl: bestMatch.thumbnail?.url,
        duration: bestMatch.duration,
        directAudioUrl,   // URL pour streaming direct (meilleure option)
        embedUrl,         // URL iframe YouTube (option de secours)
        format: bestAudioFormat.mimeType,
        bitrate: bestAudioFormat.audioBitrate,
        contentLength: bestAudioFormat.contentLength,
        isLive: videoInfo.videoDetails.isLiveContent,
        startTime,
        previewSource: 'youtube'
      };
    } catch (error) {
      console.error('Erreur lors de l\\'extraction audio YouTube:', error);
      return null;
    }
  }
  
  /**
   * Génère une URL proxy pour l'audio (pour éviter les problèmes CORS côté client)
   * @param {string} videoId - ID de la vidéo YouTube
   * @returns {string} - URL du proxy pour le streaming audio
   */
  getProxyUrl(videoId) {
    return \`/api/audio-proxy?videoId=\${videoId}\`;
  }
  
  /**
   * Obtient les métadonnées et l'URL d'aperçu audio pour une chanson
   * @param {string} artistName - Nom de l'artiste
   * @param {string} trackName - Nom de la piste
   * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
   */
  async getSongPreview(artistName, trackName) {
    const query = \`\${artistName} \${trackName}\`;
    return this.getAudioPreviewUrl(query);
  }
  
  /**
   * Obtient les métadonnées et l'URL d'aperçu audio pour un artiste
   * @param {string} artistName - Nom de l'artiste
   * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
   */
  async getArtistPreview(artistName) {
    // Essayer de trouver un titre populaire de l'artiste
    const query = \`\${artistName} popular song\`;
    return this.getAudioPreviewUrl(query);
  }
}

module.exports = new EnhancedYoutubeService();`
    },
    {
        path: './lib/audioPreviewEnhancer.js',
        content: `// lib/audioPreviewEnhancer.js
const enhancedYoutubeService = require('./enhancedYoutubeService');

/**
 * Améliore les questions avec des aperçus audio de diverses sources
 * @param {Array} questions - Tableau des questions du jeu
 * @param {Object} options - Options de configuration
 * @returns {Promise<Array>} - Questions améliorées avec aperçus
 */
async function enhanceAudioPreviews(questions, options = {}) {
  const enhancedQuestions = [...questions];
  let previewCount = 0;

  // Suivi de la progression pour l'indicateur de chargement
  const totalQuestions = enhancedQuestions.length;
  let processedCount = 0;

  // Traiter chaque question pour ajouter une URL de prévisualisation
  for (const question of enhancedQuestions) {
    processedCount++;

    // Ignorer si la question a déjà une URL de prévisualisation
    if (question.previewUrl) {
      previewCount++;
      continue;
    }

    // Pour les questions de type chanson ou artiste, essayer de trouver de l'audio
    if ((question.type === 'song' || question.type === 'artist') && question.artistName) {
      try {
        // Choisir la méthode de recherche en fonction du type de question
        const audioPreview = question.type === 'song'
          ? await enhancedYoutubeService.getSongPreview(question.artistName, question.answer)
          : await enhancedYoutubeService.getArtistPreview(question.artistName);

        if (audioPreview) {
          // Utiliser l'URL directe pour le streaming si disponible
          if (audioPreview.directAudioUrl) {
            question.previewUrl = audioPreview.directAudioUrl;
            question.previewSource = 'youtube_direct';
          } 
          // Sinon, utiliser l'URL d'intégration YouTube
          else if (audioPreview.embedUrl) {
            question.previewUrl = audioPreview.embedUrl;
            question.previewSource = 'youtube_embed';
            
            // Ajouter des paramètres pour améliorer l'expérience d'écoute
            if (question.previewUrl.includes('youtube.com/embed/')) {
              // Déjà configuré lors de la création dans enhancedYoutubeService
            }
          }
          
          // Ajouter d'autres métadonnées utiles
          question.previewMetadata = {
            videoId: audioPreview.videoId,
            title: audioPreview.title,
            channelName: audioPreview.channelName,
            thumbnailUrl: audioPreview.thumbnailUrl
          };
          
          previewCount++;
        }
      } catch (error) {
        console.error(\`Erreur lors de la récupération de l'aperçu pour \${question.answer}:\`, error);
      }
    }

    // Mettre à jour la progression si le callback est fourni
    if (options.onProgress) {
      options.onProgress({
        processed: processedCount,
        total: totalQuestions,
        withPreview: previewCount
      });
    }
  }

  console.log(\`Questions améliorées: \${previewCount}/\${totalQuestions} avec prévisualisations\`);
  return enhancedQuestions;
}

module.exports = {
  enhanceAudioPreviews
};`
    },
    {
        path: './pages/api/audio-proxy.js',
        content: `// pages/api/audio-proxy.js
import ytdl from 'ytdl-core';

/**
 * Endpoint API servant de proxy pour les flux audio YouTube
 * Permet d'éviter les problèmes CORS et de cacher la logique d'extraction
 */
export default async function handler(req, res) {
  // Uniquement accepter les requêtes GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { videoId } = req.query;

  if (!videoId) {
    return res.status(400).json({ error: 'Missing videoId parameter' });
  }

  try {
    // Obtenir les informations de la vidéo
    const info = await ytdl.getInfo(videoId);

    // Filtrer pour n'avoir que les formats audio
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');

    if (audioFormats.length === 0) {
      return res.status(404).json({ error: 'No audio stream found' });
    }

    // Obtenir le format avec la meilleure qualité audio
    const audioFormat = audioFormats.reduce((prev, curr) => {
      return (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr;
    });

    // Option 1: Redirection (plus simple, mais moins de contrôle)
    res.redirect(audioFormat.url);

    // Option 2: Streaming du contenu (nécessite plus de ressources serveur)
    /*
    // Définir les headers de réponse
    res.setHeader('Content-Type', audioFormat.mimeType);
    res.setHeader('Content-Length', audioFormat.contentLength);
    res.setHeader('Accept-Ranges', 'bytes');
    
    // Créer un flux de la vidéo et le transférer à la réponse
    const audioStream = ytdl(videoId, { 
      format: audioFormat,
      range: req.headers.range,
    });
    
    // Gérer les erreurs de flux
    audioStream.on('error', (err) => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Streaming error' });
      }
    });
    
    // Transférer le flux audio à la réponse
    audioStream.pipe(res);
    */

  } catch (error) {
    console.error('Error extracting YouTube audio:', error);
    return res.status(500).json({ error: 'Failed to extract audio stream' });
  }
}`
    }
];

for (const file of files) {
    try {
        console.log(`📝 Création de ${file.path}...`);
        fs.writeFileSync(file.path, file.content);
        console.log(`✅ Fichier créé avec succès: ${file.path}`);
    } catch (error) {
        console.error(`❌ Erreur lors de la création du fichier ${file.path}:`, error.message);
    }
}

// Support pour play-dl (API alternative à YouTube)
console.log('🔄 Configuration du support pour play-dl...');
try {
    const playDlConfig = {
        path: './lib/playDlService.js',
        content: `// lib/playDlService.js
const play = require('play-dl');

/**
 * Service utilisant play-dl pour l'extraction audio YouTube
 * Une alternative à ytdl-core qui contourne certaines limitations
 */
class PlayDlService {
  /**
   * Recherche et extrait l'URL de streaming d'une piste audio
   * @param {string} query - Requête de recherche (artiste + titre)
   * @returns {Promise<Object>} - Données audio avec URL de streaming
   */
  async getAudioUrl(query) {
    try {
      console.log(\`[play-dl] Recherche pour: \${query}\`);
      
      // Rechercher la vidéo
      const searchResults = await play.search(query, { limit: 3 });
      
      if (!searchResults || searchResults.length === 0) {
        console.warn(\`[play-dl] Aucun résultat trouvé pour: \${query}\`);
        return null;
      }
      
      const video = searchResults[0];
      console.log(\`[play-dl] Meilleure correspondance: "\${video.title}"\`);
      
      // Obtenir les informations de streaming
      const streamInfo = await play.stream(video.url);
      
      // Calculer le temps de départ pour éviter de spoiler le début
      const startTime = Math.floor(Math.random() * 30) + 15;
      
      return {
        title: video.title,
        videoId: video.id,
        channelName: video.channel?.name,
        thumbnailUrl: video.thumbnails[0]?.url,
        duration: video.durationInSec,
        directAudioUrl: streamInfo.url, // URL directe (peut expirer)
        startTime,
        audioFormat: streamInfo.type,
        previewSource: 'play-dl'
      };
    } catch (error) {
      console.error('[play-dl] Erreur:', error);
      return null;
    }
  }
  
  /**
   * Obtient les métadonnées et l'URL d'aperçu audio pour une chanson
   * @param {string} artistName - Nom de l'artiste
   * @param {string} trackName - Nom de la piste
   * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
   */
  async getSongPreview(artistName, trackName) {
    const query = \`\${artistName} \${trackName} audio\`;
    return this.getAudioUrl(query);
  }
  
  /**
   * Obtient les métadonnées et l'URL d'aperçu audio pour un artiste
   * @param {string} artistName - Nom de l'artiste
   * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
   */
  async getArtistPreview(artistName) {
    const query = \`\${artistName} popular song audio\`;
    return this.getAudioUrl(query);
  }
}

module.exports = new PlayDlService();`
    };

    fs.writeFileSync(playDlConfig.path, playDlConfig.content);
    console.log(`✅ Support play-dl configuré: ${playDlConfig.path}`);
} catch (error) {
    console.error('❌ Erreur lors de la configuration de play-dl:', error.message);
}

// Créer un fichier de fusion qui combine les approches
console.log('🔄 Création du service audio combiné...');
try {
    const combinedServicePath = './lib/audioPreviewService.js';
    const combinedServiceContent = `// lib/audioPreviewService.js
const enhancedYoutubeService = require('./enhancedYoutubeService');
const playDlService = require('./playDlService');

/**
 * Service combiné qui utilise plusieurs approches pour obtenir des prévisualisations audio
 * Tente plusieurs méthodes en cas d'échec de l'une d'entre elles
 */
class AudioPreviewService {
  /**
   * Obtient les métadonnées et l'URL d'aperçu audio pour une chanson
   * @param {string} artistName - Nom de l'artiste
   * @param {string} trackName - Nom de la piste
   * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
   */
  async getSongPreview(artistName, trackName) {
    try {
      // Essayer d'abord avec ytdl-core
      const ytPreview = await enhancedYoutubeService.getSongPreview(artistName, trackName);
      if (ytPreview && (ytPreview.directAudioUrl || ytPreview.embedUrl)) {
        console.log('✅ Aperçu trouvé avec ytdl-core');
        return ytPreview;
      }
      
      // Si échec, essayer avec play-dl
      console.log('⚠️ ytdl-core a échoué, essai avec play-dl...');
      const playDlPreview = await playDlService.getSongPreview(artistName, trackName);
      if (playDlPreview && playDlPreview.directAudioUrl) {
        console.log('✅ Aperçu trouvé avec play-dl');
        return playDlPreview;
      }
      
      console.warn('❌ Aucun aperçu trouvé pour la chanson');
      return null;
    } catch (error) {
      console.error('Erreur lors de la recherche d\\'aperçu de chanson:', error);
      return null;
    }
  }
  
  /**
   * Obtient les métadonnées et l'URL d'aperçu audio pour un artiste
   * @param {string} artistName - Nom de l'artiste
   * @returns {Promise<Object|null>} - Informations d'aperçu ou null si non trouvé
   */
  async getArtistPreview(artistName) {
    try {
      // Essayer d'abord avec ytdl-core
      const ytPreview = await enhancedYoutubeService.getArtistPreview(artistName);
      if (ytPreview && (ytPreview.directAudioUrl || ytPreview.embedUrl)) {
        console.log('✅ Aperçu d\\'artiste trouvé avec ytdl-core');
        return ytPreview;
      }
      
      // Si échec, essayer avec play-dl
      console.log('⚠️ ytdl-core a échoué, essai avec play-dl...');
      const playDlPreview = await playDlService.getArtistPreview(artistName);
      if (playDlPreview && playDlPreview.directAudioUrl) {
        console.log('✅ Aperçu d\\'artiste trouvé avec play-dl');
        return playDlPreview;
      }
      
      console.warn('❌ Aucun aperçu trouvé pour l\\'artiste');
      return null;
    } catch (error) {
      console.error('Erreur lors de la recherche d\\'aperçu d\\'artiste:', error);
      return null;
    }
  }
}

module.exports = new AudioPreviewService();`;

    fs.writeFileSync(combinedServicePath, combinedServiceContent);
    console.log(`✅ Service audio combiné créé: ${combinedServicePath}`);
} catch (error) {
    console.error('❌ Erreur lors de la création du service combiné:', error.message);
}