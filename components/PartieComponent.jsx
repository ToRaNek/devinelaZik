// components/PartieComponent.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useSocket } from '../lib/socketContext';
import Link from 'next/link';

export default function PartieComponent({ roomCode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { socket, isConnected } = useSocket();

  const [players, setPlayers] = useState([]);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [gameStatus, setGameStatus] = useState('waiting'); // waiting, playing, finished
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [answer, setAnswer] = useState('');
  const [timer, setTimer] = useState(0);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [answerStatus, setAnswerStatus] = useState(null); // correct, incorrect, null
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  // Récupérer les données de la salle
  useEffect(() => {
    if (!roomCode || !session) return;

    const fetchRoomData = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}`);
        const data = await res.json();

        if (data.room) {
          setRoom(data.room);
          setPlayers(data.room.players);
          setIsHost(data.room.hostId === session.user.id);
          setLoading(false);
        } else {
          // Room not found
          alert("Cette salle n'existe pas!");
          router.push('/lobby');
        }
      } catch (err) {
        console.error('Error fetching room data:', err);
        setLoading(false);
      }
    };

    fetchRoomData();
  }, [roomCode, session, router]);

  // Configurer les gestionnaires d'événements socket
  useEffect(() => {
    if (!socket || !isConnected || !roomCode || !session || !room) return;

    console.log('Setting up socket events for room:', roomCode);

    // Rejoindre la salle
    socket.emit('joinRoom', {
      roomCode,
      user: {
        id: session.user.id,
        name: session.user.name,
        pseudo: session.user.pseudo || session.user.name,
        image: session.user.image
      }
    });

    // Gestionnaire pour les données de la salle
    const handleRoomData = (data) => {
      console.log('Received room data:', data);
      setPlayers(data.players);
    };

    // Gérer événements socket
    const handlePlayerJoined = (data) => {
      console.log('Player joined:', data);
      setPlayers(prev => {
        // Éviter les doublons
        if (prev.some(p => p.userId === data.userId)) {
          return prev;
        }
        return [...prev, data];
      });

      // Ajouter un message système
      setMessages(prev => [...prev, {
        system: true,
        message: `${data.user?.pseudo || 'Someone'} a rejoint la partie!`
      }]);
    };

    const handlePlayerLeft = (userId) => {
      console.log('Player left:', userId);
      const player = players.find(p => p.userId === userId);

      setPlayers(prev => prev.filter(p => p.userId !== userId));

      if (player) {
        setMessages(prev => [...prev, {
          system: true,
          message: `${player.user?.pseudo || 'Someone'} a quitté la partie.`
        }]);
      }
    };

    const handleGameStarted = (data) => {
      console.log('Game started:', data);
      setGameStatus('playing');
      setTotalRounds(data.rounds);
      setRound(1);

      // Message système
      setMessages(prev => [...prev, {
        system: true,
        message: `La partie commence! ${data.rounds} rounds au total.`
      }]);
    };

    const handleNewQuestion = (question) => {
      console.log('New question:', question);
      setCurrentQuestion(question);
      setTimer(30); // 30 secondes par question
      setAnswerStatus(null);
      setAnswer('');

      // Message système
      setMessages(prev => [...prev, {
        system: true,
        message: `Round ${question.round}/${totalRounds}: Nouvelle question! (${question.type})`
      }]);
    };

    const handleQuestionTimeout = (data) => {
      console.log('Question timeout:', data);
      setAnswerStatus('timeout');

      // Message système
      setMessages(prev => [...prev, {
        system: true,
        message: `Temps écoulé! La réponse était: ${data.correctAnswer}`
      }]);

      // Effacer la question après un délai
      setTimeout(() => {
        setCurrentQuestion(null);
      }, 5000);
    };

    const handleRoundEnd = (data) => {
      console.log('Round end:', data);
      setLeaderboard(data.scores);

      if (data.nextRound) {
        setRound(data.nextRound);
      } else {
        setGameStatus('finished');

        // Message système
        setMessages(prev => [...prev, {
          system: true,
          message: `Partie terminée! Vérifiez le classement.`
        }]);
      }
    };

    const handleAnswerResult = (data) => {
      console.log('Answer result:', data);
      setAnswerStatus(data.correct ? 'correct' : 'incorrect');

      // Message système
      setMessages(prev => [...prev, {
        system: true,
        message: data.correct ?
            `Bravo! Vous avez gagné ${data.points} points.` :
            `Incorrect. La réponse était: ${data.answer}`
      }]);

      // Effacer la question après un délai si correct
      if (data.correct) {
        setTimeout(() => {
          setCurrentQuestion(null);
        }, 2000);
      }
    };

    const handleMessage = (msg) => {
      console.log('Received message:', msg);
      setMessages(prev => [...prev, msg]);
    };

    const handleHostChanged = (newHostId) => {
      console.log('Host changed to:', newHostId);
      setIsHost(newHostId === session.user.id);
    };

    // Enregistrer les gestionnaires d'événements
    socket.on('roomData', handleRoomData);
    socket.on('playerJoined', handlePlayerJoined);
    socket.on('playerLeft', handlePlayerLeft);
    socket.on('gameStarted', handleGameStarted);
    socket.on('newQuestion', handleNewQuestion);
    socket.on('questionTimeout', handleQuestionTimeout);
    socket.on('roundEnd', handleRoundEnd);
    socket.on('answerResult', handleAnswerResult);
    socket.on('message', handleMessage);
    socket.on('hostChanged', handleHostChanged);

    // Gérer le timer
    const timerInterval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    // Nettoyage
    return () => {
      console.log('Cleaning up socket events');
      socket.emit('leaveRoom', roomCode);
      socket.off('roomData', handleRoomData);
      socket.off('playerJoined', handlePlayerJoined);
      socket.off('playerLeft', handlePlayerLeft);
      socket.off('gameStarted', handleGameStarted);
      socket.off('newQuestion', handleNewQuestion);
      socket.off('questionTimeout', handleQuestionTimeout);
      socket.off('roundEnd', handleRoundEnd);
      socket.off('answerResult', handleAnswerResult);
      socket.off('message', handleMessage);
      socket.off('hostChanged', handleHostChanged);
      clearInterval(timerInterval);
    };
  }, [socket, isConnected, roomCode, session, players, room, totalRounds]);

  // Démarrer la partie (hôte uniquement)
  const startGame = () => {
    if (!socket || !isConnected || !isHost) {
      console.error("Cannot start game: not connected or not host");
      return;
    }

    // Vérifier si l'hôte a connecté un service de musique
    if (!session.user.spotify && !session.user.deezer) {
      alert("Vous devez connecter Spotify ou Deezer pour héberger une partie!");
      return;
    }

    socket.emit('startGame', {
      roomCode,
      rounds: 10,
      source: session.user.spotify ? 'spotify' : 'deezer'
    });
  };

  // Envoyer une réponse
  const submitAnswer = (e) => {
    e.preventDefault();
    if (!socket || !isConnected || !answer.trim() || !currentQuestion) return;

    console.log('Submitting answer:', answer);
    socket.emit('submitAnswer', {
      roomCode,
      userId: session.user.id,
      answer: answer.trim(),
      questionId: currentQuestion.id
    });

    setAnswer('');
  };

  // Envoyer un message de chat
  const sendMessage = (e) => {
    e.preventDefault();
    if (!socket || !isConnected || !messageInput.trim()) return;

    console.log('Sending message:', messageInput);
    socket.emit('sendMessage', {
      roomCode,
      user: {
        id: session.user.id,
        pseudo: session.user.pseudo || session.user.name,
        image: session.user.image
      },
      message: messageInput.trim()
    });

    setMessageInput('');
  };

  // Copier le lien de la partie
  const copyRoomLink = () => {
    const url = `${window.location.origin}/partie/${roomCode}`;
    navigator.clipboard.writeText(url);
    alert('Lien copié dans le presse-papier!');
  };

  // Quitter la partie
  const leaveRoom = () => {
    if (confirm('Êtes-vous sûr de vouloir quitter la partie?')) {
      router.push('/lobby');
    }
  };

  // UI de chargement
  if (loading) {
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Chargement de la partie...</p>
        </div>
    );
  }

  if (!room) {
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Connexion à la salle de jeu...</p>
        </div>
    );
  }

  return (
      <div className="game-container">
        <header className="game-header">
          <h1>Devine la Zik - Salle: {roomCode}</h1>
          <div className="room-actions">
            <button onClick={copyRoomLink} className="btn btn-secondary">
              Partager
            </button>
            <button onClick={leaveRoom} className="btn btn-danger">
              Quitter
            </button>
          </div>
        </header>

        <div className="game-layout">
          <div className="players-sidebar">
            <h2>Joueurs ({players.length})</h2>
            <ul className="players-list">
              {players.map(player => (
                  <li key={player.userId} className={`player-item ${player.userId === session.user.id ? 'current-player' : ''}`}>
                    <div className="player-avatar">
                      {player.user?.image ? (
                          <img src={player.user.image} alt={player.user?.pseudo || 'Avatar'} />
                      ) : (
                          <div className="default-avatar">{(player.user?.pseudo || 'User')[0]}</div>
                      )}
                    </div>
                    <div className="player-info">
                  <span className="player-name">
                    {player.user?.pseudo || 'Unknown'}
                    {player.userId === room.hostId && <span className="host-badge">Hôte</span>}
                    {player.userId === session.user.id && <span className="you-badge">Vous</span>}
                  </span>
                      <span className="player-score">Score: {player.score || 0}</span>
                    </div>
                  </li>
              ))}
            </ul>

            {gameStatus === 'waiting' && isHost && (
                <div className="host-controls">
                  <button
                      onClick={startGame}
                      className="btn btn-primary start-game-btn"
                      disabled={!isConnected}
                  >
                    {!isConnected ? 'Connexion...' : 'Commencer la partie'}
                  </button>
                  {players.length < 2 && (
                      <p className="waiting-message">En attente d'autres joueurs...</p>
                  )}
                </div>
            )}

            {gameStatus === 'waiting' && !isHost && (
                <div className="waiting-message">
                  <p>En attente que l'hôte démarre la partie...</p>
                </div>
            )}

            {gameStatus === 'playing' && (
                <div className="game-status">
                  <div className="round-info">
                    <span className="round-counter">Round {round}/{totalRounds}</span>
                    {timer > 0 && currentQuestion && (
                        <span className={`timer ${timer <= 10 ? 'timer-warning' : ''}`}>
                    {timer}s
                  </span>
                    )}
                  </div>
                </div>
            )}

            {gameStatus === 'finished' && (
                <div className="game-over">
                  <h3>Partie terminée!</h3>
                  <div className="final-leaderboard">
                    <h4>Classement final</h4>
                    <ol className="leaderboard-list">
                      {leaderboard.slice(0, 5).map((player, index) => (
                          <li key={player.userId} className={`leaderboard-item ${player.userId === session.user.id ? 'current-player' : ''}`}>
                            <span className="position">{index + 1}</span>
                            <span className="player-name">{player.user?.pseudo}</span>
                            <span className="final-score">{player.score} pts</span>
                          </li>
                      ))}
                    </ol>

                    {isHost && (
                        <button onClick={startGame} className="btn btn-primary new-game-btn">
                          Nouvelle partie
                        </button>
                    )}

                    <Link href="/lobby" className="btn btn-secondary back-lobby-btn">
                      Retour au lobby
                    </Link>
                  </div>
                </div>
            )}
          </div>

          <div className="game-main">
            {gameStatus === 'playing' && currentQuestion ? (
                <div className="question-container">
                  <div className="question-header">
                    <h2>
                      {currentQuestion.type === 'artist' && "Devinez l'artiste!"}
                      {currentQuestion.type === 'song' && `Devinez le titre de ${currentQuestion.artistName}!`}
                      {currentQuestion.type === 'album' && `Devinez l'album de ${currentQuestion.artistName}!`}
                    </h2>
                    <div className={`timer-bar ${timer <= 10 ? 'timer-critical' : ''}`}>
                      <div className="timer-progress" style={{ width: `${(timer / 30) * 100}%` }}></div>
                    </div>
                  </div>

                  <div className="media-container">
                    {currentQuestion.type === 'artist' && currentQuestion.previewUrl && (
                        <div className="audio-player">
                          <audio src={currentQuestion.previewUrl} controls autoPlay></audio>
                          <div className="hint">
                            <p>Écoutez l'extrait et devinez l'artiste...</p>
                          </div>
                        </div>
                    )}

                    {(currentQuestion.type === 'song' || currentQuestion.type === 'album') && (
                        <div className="album-cover">
                          <img
                              src={currentQuestion.albumCover || '/placeholder-album.png'}
                              alt="Album cover"
                          />
                          {currentQuestion.type === 'song' && currentQuestion.previewUrl && (
                              <audio src={currentQuestion.previewUrl} controls autoPlay></audio>
                          )}
                        </div>
                    )}
                  </div>

                  <form onSubmit={submitAnswer} className="answer-form">
                    <div className={`answer-input-group ${answerStatus ? `answer-${answerStatus}` : ''}`}>
                      <input
                          type="text"
                          value={answer}
                          onChange={(e) => setAnswer(e.target.value)}
                          placeholder="Votre réponse..."
                          className="answer-input"
                          disabled={answerStatus === 'correct' || answerStatus === 'timeout'}
                      />
                      <button
                          type="submit"
                          className="btn btn-primary submit-answer"
                          disabled={answerStatus === 'correct' || answerStatus === 'timeout'}
                      >
                        Valider
                      </button>
                    </div>

                    {answerStatus === 'correct' && (
                        <div className="answer-feedback correct">
                          <span>Bravo! Réponse correcte</span>
                        </div>
                    )}

                    {answerStatus === 'incorrect' && (
                        <div className="answer-feedback incorrect">
                          <span>Incorrect, essayez encore!</span>
                        </div>
                    )}

                    {answerStatus === 'timeout' && (
                        <div className="answer-feedback timeout">
                          <span>Temps écoulé! La réponse était: {currentQuestion.answer}</span>
                        </div>
                    )}
                  </form>
                </div>
            ) : gameStatus === 'waiting' ? (
                <div className="waiting-screen">
                  <h2>En attente du début de la partie</h2>
                  <p>Partagez le code <strong>{roomCode}</strong> avec vos amis pour jouer ensemble!</p>
                  <div className="room-share">
                    <div className="room-code">{roomCode}</div>
                    <button onClick={copyRoomLink} className="btn btn-secondary">
                      Copier le lien
                    </button>
                  </div>
                  <div className="connection-status">
                    {isConnected ? (
                        <span className="status-connected">Connecté au serveur</span>
                    ) : (
                        <span className="status-disconnected">Connexion au serveur...</span>
                    )}
                  </div>
                </div>
            ) : gameStatus === 'finished' && (
                <div className="game-finished">
                  <h2>Partie terminée!</h2>
                  <p>Bravo à tous les participants!</p>
                </div>
            )}

            <div className="chat-container">
              <h3>Chat</h3>
              <div className="messages-container">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`message ${msg.system ? 'system-message' : ''} ${msg.user?.id === session.user.id ? 'own-message' : ''}`}
                    >
                      {!msg.system && (
                          <div className="message-header">
                            {msg.user?.image && (
                                <img
                                    src={msg.user.image}
                                    alt={msg.user.pseudo}
                                    className="message-avatar"
                                />
                            )}
                            <span className="message-author">{msg.user?.pseudo || 'Unknown'}</span>
                          </div>
                      )}
                      <div className="message-content">
                        {msg.message}
                      </div>
                    </div>
                ))}
              </div>
              <form onSubmit={sendMessage} className="chat-form">
                <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Envoyer un message..."
                    className="chat-input"
                />
                <button type="submit" className="btn btn-primary send-button" disabled={!isConnected}>
                  Envoyer
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
  );
}