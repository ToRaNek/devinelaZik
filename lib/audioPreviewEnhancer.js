// lib/audioPreviewEnhancer.js
const { getYouTubePreviewUrl } = require('./youtubeUtils');

/**
 * Enhances questions with audio previews from multiple sources
 * @param {Array} questions - Array of game questions
 * @param {Object} options - Configuration options
 * @returns {Promise<Array>} - Enhanced questions with previews
 */
async function enhanceAudioPreviews(questions, options = {}) {
  const enhancedQuestions = [...questions];
  let previewCount = 0;

  // Track progress for loading indicator
  const totalQuestions = enhancedQuestions.length;
  let processedCount = 0;

  // Process each question to add preview URL
  for (const question of enhancedQuestions) {
    processedCount++;

    // Skip if question already has a preview URL
    if (question.previewUrl) {
      previewCount++;
      continue;
    }

    // For song and artist questions, try to find audio
    if ((question.type === 'song' || question.type === 'artist') && question.artistName) {
      try {
        // Try YouTube as fallback
        const searchQuery = question.type === 'song'
          ? `${question.answer} ${question.artistName} audio`
          : `${question.artistName} popular song audio`;

        const youtubePreview = await getYouTubePreviewUrl(searchQuery);

        if (youtubePreview) {
          question.previewUrl = youtubePreview;
          question.previewSource = 'youtube';
          previewCount++;

          // Add timestamp to avoid YouTube player starting from beginning each time
          if (question.previewUrl.includes('youtube.com/embed/')) {
            // Add random start time between 30-60 seconds to avoid spoiling the intro
            const startTime = Math.floor(Math.random() * 30) + 30;
            if (!question.previewUrl.includes('start=')) {
              question.previewUrl += `&start=${startTime}&end=${startTime + 30}`;
            }
          }
        }
      } catch (error) {
        console.error(`Error getting preview for ${question.answer}:`, error);
      }
    }

    // Update progress if callback provided
    if (options.onProgress) {
      options.onProgress({
        processed: processedCount,
        total: totalQuestions,
        withPreview: previewCount
      });
    }
  }

  console.log(`Enhanced questions: ${previewCount}/${totalQuestions} have previews`);
  return enhancedQuestions;
}

module.exports = {
  enhanceAudioPreviews
};