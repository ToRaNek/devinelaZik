// components/LobbyComponent.jsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

export default function LobbyComponent() {
  const router = useRouter();
  const { data: session } = useSession();

  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // Vérifier si l'utilisateur a connecté un service de musique
  const hasMusicService = session?.user?.spotify || session?.user?.deezer;

  const createRoom = async () => {
    try {
      setIsCreatingRoom(true);
      setError(null);

      const res = await fetch('/api/rooms/create', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        router.push(`/partie/${data.code}`);
      } else {
        setError(data.error || 'Erreur lors de la création de la partie');
      }
    } catch (err) {
      setError('Erreur de serveur');
      console.error(err);
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const joinRoom = () => {
    if (!joinCode.trim()) {
      setError('Veuillez entrer un code de partie');
      return;
    }

    router.push(`/partie/${joinCode.trim().toUpperCase()}`);
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