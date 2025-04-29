"use client";
import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function Lobby() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  // État pour suivre si le composant est monté côté client
  const [mounted, setMounted] = useState(false);
  const [newLink, setNewLink] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState(null);
  
  // Effet pour marquer que le composant est monté côté client
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // Rediriger vers la page de connexion côté client uniquement
  useEffect(() => {
    if (mounted && status !== 'loading' && !session) {
      signIn();
    }
  }, [mounted, status, session]);

  useEffect(() => {
    if (session && !session.user.spotify && !session.user.deezer) {
      router.push('/profile');
    }
  }, [session]);
  
  // Afficher un état de chargement tant que nous ne sommes pas montés côté client
  // ou que la session est en cours de chargement
  if (!mounted || status === 'loading') {
    return <div>Chargement...</div>;
  }
  
  // Si aucune session et que nous sommes côté client, montrer une page provisoire
  if (!session) {
    return <div>Redirection vers la page de connexion...</div>;
  }

  const createRoom = async () => {
    try {
      const res = await fetch('/api/rooms/create', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const code = data.code;
        router.push(`/partie/${code}`);
      } else {
        setError(data.error || 'Erreur lors de la création de la partie');
      }
    } catch (err) {
      setError('Erreur de serveur');
      console.error(err);
    }
  };

  const joinRoom = () => {
    if (joinCode) {
      router.push(`/partie/${joinCode}`);
    }
  };

  return (
    <div>
      <h1>Lobby</h1>
      <div>
        <button onClick={createRoom}>Créer une partie</button>
        {error && <p style={{ color: 'red' }}>Erreur : {error}</p>}
        {newLink && (
          <p>Partie créée ! Lien : <a href={newLink}>{newLink}</a></p>
        )}
      </div>
      <div style={{ marginTop: '2rem' }}>
        <h2>Rejoindre une partie</h2>
        <input
          placeholder="Code de la partie"
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())}
        />
        <button onClick={joinRoom}>Rejoindre</button>
      </div>
    </div>
  );
}