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
    const audioRef = useRef(null);

    const [isYouTubeEmbed, setIsYouTubeEmbed] = useState(false);

    // Ne rien afficher si pas de question
    if (!question) return null;


    // Mettre à jour le timer local quand le timer externe change
    useEffect(() => {
        setLocalTimer(timer);
    }, [timer]);

    useEffect(() => {
        if (question && question.previewUrl) {
            // Check if this is a YouTube embed URL
            setIsYouTubeEmbed(question.previewUrl.includes('youtube.com/embed/'));

            // Handle audio source depending on type
            if (!isYouTubeEmbed && audioRef.current) {
                // Regular audio URL
                audioRef.current.src = question.previewUrl;
                audioRef.current.play().catch(e => {
                    console.error("Error playing audio:", e);
                    setAudioError(true);
                });
            }
            // YouTube embeds will be handled by the iframe
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

    // Gestion de l'audio avec lecture automatique
    // In your useEffect for audio handling
    useEffect(() => {
        if (question && question.previewUrl && audioRef.current) {
            console.log("Attempting to load audio from:", question.previewUrl);

            // Try to load the audio with a timeout
            const timeoutId = setTimeout(() => {
                if (!audioRef.current.canPlayThrough) {
                    console.error("Audio loading timeout");
                    setAudioError(true);
                }
            }, 5000);

            // Clear timeout if audio loads successfully
            const handleCanPlay = () => {
                clearTimeout(timeoutId);
                console.log("Audio loaded successfully");
            };

            audioRef.current.addEventListener('canplaythrough', handleCanPlay);

            return () => {
                clearTimeout(timeoutId);
                if (audioRef.current) {
                    audioRef.current.removeEventListener('canplaythrough', handleCanPlay);
                }
            };
        }
    }, [question]);

    // Add this to your audio player component
    useEffect(() => {
        if (audioRef.current) {
            // Listen for when audio starts playing
            const handlePlay = () => {
                // Set a timeout to stop after 30 seconds max
                setTimeout(() => {
                    if (audioRef.current && !audioRef.current.paused) {
                        audioRef.current.pause();
                    }
                }, 30000); // 30 seconds
            };

            audioRef.current.addEventListener('play', handlePlay);

            return () => {
                if (audioRef.current) {
                    audioRef.current.removeEventListener('play', handlePlay);
                }
            };
        }
    }, [audioRef.current]);



    const handleMultipleChoiceSubmit = () => {
        if (!selectedAnswer) return;
        onSubmitAnswer(selectedAnswer);
    };

    const handleFreeTextSubmit = (answer) => {
        setTextAnswer(answer);
        onSubmitAnswer(answer);
    };

    const isMultipleChoice = question.quizType === 'multiple_choice';

    // Amélioration du titre de question pour les questions audio
    const getQuestionTitle = () => {
        if (question.type === 'song' && question.previewUrl) {
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
                                <p className="audio-error">
                                    Problème de lecture audio. Essayez de cliquer sur Play.
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {question.type === 'song' && (
                    <div className="audio-player">
                        {question.previewUrl ? (
                            <>
                                {isYouTubeEmbed ? (
                                    // YouTube embed with hidden video
                                    <div className="youtube-audio-container">
                                        <iframe
                                            src={question.previewUrl}
                                            title="YouTube audio"
                                            allow="autoplay; encrypted-media"
                                            className="youtube-audio-iframe"
                                        ></iframe>
                                        <p className="audio-source">Audio source: YouTube</p>
                                    </div>
                                ) : (
                                    // Regular audio element
                                    <audio
                                        ref={audioRef}
                                        src={question.previewUrl}
                                        controls
                                        autoPlay
                                        onError={() => setAudioError(true)}
                                    ></audio>
                                )}
                                {audioError && (
                                    <p className="audio-error">
                                        Problème de lecture audio. Essayez de cliquer sur Play.
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="audio-unavailable">
                                Prévisualisation audio non disponible pour cette piste.
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
                .question-container {
                    background: white;
                    border-radius: 8px;
                    padding: 1.5rem;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                }

                .question-header {
                    margin-bottom: 1.5rem;
                }

                .question-header h2 {
                    margin-top: 0;
                    margin-bottom: 0.75rem;
                    font-size: 1.5rem;
                    color: #333;
                }

                .timer-bar {
                    height: 6px;
                    background: #e9ecef;
                    border-radius: 999px;
                    overflow: hidden;
                    margin-bottom: 0.5rem;
                }

                .timer-progress {
                    height: 100%;
                    background: #28a745;
                    border-radius: 999px;
                    transition: width 0.1s linear;
                }

                .timer-critical .timer-progress {
                    background: #dc3545;
                }

                .timer-counter {
                    display: flex;
                    justify-content: flex-end;
                }

                .timer {
                    font-weight: 700;
                    padding: 0.25rem 0.75rem;
                    background: #28a745;
                    color: white;
                    border-radius: 999px;
                    font-size: 0.875rem;
                }

                .timer-warning {
                    background: #dc3545;
                    animation: pulse 1s infinite;
                }

                @keyframes pulse {
                    0%, 100% {
                        opacity: 1;
                    }
                    50% {
                        opacity: 0.7;
                    }
                }

                .media-container {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 2rem;
                }

                .audio-player {
                    width: 100%;
                    max-width: 400px;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }

                .audio-player audio {
                    width: 100%;
                    margin-bottom: 1rem;
                }

                .hint {
                    font-style: italic;
                    color: #6c757d;
                    margin-top: 0.5rem;
                }

                .audio-error {
                    color: #dc3545;
                    font-weight: bold;
                    margin-top: 0.5rem;
                }

                .album-cover {
                    text-align: center;
                }

                .album-cover img, .question-album-cover {
                    max-width: 250px;
                    height: auto;
                    border-radius: 8px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                    margin-bottom: 1rem;
                }

                .question-album-cover {
                    max-width: 200px;
                    margin-top: 1rem;
                }

                .options-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 1rem;
                    margin-bottom: 1.5rem;
                }

                .option-button {
                    padding: 1rem;
                    border: 2px solid #dee2e6;
                    border-radius: 8px;
                    background: white;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    text-align: center;
                }

                .option-button:hover:not(:disabled) {
                    border-color: #007bff;
                    background: #f8f9fa;
                }

                .option-button.selected {
                    border-color: #007bff;
                    background: #e6f2ff;
                }

                .option-button.correct {
                    border-color: #28a745;
                    background: #d4edda;
                }

                .option-button.incorrect {
                    border-color: #dc3545;
                    background: #f8d7da;
                }

                .option-button:disabled {
                    opacity: 0.7;
                    cursor: default;
                }

                .submit-button {
                    width: 100%;
                    padding: 0.75rem;
                    margin-top: 1rem;
                }

                .answer-feedback {
                    margin-top: 1.5rem;
                    padding: 1rem;
                    border-radius: 8px;
                    text-align: center;
                    font-weight: 500;
                }

                .answer-feedback.correct {
                    background: #d4edda;
                    color: #155724;
                }

                .answer-feedback.incorrect {
                    background: #f8d7da;
                    color: #721c24;
                }

                .answer-feedback.timeout {
                    background: #fff3cd;
                    color: #856404;
                }

                .multiple-choice-container {
                    margin-top: 1.5rem;
                }
            `}</style>
        </div>
    );
}