// components/LobbyComponent.jsx
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useSocket } from '../lib/socketContext';
import Link from 'next/link';

export default function LobbyComponent() {
  const router = useRouter();
  const { data: session } = useSession();
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (socket && session?.user?.id) {
      // Envoyer l'ID utilisateur au serveur socket
      socket.auth = { userId: session.user.id };

      // Si le socket est déjà connecté, le reconnecter pour appliquer l'auth
      if (socket.connected) {
        socket.disconnect().connect();
      }
    }
  }, [socket, session]);

  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Vérifier si l'utilisateur a connecté un service de musique
  const hasMusicService = session?.user?.spotify || session?.user?.deezer;

  const createRoom = async () => {
    try {
      setIsCreatingRoom(true);
      setError(null);

      const res = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await res.json();

      if (res.ok) {
        router.push(`/partie/${data.code}`);
      } else {
        setError(data.error || 'Erreur lors de la création de la partie');
      }
    } catch (err) {
      console.error('Error creating room:', err);
      setError('Erreur de serveur. Veuillez réessayer.');
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const joinRoom = () => {
    if (!joinCode.trim()) {
      setError('Veuillez entrer un code de partie');
      return;
    }

    const formattedCode = joinCode.trim().toUpperCase();
    // Validate code format (6 alphanumeric characters)
    if (!/^[A-Z0-9]{6}$/.test(formattedCode)) {
      setError('Le code de partie doit contenir 6 caractères');
      return;
    }

    router.push(`/partie/${formattedCode}`);
  };

  // Si l'utilisateur n'a pas lié un service de musique, afficher un avertissement
  if (!hasMusicService) {
    return (
        <div className="lobby-container service-warning">
          <h2>Service de musique requis</h2>
          <p>
            Vous devez lier un compte Spotify ou Deezer pour jouer à Devine la Zik.
          </p>
          <Link href="/profile" className="btn btn-primary">
            Configurer mon profil
          </Link>
        </div>
    );
  }

  return (
      <div className="lobby-container">
        <h1 className="lobby-title">Devine la Zik</h1>

        <div className="lobby-card create-game">
          <h2>Créer une partie</h2>
          <p>Créez une nouvelle partie et invitez vos amis à la rejoindre.</p>
          <button
              onClick={createRoom}
              className="btn btn-primary create-game-btn"
              disabled={isCreatingRoom}
          >
            {isCreatingRoom ? 'Création...' : 'Créer une partie'}
          </button>
        </div>

        <div className="lobby-card join-game">
          <h2>Rejoindre une partie</h2>
          <p>Entrez le code de la partie pour la rejoindre.</p>
          <div className="join-form">
            <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="CODE DE PARTIE"
                maxLength={6}
                className="join-code-input"
            />
            <button onClick={joinRoom} className="btn btn-secondary join-game-btn">
              Rejoindre
            </button>
          </div>
        </div>

        {error && (
            <div className="error-message">
              {error}
            </div>
        )}

        <div className="lobby-info">
          <h3>Comment jouer</h3>
          <p>
            Dans Devine la Zik, vous devez deviner des titres, artistes ou albums
            en écoutant des extraits musicaux. Jouez avec vos amis et voyez qui
            a la meilleure connaissance musicale !
          </p>
        </div>
      </div>
  );
}