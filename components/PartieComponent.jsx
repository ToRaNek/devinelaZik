// components/PartieComponent.jsx
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useSocket } from '../lib/socketContext';
import Link from 'next/link';
import GameSettingsComponent from './GameSettingsComponent';
import EnhancedQuestionComponent from './EnhancedQuestionComponent';

export default function PartieComponent({ roomCode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { socket, isConnected, connectionStatus, lastError, reconnect } = useSocket();
  // Référence pour suivre si un composant est monté
  const isMounted = useRef(true);
  // Référence pour le conteneur de messages pour l'auto-scroll
  const messagesEndRef = useRef(null);

  // État des joueurs et de la salle
  const [players, setPlayers] = useState([]);
  const [room, setRoom] = useState(null);
  const [isHost, setIsHost] = useState(false);

  // État du jeu
  const [gameStatus, setGameStatus] = useState('waiting'); // waiting, playing, finished
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [timer, setTimer] = useState(0);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(10);
  const [answerStatus, setAnswerStatus] = useState(null); // correct, incorrect, timeout, null
  const [leaderboard, setLeaderboard] = useState([]);

  // État de l'interface
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [localConnectionStatus, setLocalConnectionStatus] = useState('connecting'); // 'connecting', 'connected', 'error'
  const [quizType, setQuizType] = useState('multiple_choice'); // multiple_choice, free_text

  // Stockage des joueurs qui ont déjà rejoint pour éviter les messages de jointure en double
  const [joinedPlayers, setJoinedPlayers] = useState(new Set());

  // Récupérer les données de la salle
  useEffect(() => {
    if (!roomCode || !session) return;

    const fetchRoomData = async () => {
      try {
        setLocalConnectionStatus('connecting');
        const res = await fetch(`/api/rooms/${roomCode}`);
        const data = await res.json();

        if (data.room) {
          setRoom(data.room);
          setPlayers(data.room.players);
          setIsHost(data.room.hostId === session.user.id);
          setLoading(false);

          // Initialiser la liste des joueurs déjà présents
          const initialJoinedPlayers = new Set(
              data.room.players.map(player => player.userId)
          );
          setJoinedPlayers(initialJoinedPlayers);
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

  // Auto-scroll vers le dernier message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Component lifecycle logging
  useEffect(() => {
    console.log("Component mounted - Connection info:", {
      status: connectionStatus,
      connected: isConnected,
      socketExists: !!socket,
      socketId: socket?.id || "none",
      lastError
    });

    // Cleanup on unmount
    return () => {
      isMounted.current = false;
      console.log("Component unmounting...");

      // Clean up by leaving the room when component unmounts
      if (socket && socket.connected && roomCode) {
        console.log(`Component unmounting, leaving room ${roomCode}`);
        socket.emit('leaveRoom', roomCode);
      }
    };
  }, [connectionStatus, isConnected, socket, lastError, roomCode]);

  // Vérifier et réagir aux changements d'état de connexion
  useEffect(() => {
    if (connectionStatus === 'error' && isMounted.current) {
      console.log("Connection in error state, will auto-retry in 3s");
      const timer = setTimeout(() => {
        if (isMounted.current) {
          console.log("Auto-retrying connection...");
          reconnect();
        }
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [connectionStatus, reconnect]);

  // Socket setup
  useEffect(() => {
    // Only proceed if we have everything we need
    if (!socket || !session?.user?.id || !roomCode || !room) {
      console.log('Waiting for required data:', {
        socketExists: !!socket,
        userId: session?.user?.id,
        roomCode,
        roomLoaded: !!room
      });
      return;
    }

    console.log('All conditions met, joining room:', roomCode);

    // Set auth params if needed
    if (!socket.auth || socket.auth.userId !== session.user.id) {
      socket.auth = { userId: session.user.id };
      console.log('Updated socket auth with userId:', session.user.id);
    }

    // Make sure we're connected
    if (!socket.connected) {
      console.log('Socket not connected, connecting now');
      socket.connect();
    }

    // Join the room
    if (socket.connected) {
      socket.emit('joinRoom', {
        roomCode,
        user: {
          id: session.user.id,
          name: session.user.name,
          pseudo: session.user.pseudo || session.user.name,
          image: session.user.image
        }
      });
      setLocalConnectionStatus('connected');
    }

    // EVENT HANDLERS
    const handleRoomData = (data) => {
      console.log('Received room data:', data);
      setPlayers(data.players);
    };

    const handlePlayerJoined = (data) => {
      console.log('Player joined:', data);

      // Vérifier si le joueur est déjà connu pour éviter les doublons
      if (!joinedPlayers.has(data.userId)) {
        setPlayers(prev => {
          // Éviter les doublons
          if (prev.some(p => p.userId === data.userId)) {
            return prev;
          }
          return [...prev, data];
        });

        // Ajouter un message système seulement si c'est un nouveau joueur
        setMessages(prev => [...prev, {
          system: true,
          message: `${data.user?.pseudo || 'Someone'} a rejoint la partie!`
        }]);

        // Ajouter le joueur à la liste des joueurs connus
        setJoinedPlayers(prev => new Set(prev).add(data.userId));
      }
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

        // Retirer le joueur de la liste des joueurs connus
        setJoinedPlayers(prev => {
          const newSet = new Set(prev);
          newSet.delete(userId);
          return newSet;
        });
      }
    };

    const handleGameStarted = (data) => {
      console.log('Game started:', data);
      setGameStatus('playing');
      setTotalRounds(data.rounds);
      setRound(1);

      // Stocker le type de quiz
      setQuizType(data.quizType || 'multiple_choice');

      // Message système
      setMessages(prev => [...prev, {
        system: true,
        message: `La partie commence! ${data.rounds} questions au total. Mode: ${data.quizType === 'free_text' ? 'Texte libre' : 'Choix multiples'}`
      }]);
    };

    const handleNewQuestion = (question) => {
      console.log('New question:', question);
      setCurrentQuestion(question);
      setTimer(30); // 30 secondes par question
      setAnswerStatus(null);

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

    const handleError = (error) => {
      console.error('Socket error:', error);
      setLocalConnectionStatus('error');
      setMessages(prev => [...prev, {
        system: true,
        message: `Erreur de connexion: ${error.message || 'Connexion au serveur perdue'}`
      }]);
    };

    // Register all event handlers
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
    socket.on('error', handleError);

    // Timer interval
    const timerInterval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    // Cleanup function
    return () => {
      console.log('Cleaning up socket events');
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
      socket.off('error', handleError);
      clearInterval(timerInterval);
    };
  }, [socket, isConnected, roomCode, session, players, room, totalRounds, reconnect, joinedPlayers]);

  // Démarrer la partie (hôte uniquement)
  const startGame = (settings) => {
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
      rounds: settings.rounds || 10,
      quizType: settings.quizType || 'multiple_choice',
      // Envoyer tous les services disponibles au lieu d'un seul
      source: 'all'  // Utiliser toutes les sources disponibles
    });
  };

  // Envoyer une réponse
  const submitAnswer = (answer) => {
    if (!socket || !isConnected || !answer.trim() || !currentQuestion) return;

    console.log('Submitting answer:', answer);
    socket.emit('submitAnswer', {
      roomCode,
      userId: session.user.id,
      answer: answer.trim(),
      questionId: currentQuestion.id
    });
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

  const attemptReconnection = () => {
    console.log("User requested manual reconnection");
    reconnect();
  };

  return (
      <div className="game-container">
        {/* Connection status */}
        <div className="connection-status">
          {isConnected ? (
              <span className="status-connected">✅ Connecté au serveur (ID: {socket?.id})</span>
          ) : localConnectionStatus === 'connecting' ? (
              <span className="status-connecting">🔄 Connexion en cours...</span>
          ) : (
              <div>
                <span className="status-disconnected">❌ Déconnecté: {lastError || 'Erreur inconnue'}</span>
                <button
                    onClick={attemptReconnection}
                    className="btn btn-sm btn-primary reconnect-button">
                  Reconnecter
                </button>
              </div>
          )}
        </div>

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
                  <GameSettingsComponent
                      onStartGame={startGame}
                      isHost={isHost}
                      hideSourceSelection={true} // Masquer la sélection de source
                  />
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
                        <button
                            onClick={() => startGame({
                              rounds: totalRounds,
                              quizType: quizType
                            })}
                            className="btn btn-primary new-game-btn"
                        >
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
                <EnhancedQuestionComponent
                    question={currentQuestion}
                    timer={timer}
                    onSubmitAnswer={submitAnswer}
                    answerStatus={answerStatus}
                />
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

                  {/* Debug information */}
                  <div style={{marginTop: '10px', fontSize: '0.8rem', color: '#666', textAlign: 'left',
                    padding: '8px', background: '#f8f9fa', borderRadius: '4px'}}>
                    Socket connected: {isConnected ? 'Yes' : 'No'} <br />
                    Socket ID: {socket?.id || 'None'} <br />
                    Room data loaded: {room ? 'Yes' : 'No'} <br />
                    User logged in: {session?.user?.id ? 'Yes' : 'No'} <br />
                    Auth status: {socket?.auth?.userId ? 'Auth set' : 'No auth'}
                  </div>

                  <div className="connection-status">
                    {isConnected ? (
                        <span className="status-connected">Connecté au serveur</span>
                    ) : (
                        <div>
                          <span className="status-disconnected">Connexion au serveur...</span>
                          <button
                              onClick={attemptReconnection}
                              className="btn btn-sm btn-primary"
                              style={{marginLeft: '10px', fontSize: '0.8rem', padding: '2px 8px'}}>
                            Reconnecter
                          </button>
                        </div>
                    )}
                  </div>
                </div>
            ) : gameStatus === 'finished' && (
                <div className="game-finished">
                  <h2>Partie terminée!</h2>
                  <p>Bravo à tous les participants!</p>
                </div>
            )}
          </div>

          {/* Chat sidebar on the right */}
          <div className="chat-sidebar">
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
                {/* Élément invisible pour l'auto-scroll */}
                <div ref={messagesEndRef} />
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