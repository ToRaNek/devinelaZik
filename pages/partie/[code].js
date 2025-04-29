// pages/partie/[code].js
import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import PartieComponent from '../../components/PartieComponent';
import Head from 'next/head';

export default function GameRoom() {
  const router = useRouter();
  const { code } = router.query;
  const { data: session, status } = useSession();

  // Redirect to login if not authenticated
  if (status === 'unauthenticated') {
    router.push('/auth/signin');
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Redirection vers la page de connexion...</p>
        </div>
    );
  }

  // Show loading state while session is loading
  if (status === 'loading') {
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Chargement...</p>
        </div>
    );
  }

  // If code is not yet available (due to client-side routing)
  if (!code) {
    return (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Chargement de la partie...</p>
        </div>
    );
  }

  return (
      <>
        <Head>
          <title>Partie {code} | Devine la Zik</title>
          <meta name="description" content="Jouez à Devine la Zik et testez vos connaissances musicales" />
        </Head>
        <PartieComponent roomCode={code} />
      </>
  );
}