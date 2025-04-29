// profile.js corrigé
"use client";
import { useState, useEffect } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function ProfilPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  
  // État pour suivre si le composant est monté côté client
  const [mounted, setMounted] = useState(false);
  
  // Initialiser les états avec des valeurs par défaut
  const [pseudo, setPseudo] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  
  // Effet pour marquer que le composant est monté côté client
  useEffect(() => {
    setMounted(true);
    
    // Mise à jour des états une fois que la session est chargée
    if (session) {
      setPseudo(session.user.pseudo || '');
      setPhotoUrl(session.user.image || '');
    }
  }, [session]);
  
  // Rediriger vers la page de connexion côté client uniquement
  useEffect(() => {
    if (mounted && status !== 'loading' && !session) {
      signIn();
    }
  }, [mounted, status, session]);
  
  // Afficher un état de chargement tant que nous ne sommes pas montés côté client
  // ou que la session est en cours de chargement
  if (!mounted || status === 'loading') {
    return <div>Chargement...</div>;
  }
  
  // Si aucune session et que nous sommes côté client, montrer une page provisoire
  // (la redirection se produira via useEffect)
  if (!session) {
    return <div>Redirection vers la page de connexion...</div>;
  }

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo, photoUrl })
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.suggestion) {
        alert(`${data.error}. Suggestion : ${data.suggestion}`);
        setPseudo(data.suggestion);
      } else {
        alert(data.error);
      }
    } else {
      alert('Profil mis à jour');
    }
  };

  const handleConnect = (provider) => {
    signIn(provider, { callbackUrl: '/profile' });
  };
  
  const handleDisconnect = async (provider) => {
    await fetch('/api/profile/unlink', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider })
    });
    router.reload();
  };

  return (
    <div>
      <h1>Profil utilisateur</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Pseudo :
          <input value={pseudo} onChange={e => setPseudo(e.target.value)} required />
        </label>
        <label>
          Photo de profil :
          {photoUrl
            ? <img src={photoUrl} alt="Photo" width={100} />
            : <img src={`https://ui-avatars.com/api/?name=${pseudo}&background=random&color=ffffff`} alt="Avatar" width={100} />
          }
          <input type="file" accept="image/*" onChange={handlePhotoUpload} />
        </label>
        <button type="submit">Enregistrer</button>
      </form>
      <h2>Comptes liés</h2>
      {session.user.spotify
        ? <button onClick={() => handleDisconnect('spotify')}>Délier Spotify</button>
        : <button onClick={() => handleConnect('spotify')}>Lier Spotify</button>}
      {session.user.deezer
        ? <button onClick={() => handleDisconnect('deezer')}>Délier Deezer</button>
        : <button onClick={() => handleConnect('deezer')}>Lier Deezer</button>}
      <button onClick={() => signOut()}>Se déconnecter</button>
    </div>
  );
}
