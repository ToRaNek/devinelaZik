// pages/profile.js
import { useSession } from 'next-auth/react';
import ProfileComponent from '../components/ProfileComponent';
import Head from 'next/head';

export default function ProfilePage() {
    const { status } = useSession();

    // If loading, show a loading spinner
    if (status === 'loading') {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Chargement...</p>
            </div>
        );
    }

    return (
        <>
            <Head>
                <title>Mon Profil | Devine la Zik</title>
                <meta name="description" content="Gérez votre profil et vos services de musique pour jouer à Devine la Zik" />
            </Head>
            <ProfileComponent />
        </>
    );
}