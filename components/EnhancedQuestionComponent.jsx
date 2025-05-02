// Mise à jour pour components/EnhancedQuestionComponent.jsx
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

    // Nouveaux états pour gérer les différents types d'aperçu audio
    const [audioType, setAudioType] = useState(null); // 'youtube_embed', 'youtube_direct', 'spotify', etc.

    // Ne rien afficher si pas de question
    if (!question) return null;

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

    // Gestion du chargement de l'iframe YouTube
    const handleYouTubeLoad = () => {
        setAudioLoading(false);
    };

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
                            // YouTube embed avec UI améliorée
                            <div className="youtube-audio-container">
                                {audioLoading && (
                                    <div className="audio-loading-indicator">Chargement de l'audio...</div>
                                )}
                                <iframe
                                    src={question.previewUrl}
                                    title="YouTube audio"
                                    allow="autoplay; encrypted-media"
                                    className="youtube-audio-iframe"
                                    onLoad={handleYouTubeLoad}
                                ></iframe>
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
                                    // YouTube embed avec UI améliorée
                                    <div className="youtube-audio-container">
                                        {audioLoading && (
                                            <div className="audio-loading-indicator">Chargement de l'audio...</div>
                                        )}
                                        <iframe
                                            src={question.previewUrl}
                                            title="YouTube audio"
                                            allow="autoplay; encrypted-media"
                                            className="youtube-audio-iframe"
                                            onLoad={handleYouTubeLoad}
                                        ></iframe>
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

                        {question.albumCover && (
                            <img
                                src={question.albumCover || '/placeholder-album.png'}
                                alt="Album cover"
                                className="question-album-cover"
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