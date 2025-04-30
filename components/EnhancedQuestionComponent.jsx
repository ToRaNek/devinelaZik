// components/EnhancedQuestionComponent.jsx
import { useState } from 'react';
import FreeTextAnswerComponent from './FreeTextAnswerComponent';

export default function EnhancedQuestionComponent({
                                                      question,
                                                      timer,
                                                      onSubmitAnswer,
                                                      answerStatus
                                                  }) {
    const [selectedAnswer, setSelectedAnswer] = useState('');
    const [textAnswer, setTextAnswer] = useState('');

    // Ne rien afficher si pas de question
    if (!question) return null;

    const handleMultipleChoiceSubmit = () => {
        if (!selectedAnswer) return;
        onSubmitAnswer(selectedAnswer);
    };

    const handleFreeTextSubmit = (answer) => {
        setTextAnswer(answer);
        onSubmitAnswer(answer);
    };

    const isMultipleChoice = question.quizType === 'multiple_choice';

    return (
        <div className="question-container">
            <div className="question-header">
                <h2>{question.question}</h2>
                <div className={`timer-bar ${timer <= 10 ? 'timer-critical' : ''}`}>
                    <div className="timer-progress" style={{ width: `${(timer / 30) * 100}%` }}></div>
                </div>
                <div className="timer-counter">
                    <span className={`timer ${timer <= 10 ? 'timer-warning' : ''}`}>{timer}s</span>
                </div>
            </div>

            <div className="media-container">
                {question.type === 'artist' && question.previewUrl && (
                    <div className="audio-player">
                        <audio src={question.previewUrl} controls autoPlay></audio>
                        <div className="hint">
                            <p>Écoutez l'extrait et devinez l'artiste...</p>
                        </div>
                    </div>
                )}

                {question.type === 'song' && (
                    <div className="album-cover">
                        <img
                            src={question.albumCover || '/placeholder-album.png'}
                            alt="Album cover"
                        />
                        {question.previewUrl && (
                            <audio src={question.previewUrl} controls autoPlay></audio>
                        )}
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

            {/* Afficher le bon système de réponse selon le type de quiz */}
            {isMultipleChoice ? (
                <div className="multiple-choice-container">
                    <div className="options-grid">
                        {question.options?.map((option, index) => (
                            <button
                                key={index}
                                className={`option-button ${selectedAnswer === option ? 'selected' : ''} ${
                                    answerStatus === 'correct' && option === question.answer ? 'correct' : ''
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
                    transition: width 1s linear;
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
                }
                
                .audio-player audio {
                    width: 100%;
                    margin-bottom: 1rem;
                }
                
                .hint {
                    font-style: italic;
                    color: #6c757d;
                }
                
                .album-cover {
                    text-align: center;
                }
                
                .album-cover img {
                    max-width: 250px;
                    height: auto;
                    border-radius: 8px;
                    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
                    margin-bottom: 1rem;
                }
                
                .album-cover audio {
                    width: 100%;
                    max-width: 300px;
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