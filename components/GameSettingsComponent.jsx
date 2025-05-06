// components/GameSettingsComponent.jsx
import { useState, useEffect } from 'react';

export default function GameSettingsComponent({ onStartGame, isHost, hideSourceSelection = false }) {
    const [rounds, setRounds] = useState(10);
    const [quizType, setQuizType] = useState('multiple_choice');
    const [musicSource, setMusicSource] = useState('all'); // Par défaut, utiliser toutes les sources
    const [selectedPlaylists, setSelectedPlaylists] = useState([]); // Ajout de la définition manquante
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleStartGame = () => {
        setIsSubmitting(true);
        onStartGame({
            rounds,
            quizType,
            source: musicSource,
            selectedPlaylists
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

            {/* La section de sélection de source est maintenant visible par défaut */}
            <div className="settings-group">
                <label htmlFor="musicSource">Source des questions:</label>
                <select
                    id="musicSource"
                    value={musicSource}
                    onChange={(e) => setMusicSource(e.target.value)}
                    className="settings-select"
                >
                    <option value="all">Toutes les sources disponibles</option>
                    <option value="top">Titres les plus écoutés</option>
                    <option value="saved">Titres likés</option>
                    <option value="recent">Historique d'écoute récent</option>
                    <option value="playlists">Playlists sélectionnées</option>
                </select>

                <div className="settings-help">
                    Choisissez la source des questions pour personnaliser votre expérience de jeu.
                </div>
            </div>

            <button
                onClick={handleStartGame}
                className="btn btn-primary start-game-btn"
                disabled={isSubmitting}
            >
                {isSubmitting ? 'Préparation...' : 'Commencer la partie'}
            </button>
        </div>
    );
}