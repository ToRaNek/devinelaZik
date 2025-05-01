// components/EnhancedQuestionComponent.jsx - updated version
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
    const audioRef = useRef(null);
    const [isYouTubeEmbed, setIsYouTubeEmbed] = useState(false);

    // Ne rien afficher si pas de question
    if (!question) return null;

    // Mettre à jour le timer local quand le timer externe change
    useEffect(() => {
        setLocalTimer(timer);
    }, [timer]);

    // Detect YouTube embed URLs
    useEffect(() => {
        if (question && question.previewUrl) {
            const isYoutube = question.previewUrl.includes('youtube.com/embed/');
            setIsYouTubeEmbed(isYoutube);
            setAudioLoading(true);

            // Handle regular audio source
            if (!isYoutube && audioRef.current) {
                audioRef.current.src = question.previewUrl;
                audioRef.current.load();
                audioRef.current.play().catch(e => {
                    console.error("Error playing audio:", e);
                    setAudioError(true);
                });
            }
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

    // Audio events handling
    useEffect(() => {
        if (!audioRef.current) return;

        const handleCanPlay = () => {
            console.log("Audio loaded successfully");
            setAudioLoading(false);
            setAudioError(false);
        };

        const handleError = (e) => {
            console.error("Audio error:", e);
            setAudioError(true);
            setAudioLoading(false);
        };

        const handlePlay = () => {
            setAudioError(false);
            // Set a timeout to stop after 30 seconds max
            setTimeout(() => {
                if (audioRef.current && !audioRef.current.paused) {
                    audioRef.current.pause();
                }
            }, 30000);
        };

        // Add event listeners
        audioRef.current.addEventListener('canplaythrough', handleCanPlay);
        audioRef.current.addEventListener('error', handleError);
        audioRef.current.addEventListener('play', handlePlay);

        // Cleanup
        return () => {
            if (audioRef.current) {
                audioRef.current.removeEventListener('canplaythrough', handleCanPlay);
                audioRef.current.removeEventListener('error', handleError);
                audioRef.current.removeEventListener('play', handlePlay);
            }
        };
    }, [audioRef.current]);

    // YouTube iframe load handler
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

    const isMultipleChoice = question.quizType === 'multiple_choice';

    // Improved question title
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
                        <audio
                            ref={audioRef}
                            src={question.previewUrl}
                            controls
                            autoPlay
                            onError={() => setAudioError(true)}
                        ></audio>
                        <div className="hint">
                            <p>Écoutez l'extrait et devinez l'artiste...</p>
                            {audioError && (
                                <div className="audio-error">
                                    <p>Problème de lecture audio.</p>
                                    <button
                                        onClick={() => {
                                            if (audioRef.current) {
                                                audioRef.current.load();
                                                audioRef.current.play().catch(e => console.error("Retry error:", e));
                                            }
                                        }}
                                        className="retry-audio-button"
                                    >
                                        Réessayer
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {question.type === 'song' && (
                    <div className="audio-player">
                        {question.previewUrl ? (
                            <>
                                {isYouTubeEmbed ? (
                                    // YouTube embed with improved UI
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
                                            <p className="audio-source">Lecture en cours...</p>
                                        </div>
                                    </div>
                                ) : (
                                    // Regular audio element
                                    <>
                                        {audioLoading && (
                                            <div className="audio-loading">Chargement de l'audio...</div>
                                        )}
                                        <audio
                                            ref={audioRef}
                                            src={question.previewUrl}
                                            controls
                                            autoPlay
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
                                                    onClick={() => {
                                                        if (audioRef.current) {
                                                            setAudioLoading(true);
                                                            audioRef.current.load();
                                                            audioRef.current.play().catch(e => {
                                                                console.error("Retry error:", e);
                                                                setAudioError(true);
                                                                setAudioLoading(false);
                                                            });
                                                        }
                                                    }}
                                                    className="retry-audio-button"
                                                >
                                                    Réessayer
                                                </button>
                                            </div>
                                        )}
                                    </>
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
                /* All CSS from before remains the same */

                /* Audio related styles */
                .audio-loading {
                    padding: 0.5rem;
                    background: rgba(0, 0, 0, 0.05);
                    color: #333;
                    border-radius: 4px;
                    margin-bottom: 0.5rem;
                    font-size: 0.875rem;
                }

                .audio-error {
                    color: #dc3545;
                    font-weight: bold;
                    margin-top: 0.5rem;
                    padding: 0.5rem;
                    background: rgba(220, 53, 69, 0.1);
                    border-radius: 4px;
                }

                .retry-audio-button {
                    margin-top: 0.5rem;
                    padding: 0.25rem 0.75rem;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 0.875rem;
                }

                /* YouTube embed styling */
                .youtube-audio-container {
                    width: 100%;
                    position: relative;
                    overflow: hidden;
                    height: 80px;
                    background: #f8f9fa;
                    border-radius: 10px;
                    margin-bottom: 1rem;
                }

                .youtube-audio-iframe {
                    width: 100%;
                    height: 300px;
                    position: absolute;
                    top: -120px;
                    left: 0;
                    opacity: 0.01; /* Nearly invisible, but still loads */
                    pointer-events: none;
                }

                .audio-loading-indicator {
                    padding: 0.5rem;
                    background: rgba(0, 0, 0, 0.1);
                    color: #333;
                    font-size: 0.8rem;
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    text-align: center;
                }

                .audio-controls {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 0.5rem;
                    background: rgba(0, 0, 0, 0.05);
                }

                .audio-progress {
                    height: 6px;
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 0.25rem;
                }

                .audio-progress-bar {
                    height: 100%;
                    background: #007bff;
                    border-radius: 3px;
                    transition: width 0.1s linear;
                }

                .audio-source {
                    font-size: 0.75rem;
                    color: #666;
                    margin: 0;
                    text-align: center;
                }

                .audio-unavailable {
                    padding: 1rem;
                    background: #f8f9fa;
                    border-radius: 8px;
                    font-size: 0.9rem;
                    margin-bottom: 1rem;
                    color: #6c757d;
                }

                .audio-clue {
                    display: block;
                    font-weight: bold;
                    margin-top: 0.5rem;
                    color: #495057;
                }
            `}</style>
        </div>
    );
}