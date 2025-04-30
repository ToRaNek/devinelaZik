// components/GameSettingsComponent.jsx
import { useState } from 'react';

export default function GameSettingsComponent({ onStartGame, isHost }) {
    const [rounds, setRounds] = useState(10);
    const [quizType, setQuizType] = useState('multiple_choice');
    const [musicSource, setMusicSource] = useState('spotify');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleStartGame = () => {
        setIsSubmitting(true);
        onStartGame({
            rounds,
            quizType,
            source: musicSource
        });
    };

    if (!isHost) {
        return (
            <div className="waiting-message">
                <p>En attente que l'hôte démarre la partie...</p>
            </div>
        );
    }

    return (
        <div className="game-settings">
            <h3>Paramètres de la partie</h3>

            <div className="settings-group">
                <label htmlFor="rounds">Nombre de questions:</label>
                <select
                    id="rounds"
                    value={rounds}
                    onChange={(e) => setRounds(Number(e.target.value))}
                    className="settings-select"
                >
                    <option value={5}>5 questions</option>
                    <option value={10}>10 questions</option>
                    <option value={15}>15 questions</option>
                    <option value={20}>20 questions</option>
                </select>
            </div>

            <div className="settings-group">
                <label htmlFor="quizType">Type de quiz:</label>
                <select
                    id="quizType"
                    value={quizType}
                    onChange={(e) => setQuizType(e.target.value)}
                    className="settings-select"
                >
                    <option value="multiple_choice">Choix multiples</option>
                    <option value="free_text">Texte libre (avec auto-complétion)</option>
                </select>

                {quizType === 'multiple_choice' && (
                    <div className="settings-help">
                        Les joueurs devront choisir parmi 4 réponses possibles.
                    </div>
                )}

                {quizType === 'free_text' && (
                    <div className="settings-help">
                        Les joueurs devront taper la réponse avec une aide à la saisie.
                        <br />
                        Exemple: "Feel it (D4vd)" pour le titre "Feel it" de l'artiste "D4vd".
                    </div>
                )}
            </div>

            <div className="settings-group">
                <label htmlFor="musicSource">Source des questions:</label>
                <select
                    id="musicSource"
                    value={musicSource}
                    onChange={(e) => setMusicSource(e.target.value)}
                    className="settings-select"
                >
                    <option value="spotify">Spotify</option>
                    <option value="deezer" disabled>Deezer (Bientôt disponible)</option>
                </select>
            </div>

            <button
                onClick={handleStartGame}
                className="btn btn-primary start-game-btn"
                disabled={isSubmitting}
            >
                {isSubmitting ? 'Préparation...' : 'Commencer la partie'}
            </button>

            <style jsx>{`
                .game-settings {
                    background: white;
                    border-radius: 8px;
                    padding: 1.5rem;
                    margin-top: 1.5rem;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
                }
                
                .settings-group {
                    margin-bottom: 1.5rem;
                }
                
                .settings-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    font-weight: 500;
                }
                
                .settings-select {
                    width: 100%;
                    padding: 0.75rem;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    background-color: white;
                    font-size: 1rem;
                }
                
                .settings-help {
                    margin-top: 0.5rem;
                    font-size: 0.875rem;
                    color: #6c757d;
                    background: #f8f9fa;
                    padding: 0.75rem;
                    border-radius: 4px;
                    border-left: 3px solid #007bff;
                }
                
                .start-game-btn {
                    width: 100%;
                    padding: 0.75rem;
                }
            `}</style>
        </div>
    );
}