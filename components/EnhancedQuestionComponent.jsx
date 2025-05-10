// components/EnhancedQuestionComponent.jsx
import { useState, useEffect, useRef } from 'react';
import FreeTextAnswerComponent from './FreeTextAnswerComponent';

export default function EnhancedQuestionComponent({
                                                      question,
                                                      timer,
                                                      onSubmitAnswer,
                                                      answerStatus
                                                  }) {
    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [textAnswer, setTextAnswer] = useState('');
    const [localTimer, setLocalTimer] = useState(30);
    const [audioError, setAudioError] = useState(false);
    const [audioLoading, setAudioLoading] = useState(true);
    const [audioProgress, setAudioProgress] = useState(0);
    const [audioPlaying, setAudioPlaying] = useState(false);
    const audioRef = useRef(null);

    // Références pour les lecteurs YouTube
    const youtubePlayerRef = useRef(null);
    const youtubePlayerArtistRef = useRef(null);
    const youtubePlayerSongRef = useRef(null);

    // Nouveaux états pour gérer les différents types d'aperçu audio
    const [audioType, setAudioType] = useState(null); // 'youtube_embed', 'youtube_direct', 'spotify', etc.

    // Ne rien afficher si pas de question
    if (!question) return null;

    // Effet pour charger l'API YouTube IFrame
    useEffect(() => {
        // Fonction pour charger l'API YouTube
        const loadYouTubeAPI = () => {
            // Vérifier si l'API est déjà chargée
            if (window.YT && window.YT.Player) {
                return;
            }

            // Fonction callback appelée quand l'API est prête
            window.onYouTubeIframeAPIReady = () => {
                console.log("YouTube API chargée avec succès");
            };

            // Charger le script YouTube API
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        };

        loadYouTubeAPI();
    }, []);

    // Fonction pour extraire l'ID vidéo YouTube d'une URL
    const extractYoutubeVideoId = (url) => {
        if (!url) return null;

        // Formats possibles d'URL YouTube
        const patterns = [
            /(?:youtube\.com\/embed\/)([^?&\/]+)/i,           // embed URL
            /(?:youtube\.com\/watch\?v=)([^?&]+)/i,           // watch URL
            /(?:youtube\.com\/v\/)([^?&\/]+)/i,               // autre format
            /(?:youtu\.be\/)([^?&\/]+)/i                      // URL courte
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }

        // Si l'ID est déjà présent dans les métadonnées
        if (question.previewMetadata && question.previewMetadata.videoId) {
            return question.previewMetadata.videoId;
        }

        return null;
    };

    // Mettre à jour le timer local quand le timer externe change
    useEffect(() => {
        setLocalTimer(timer);
    }, [timer]);

    // Détecter le type d'aperçu audio
    useEffect(() => {
        if (question && question.previewUrl) {
            if (question.previewUrl.includes('youtube.com/embed/')) {
                setAudioType('youtube_embed');
            } else if (question.previewUrl.includes('/api/audio-proxy')) {
                setAudioType('audio_proxy');
            } else if (question.previewUrl.includes('youtube')) {
                setAudioType('youtube_direct');
            } else if (question.previewUrl.includes('spotify.com')) {
                setAudioType('spotify');
            } else {
                setAudioType('direct_audio');
            }

            setAudioLoading(true);

            // Gérer l'audio direct seulement (pas YouTube embed)
            if (!question.previewUrl.includes('youtube.com/embed/') && audioRef.current) {
                audioRef.current.src = question.previewUrl;
                audioRef.current.volume = 0.1; // Définir le volume à 50%
                audioRef.current.load();
                audioRef.current.play().catch(e => {
                    console.error("Erreur de lecture audio:", e);
                    setAudioError(true);
                });
            }
        } else {
            setAudioType(null);
        }
    }, [question]);

    // Initialiser les lecteurs YouTube quand la question change
    useEffect(() => {
        // Fonction pour initialiser le lecteur YouTube
        const initYoutubePlayer = (containerType) => {
            // Vérifier si l'API YouTube est chargée
            if (!window.YT || !window.YT.Player) {
                console.log("YouTube API pas encore chargée");
                return;
            }

            // Identifier l'ID de la vidéo YouTube
            const videoId = extractYoutubeVideoId(question.previewUrl);
            if (!videoId) {
                console.error("Impossible d'extraire l'ID YouTube de l'URL:", question.previewUrl);
                return;
            }

            // Déterminer quel conteneur et quelle référence utiliser
            let containerId = '';
            let playerRef = null;

            if (containerType === 'artist') {
                containerId = 'youtube-artist-container';
                playerRef = youtubePlayerArtistRef;
            } else {
                containerId = 'youtube-song-container';
                playerRef = youtubePlayerSongRef;
            }

            // Vérifier si le conteneur existe
            const container = document.getElementById(containerId);
            if (!container) {
                console.error(`Conteneur #${containerId} non trouvé`);
                return;
            }

            // Extraire les paramètres d'heure (start & end)
            const urlParams = new URLSearchParams(
                question.previewUrl.indexOf('?') > -1
                    ? question.previewUrl.substring(question.previewUrl.indexOf('?'))
                    : ''
            );
            const startTime = parseInt(urlParams.get('start')) || 0;
            const endTime = parseInt(urlParams.get('end')) || startTime + 30;

            // Si un player existe déjà, le détruire
            if (playerRef.current) {
                playerRef.current.destroy();
            }

            // Créer le nouveau lecteur YouTube
            playerRef.current = new window.YT.Player(containerId, {
                videoId: videoId,
                height: '100',
                width: '100%',
                playerVars: {
                    autoplay: 1,           // Lecture automatique
                    controls: 0,           // Masquer les contrôles
                    showinfo: 0,           // Masquer les informations
                    modestbranding: 1,     // Logo YouTube discret
                    start: startTime,      // Démarrer à ce moment
                    end: endTime,          // Terminer à ce moment
                    fs: 0,                 // Pas de mode plein écran
                    rel: 0,                // Pas de vidéos liées
                    disablekb: 1,          // Désactiver le clavier
                    iv_load_policy: 3      // Masquer les annotations
                },
                events: {
                    'onReady': (event) => {
                        console.log(`Lecteur YouTube prêt (${containerType})`);
                        event.target.setVolume(10); // Définir le volume à 50%
                        event.target.playVideo();
                        setAudioLoading(false);
                    },
                    'onStateChange': (event) => {
                        if (event.data === window.YT.PlayerState.PLAYING) {
                            setAudioPlaying(true);
                        } else if (event.data === window.YT.PlayerState.PAUSED ||
                            event.data === window.YT.PlayerState.ENDED) {
                            setAudioPlaying(false);
                        }
                    },
                    'onError': (event) => {
                        console.error(`Erreur YouTube (${containerType}):`, event.data);
                        setAudioError(true);
                        setAudioLoading(false);
                    }
                }
            });
        };

        // Initialiser le lecteur YouTube si nécessaire
        if (question && question.previewUrl && audioType === 'youtube_embed') {
            // Déterminer quel type de lecteur initialiser
            if (question.type === 'artist') {
                initYoutubePlayer('artist');
            } else if (question.type === 'song') {
                initYoutubePlayer('song');
            }
        }
    }, [question, audioType]);

    // Animation continue du timer
    useEffect(() => {
        if (localTimer <= 0 || answerStatus) return;

        const interval = setInterval(() => {
            setLocalTimer(prev => Math.max(0, prev - 0.1));
        }, 100);

        return () => clearInterval(interval);
    }, [localTimer, answerStatus]);

    // Gestion des événements audio
    useEffect(() => {
        if (!audioRef.current) return;

        const handleCanPlay = () => {
            console.log("Audio chargé avec succès");
            setAudioLoading(false);
            setAudioError(false);
        };

        const handleError = (e) => {
            console.error("Erreur audio:", e);
            setAudioError(true);
            setAudioLoading(false);

            // Tentative de reprise avec le proxy audio si disponible et si c'est une URL directe YouTube
            if (audioType === 'youtube_direct' && question.previewMetadata?.videoId) {
                console.log("Tentative de reprise avec le proxy audio");
                audioRef.current.src = `/api/audio-proxy?videoId=${question.previewMetadata.videoId}`;
                audioRef.current.load();
                audioRef.current.play().catch(e => {
                    console.error("Erreur de reprise:", e);
                });
            }
        };

        const handlePlay = () => {
            setAudioError(false);
            setAudioPlaying(true);

            // Limiter la durée à 30 secondes max
            setTimeout(() => {
                if (audioRef.current && !audioRef.current.paused) {
                    audioRef.current.pause();
                    setAudioPlaying(false);
                }
            }, 30000);
        };

        const handlePause = () => {
            setAudioPlaying(false);
        };

        const handleTimeUpdate = () => {
            if (audioRef.current) {
                const duration = audioRef.current.duration || 30;
                const currentTime = audioRef.current.currentTime || 0;
                const progress = (currentTime / Math.min(duration, 30)) * 100;
                setAudioProgress(progress);
            }
        };

        // Ajouter les événements
        audioRef.current.addEventListener('canplaythrough', handleCanPlay);
        audioRef.current.addEventListener('error', handleError);
        audioRef.current.addEventListener('play', handlePlay);
        audioRef.current.addEventListener('pause', handlePause);
        audioRef.current.addEventListener('timeupdate', handleTimeUpdate);

        // Définir le volume à 50%
        audioRef.current.volume = 0.1;

        // Nettoyage
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('canplaythrough', handleCanPlay);
                audioRef.current.removeEventListener('error', handleError);
                audioRef.current.removeEventListener('play', handlePlay);
                audioRef.current.removeEventListener('pause', handlePause);
                audioRef.current.removeEventListener('timeupdate', handleTimeUpdate);
            }
        };
    }, [audioRef.current, audioType, question]);

    // Nettoyage des lecteurs YouTube lors du démontage
    useEffect(() => {
        return () => {
            // Détruire les lecteurs YouTube
            if (youtubePlayerArtistRef.current) {
                youtubePlayerArtistRef.current.destroy();
            }
            if (youtubePlayerSongRef.current) {
                youtubePlayerSongRef.current.destroy();
            }
        };
    }, []);

    const handleMultipleChoiceSubmit = () => {
        if (!selectedAnswer) return;
        onSubmitAnswer(selectedAnswer);
    };

    const handleFreeTextSubmit = (answer) => {
        setTextAnswer(answer);
        onSubmitAnswer(answer);
    };

    // Gestion améliorée de la lecture/pause
    const toggleAudio = () => {
        if (!audioRef.current) return;

        if (audioRef.current.paused) {
            audioRef.current.play().catch(e => {
                console.error("Erreur lors de la lecture:", e);
                setAudioError(true);
            });
        } else {
            audioRef.current.pause();
        }
    };

    const retryAudio = () => {
        if (!audioRef.current) return;

        setAudioLoading(true);
        setAudioError(false);

        // Si nous avons des métadonnées et que l'URL directe échoue, essayer avec le proxy
        if (audioError && question.previewMetadata?.videoId) {
            audioRef.current.src = `/api/audio-proxy?videoId=${question.previewMetadata.videoId}`;
        } else {
            audioRef.current.src = question.previewUrl;
        }

        audioRef.current.load();
        audioRef.current.play().catch(e => {
            console.error("Erreur lors de la reprise:", e);
            setAudioError(true);
            setAudioLoading(false);
        });
    };

    const isMultipleChoice = question.quizType === 'multiple_choice';

    // Titre de question amélioré
    const getQuestionTitle = () => {
        if (question.type === 'song' && question.artistName) {
            return `Quel titre de ${question.artistName} est-ce ?`;
        }
        return question.question;
    };

    // Calculer le pourcentage de temps restant pour la barre de progression
    const timerPercentage = (localTimer / 30) * 100;

    return (
        <div className="question-container">
            <div className="question-header">
                <h2>{getQuestionTitle()}</h2>
                <div className={`timer-bar ${localTimer <= 10 ? 'timer-critical' : ''}`}>
                    <div
                        className="timer-progress"
                        style={{ width: `${timerPercentage}%` }}
                    ></div>
                </div>
                <div className="timer-counter">
                  <span className={`timer ${localTimer <= 10 ? 'timer-warning' : ''}`}>
                    {Math.ceil(localTimer)}s
                  </span>
                </div>
            </div>

            <div className="media-container">
                {question.type === 'artist' && question.previewUrl && (
                    <div className="audio-player">
                        {audioType === 'youtube_embed' ? (
                            // Remplacer l'iframe par un div avec ID pour l'API YouTube
                            <div className="youtube-audio-container">
                                {audioLoading && (
                                    <div className="audio-loading-indicator">Chargement de l'audio...</div>
                                )}
                                <div id="youtube-artist-container" className="youtube-audio-iframe"></div>
                                <div className="audio-controls">
                                    <div className="audio-progress">
                                        <div
                                            className="audio-progress-bar"
                                            style={{width: `${(localTimer / 30) * 100}%`}}
                                        ></div>
                                    </div>
                                    <p className="audio-source">
                                        {question.previewMetadata?.title ?
                                            `${question.previewMetadata.title.substring(0, 40)}${question.previewMetadata.title.length > 40 ? '...' : ''}` :
                                            'Lecture en cours...'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            // Player audio standard amélioré
                            <div className="enhanced-audio-player">
                                {audioLoading && (
                                    <div className="audio-loading">Chargement de l'audio...</div>
                                )}

                                <div className="audio-player-ui">
                                    <button
                                        className={`play-button ${audioPlaying ? 'playing' : ''}`}
                                        onClick={toggleAudio}
                                        disabled={audioLoading || audioError}
                                    >
                                        {audioPlaying ? '❚❚' : '▶'}
                                    </button>

                                    <div className="progress-container">
                                        <div className="progress-bar">
                                            <div
                                                className="progress-fill"
                                                style={{width: `${audioProgress}%`}}
                                            ></div>
                                        </div>

                                        {question.previewMetadata?.title && (
                                            <div className="audio-title">
                                                {question.previewMetadata.title.substring(0, 40)}
                                                {question.previewMetadata.title.length > 40 ? '...' : ''}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <audio
                                    ref={audioRef}
                                    src={question.previewUrl}
                                    preload="auto"
                                    className="hidden-audio"
                                    onCanPlay={() => setAudioLoading(false)}
                                    onError={() => {
                                        setAudioError(true);
                                        setAudioLoading(false);
                                    }}
                                ></audio>

                                {audioError && (
                                    <div className="audio-error">
                                        <p>Problème de lecture audio.</p>
                                        <button
                                            onClick={retryAudio}
                                            className="retry-audio-button"
                                        >
                                            Réessayer
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="hint">
                            <p>Écoutez l'extrait et devinez l'artiste...</p>
                        </div>
                    </div>
                )}

                {question.type === 'song' && (
                    <div className="audio-player">
                        {question.previewUrl ? (
                            <>
                                {audioType === 'youtube_embed' ? (
                                    // Remplacer l'iframe par un div avec ID pour l'API YouTube
                                    <div className="youtube-audio-container">
                                        {audioLoading && (
                                            <div className="audio-loading-indicator">Chargement de l'audio...</div>
                                        )}
                                        <div id="youtube-song-container" className="youtube-audio-iframe" style={{
                                            position: 'relative',
                                            width: '100%',
                                            height: '80px'
                                        }}></div>
                                        <div className="audio-controls">
                                            <div className="audio-progress">
                                                <div
                                                    className="audio-progress-bar"
                                                    style={{width: `${(localTimer / 30) * 100}%`}}
                                                ></div>
                                            </div>
                                            <p className="audio-source">
                                                {question.previewMetadata?.title ?
                                                    `${question.previewMetadata.title.substring(0, 40)}${question.previewMetadata.title.length > 40 ? '...' : ''}` :
                                                    'Lecture en cours...'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    // Enhanced audio player for direct audio
                                    <div className="enhanced-audio-player">
                                        {audioLoading && (
                                            <div className="audio-loading">Chargement de l'audio...</div>
                                        )}

                                        <div className="audio-player-ui">
                                            <button
                                                className={`play-button ${audioPlaying ? 'playing' : ''}`}
                                                onClick={toggleAudio}
                                                disabled={audioLoading || audioError}
                                            >
                                                {audioPlaying ? '❚❚' : '▶'}
                                            </button>

                                            <div className="progress-container">
                                                <div className="progress-bar">
                                                    <div
                                                        className="progress-fill"
                                                        style={{width: `${audioProgress}%`}}
                                                    ></div>
                                                </div>

                                                {question.previewMetadata?.title && (
                                                    <div className="audio-title">
                                                        {question.previewMetadata.title.substring(0, 40)}
                                                        {question.previewMetadata.title.length > 40 ? '...' : ''}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <audio
                                            ref={audioRef}
                                            src={question.previewUrl}
                                            preload="auto"
                                            className="hidden-audio"
                                            onCanPlay={() => setAudioLoading(false)}
                                            onError={() => {
                                                setAudioError(true);
                                                setAudioLoading(false);
                                            }}
                                        ></audio>

                                        {audioError && (
                                            <div className="audio-error">
                                                <p>Problème de lecture audio.</p>
                                                <button
                                                    onClick={retryAudio}
                                                    className="retry-audio-button"
                                                >
                                                    Réessayer
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <p className="audio-unavailable">
                                Prévisualisation audio non disponible pour cette piste.
                                <br />
                                <span className="audio-clue">
                  Indice: Artiste: {question.artistName}
                </span>
                            </p>
                        )}

                        {!question.previewUrl && question.albumCover && (
                            <img
                                src={question.albumCover}
                                alt="Album cover"
                                className="question-album-cover"
                                style={{ maxWidth: '150px', maxHeight: '150px' }}
                            />
                        )}

                        <div className="hint">
                            <p>Devinez le titre...</p>
                        </div>
                    </div>
                )}

                {question.type === 'album' && (
                    <div className="album-cover">
                        <img
                            src={question.albumCover || '/placeholder-album.png'}
                            alt="Album cover"
                        />
                    </div>
                )}
            </div>

            {/* Système de réponse */}
            {isMultipleChoice ? (
                <div className="multiple-choice-container">
                    <div className="options-grid">
                        {question.options?.map((option, index) => (
                            <button
                                key={index}
                                className={`option-button ${selectedAnswer === option ? 'selected' : ''} ${
                                    answerStatus === 'correct' && option === question.answer ? 'correct' : ''
                                } ${
                                    answerStatus === 'incorrect' && option === question.answer ? 'correct' : ''
                                } ${
                                    answerStatus === 'incorrect' && option === selectedAnswer ? 'incorrect' : ''
                                }`}
                                onClick={() => !answerStatus && setSelectedAnswer(option)}
                                disabled={!!answerStatus}
                            >
                                {option}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleMultipleChoiceSubmit}
                        className="btn btn-primary submit-button"
                        disabled={!selectedAnswer || !!answerStatus}
                    >
                        Valider
                    </button>
                </div>
            ) : (
                <FreeTextAnswerComponent
                    onSubmit={handleFreeTextSubmit}
                    correctAnswer={question.answer}
                    artistName={question.artistName}
                    disabled={!!answerStatus}
                    answerStatus={answerStatus}
                />
            )}

            {/* Feedback sur les réponses */}
            {answerStatus === 'correct' && (
                <div className="answer-feedback correct">
                    <span>Bravo! Réponse correcte</span>
                </div>
            )}

            {answerStatus === 'incorrect' && (
                <div className="answer-feedback incorrect">
                    <span>Incorrect, la réponse était: {question.answer}</span>
                </div>
            )}

            {answerStatus === 'timeout' && (
                <div className="answer-feedback timeout">
                    <span>Temps écoulé! La réponse était: {question.answer}</span>
                </div>
            )}

            <style jsx>{`
                /* Styles existants */

                /* Nouveaux styles pour le lecteur audio amélioré */
                .enhanced-audio-player {
                    width: 100%;
                    max-width: 400px;
                    padding: 15px;
                    background: #f8f9fa;
                    border-radius: 10px;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    margin-bottom: 15px;
                }

                .audio-player-ui {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }

                .play-button {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: #007bff;
                    color: white;
                    border: none;
                    font-size: 18px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .play-button:hover {
                    background: #0069d9;
                    transform: scale(1.05);
                }

                .play-button.playing {
                    background: #dc3545;
                }

                .play-button:disabled {
                    background: #6c757d;
                    cursor: not-allowed;
                }

                .progress-container {
                    flex-grow: 1;
                }

                .progress-bar {
                    height: 8px;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 8px;
                }

                .progress-fill {
                    height: 100%;
                    background: #007bff;
                    transition: width 0.1s linear;
                }

                .audio-title {
                    font-size: 12px;
                    color: #6c757d;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .hidden-audio {
                    display: none;
                }

                .audio-loading {
                    text-align: center;
                    padding: 8px;
                    margin-bottom: 10px;
                    font-size: 14px;
                    color: #6c757d;
                    background: rgba(0, 0, 0, 0.05);
                    border-radius: 4px;
                }
            `}</style>
        </div>
    );
}