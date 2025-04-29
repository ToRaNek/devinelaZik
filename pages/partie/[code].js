// pages/partie/[code].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';

export default function GameRoom() {
  const router = useRouter();
  const { code } = router.query;
  const { data: session, status } = useSession();
  
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  
  // Initialize socket connection
  useEffect(() => {
    if (!code || status !== 'authenticated') return;
    
    const newSocket = io();
    setSocket(newSocket);
    
    // Clean up on unmount
    return () => {
      if (newSocket) {
        newSocket.disconnect();
      }
    };
  }, [code, status]);
  
  // Set up socket event handlers
  useEffect(() => {
    if (!socket || !code || !session) return;
    
    // Join the room
    socket.emit('joinRoom', code);
    
    // Check if user is the host
    fetch(`/api/rooms/${code}`)
      .then(res => res.json())
      .then(data => {
        if (data.room) {
          setIsHost(data.room.hostId === session.user.id);
          setPlayers(data.room.players || []);
        }
      })
      .catch(err => console.error('Error fetching room data:', err));
    
    // Set up event listeners
    socket.on('playerJoined', (newPlayer) => {
      setPlayers(prev => [...prev, newPlayer]);
    });
    
    socket.on('playerLeft', (playerId) => {
      setPlayers(prev => prev.filter(p => p.userId !== playerId));
    });
    
    socket.on('gameStarted', () => {
      setGameStarted(true);
    });
    
    socket.on('newQuestion', (question) => {
      setCurrentQuestion(question);
    });
    
    socket.on('gameEnded', () => {
      setGameStarted(false);
      setCurrentQuestion(null);
    });
    
    socket.on('message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });
    
    // Clean up on unmount
    return () => {
      socket.emit('leaveRoom', code);
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('gameStarted');
      socket.off('newQuestion');
      socket.off('gameEnded');
      socket.off('message');
    };
  }, [socket, code, session]);
  
  const startGame = () => {
    if (!socket || !isHost) return;
    socket.emit('startGame', code);
  };
  
  const sendMessage = (e) => {
    e.preventDefault();
    if (!socket || !messageInput.trim()) return;
    
    socket.emit('sendMessage', {
      roomCode: code,
      user: session.user.name,
      message: messageInput
    });
    
    setMessageInput('');
  };
  
  if (status === 'loading') {
    return <div>Loading...</div>;
  }
  
  if (!session) {
    return <div>Please sign in to join a game room.</div>;
  }
  
  if (!code) {
    return <div>Loading room...</div>;
  }
  
  return (
    <div>
      <h1>Game Room: {code}</h1>
      
      <div>
        <h2>Players ({players.length})</h2>
        <ul>
          {players.map(player => (
            <li key={player.userId}>
              {player.user?.name || 'Unknown'} {player.score ? `- Score: ${player.score}` : ''}
              {player.userId === session.user.id && ' (You)'}
            </li>
          ))}
        </ul>
      </div>
      
      {isHost && !gameStarted && (
        <button onClick={startGame}>Start Game</button>
      )}
      
      {gameStarted && currentQuestion && (
        <div>
          <h2>Current Question</h2>
          {/* Display question based on type */}
          {currentQuestion.type === 'artist' && (
            <div>
              <p>Guess the artist!</p>
              <audio src={currentQuestion.previewUrl} controls />
            </div>
          )}
          
          {currentQuestion.type === 'song' && (
            <div>
              <p>Guess the song by {currentQuestion.artistName}!</p>
              <img src={currentQuestion.albumCover} alt="Album cover" />
            </div>
          )}
          
          {currentQuestion.type === 'album' && (
            <div>
              <p>Guess the album by {currentQuestion.artistName}!</p>
              <img src={currentQuestion.albumCover} alt="Album cover" />
            </div>
          )}
          
          {/* Answer form would go here */}
        </div>
      )}
      
      <div>
        <h2>Chat</h2>
        <div>
          {messages.map((msg, i) => (
            <div key={i}>
              <strong>{msg.user}:</strong> {msg.message}
            </div>
          ))}
        </div>
        <form onSubmit={sendMessage}>
          <input
            type="text"
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            placeholder="Type a message..."
          />
          <button type="submit">Send</button>
        </form>
      </div>
    </div>
  );
}