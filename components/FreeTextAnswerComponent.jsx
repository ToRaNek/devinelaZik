// components/FreeTextAnswerComponent.jsx
import { useState, useEffect, useRef } from 'react';

export default function FreeTextAnswerComponent({
                                                    onSubmit,
                                                    correctAnswer,
                                                    artistName,
                                                    disabled,
                                                    answerStatus
                                                }) {
    const [userInput, setUserInput] = useState('');
    const [formattedAnswer, setFormattedAnswer] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const inputRef = useRef(null);

    // Normaliser une chaîne pour la comparaison (sans accents, tout en minuscule)
    const normalizeString = (str) => {
        return str.toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprimer les accents
            .replace(/[^\w\s]/g, '') // Supprimer les caractères spéciaux
            .trim();
    };

    // Formater la réponse selon le type de question
    useEffect(() => {
        if (correctAnswer && artistName) {
            const isArtistQuestion = normalizeString(correctAnswer) === normalizeString(artistName);

            if (isArtistQuestion) {
                setFormattedAnswer(correctAnswer);
            } else {
                setFormattedAnswer(`${correctAnswer} (${artistName})`);
            }
        }
    }, [correctAnswer, artistName]);

    // Générer des suggestions à partir de l'entrée utilisateur
    useEffect(() => {
        if (!correctAnswer || !userInput.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        const normalizedInput = normalizeString(userInput);
        const normalizedAnswer = normalizeString(correctAnswer);

        // Si l'entrée correspond déjà à la réponse, ne pas montrer de suggestions
        if (normalizedInput === normalizedAnswer) {
            setSuggestions([]);
            setShowSuggestions(false);
            return;
        }

        // Si la réponse contient l'entrée utilisateur, suggérer
        if (normalizedAnswer.includes(normalizedInput)) {
            // Calculer les suggestions en se basant sur le formatage souhaité
            const baseSuggestion = formattedAnswer;

            // Suggestions multiples si plusieurs mots commencent par l'entrée
            const words = normalizedAnswer.split(' ');
            const matchingIndices = words.reduce((indices, word, index) => {
                if (word.startsWith(normalizedInput) ||
                    (index > 0 && normalizedInput.includes(words.slice(0, index).join(' ')) && word.startsWith(normalizedInput.replace(words.slice(0, index).join(' '), '').trim()))) {
                    indices.push(index);
                }
                return indices;
            }, []);

            if (matchingIndices.length > 0) {
                // Créer jusqu'à 3 suggestions
                const newSuggestions = matchingIndices.slice(0, 3).map(index => {
                    const suggestionParts = formattedAnswer.split(' ');
                    return suggestionParts.slice(0, index + 1).join(' ');
                });

                // Ajouter la suggestion complète si elle n'existe pas déjà
                if (!newSuggestions.includes(formattedAnswer)) {
                    newSuggestions.push(formattedAnswer);
                }

                setSuggestions(newSuggestions);
                setShowSuggestions(true);
            } else {
                // Suggestion simple
                setSuggestions([baseSuggestion]);
                setShowSuggestions(true);
            }
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [userInput, correctAnswer, formattedAnswer]);

    const handleInputChange = (e) => {
        setUserInput(e.target.value);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // Si une suggestion est sélectionnée, utiliser cette valeur
        if (showSuggestions && suggestions.length > 0) {
            const submittedAnswer = suggestions[0].includes('(')
                ? suggestions[0].split('(')[0].trim()
                : suggestions[0];

            onSubmit(submittedAnswer);
        } else {
            onSubmit(userInput.trim());
        }
    };

    const handleSuggestionClick = (suggestion) => {
        // Extraire la partie réponse uniquement (avant la parenthèse)
        const answer = suggestion.includes('(')
            ? suggestion.split('(')[0].trim()
            : suggestion;

        setUserInput(answer);
        setShowSuggestions(false);

        // Soumettre automatiquement si c'est la réponse complète
        if (normalizeString(answer) === normalizeString(correctAnswer)) {
            onSubmit(answer);
        }

        // Remettre le focus sur l'input
        if (inputRef.current) {
            inputRef.current.focus();
        }
    };

    // Fermer les suggestions si on clique en dehors
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (inputRef.current && !inputRef.current.contains(event.target)) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="free-text-answer">
            <form onSubmit={handleSubmit} className="answer-form">
                <div className={`answer-input-group ${answerStatus ? `answer-${answerStatus}` : ''}`}>
                    <div className="input-with-suggestions">
                        <input
                            ref={inputRef}
                            type="text"
                            value={userInput}
                            onChange={handleInputChange}
                            placeholder="Tapez votre réponse..."
                            className="answer-input"
                            disabled={disabled}
                            autoComplete="off"
                            onFocus={() => userInput.trim() && suggestions.length > 0 && setShowSuggestions(true)}
                        />

                        {showSuggestions && suggestions.length > 0 && (
                            <ul className="suggestions-list">
                                {suggestions.map((suggestion, index) => (
                                    <li
                                        key={index}
                                        className="suggestion-item"
                                        onClick={() => handleSuggestionClick(suggestion)}
                                    >
                                        {suggestion}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary submit-answer"
                        disabled={disabled || !userInput.trim()}
                    >
                        Valider
                    </button>
                </div>
            </form>

            <style jsx>{`
                .free-text-answer {
                    position: relative;
                    width: 100%;
                }

                .input-with-suggestions {
                    position: relative;
                    flex-grow: 1;
                }

                .suggestions-list {
                    position: absolute;
                    top: 100%;
                    left: 0;
                    right: 0;
                    background: white;
                    border: 1px solid #dee2e6;
                    border-top: none;
                    border-radius: 0 0 4px 4px;
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    max-height: 200px;
                    overflow-y: auto;
                    z-index: 10;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.1);
                }

                .suggestion-item {
                    padding: 10px 15px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }

                .suggestion-item:hover {
                    background-color: #f8f9fa;
                }

                .answer-input-group {
                    display: flex;
                    gap: 0.75rem;
                }

                .answer-input {
                    flex-grow: 1;
                    padding: 0.75rem 1rem;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                    font-size: 1rem;
                    width: 100%;
                }

                .submit-answer {
                    padding: 0.75rem 1.5rem;
                    white-space: nowrap;
                }

                .answer-correct .answer-input {
                    border-color: #28a745;
                    background-color: #d4edda;
                }

                .answer-incorrect .answer-input {
                    border-color: #dc3545;
                    background-color: #f8d7da;
                }

                .answer-timeout .answer-input {
                    border-color: #ffc107;
                    background-color: #fff3cd;
                }
            `}</style>
        </div>
    );
}