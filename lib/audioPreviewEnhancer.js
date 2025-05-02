// lib/audioPreviewEnhancer.js - VERSION SANS API YOUTUBE
const { getYouTubePreviewUrl } = require('./youtubeUtils');

/**
 * Améliore les questions avec des aperçus audio de diverses sources
 * Cette version n'utilise PAS l'API YouTube
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
        // Recherche basée sur le type de question
        const searchQuery = question.type === 'song'
            ? `${question.artistName} ${question.answer}` // Artiste + Titre
            : question.artistName;                         // Juste l'artiste

        // Utiliser getYouTubePreviewUrl qui n'utilise PAS l'API
        const youtubePreview = await getYouTubePreviewUrl(
            question.artistName,
            question.type === 'song' ? question.answer : ''
        );

        if (youtubePreview) {
          question.previewUrl = youtubePreview;
          question.previewSource = 'youtube';

          // Les paramètres (start, end) sont déjà ajoutés dans getYouTubePreviewUrl
          previewCount++;
        }
      } catch (error) {
        console.error(`Erreur lors de la récupération de l'aperçu pour ${question.answer}:`, error);
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

  console.log(`Questions améliorées: ${previewCount}/${totalQuestions} ont des aperçus`);
  return enhancedQuestions;
}

module.exports = {
  enhanceAudioPreviews
};