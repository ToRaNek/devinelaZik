// pages/lobby.js
import { useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useRouter } from 'next/router';
import LobbyComponent from '../components/LobbyComponent';
import Head from 'next/head';

export default function Lobby() {
  const router = useRouter();
  const { data: session, status } = useSession();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      signIn();
    }
  }, [status]);

  // If not linked to a music service, redirect to profile
  useEffect(() => {
    if (session && !session.user.spotify && !session.user.deezer) {
      router.push('/profile');
    }
  }, [session, router]);

  // Show loading state while session is loading
  if (status === 'loading') {
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Chargement...</p>
        </div>
    );
  }

  // If not authenticated, show loading until redirect happens
  if (!session) {
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Redirection vers la page de connexion...</p>
        </div>
    );
  }

  return (
      <>
        <Head>
          <title>Lobby | Devine la Zik</title>
          <meta name="description" content="Créez ou rejoignez une partie de Devine la Zik" />
        </Head>
        <LobbyComponent />
      </>
  );
}