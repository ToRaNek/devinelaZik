// components/ProfileComponent.jsx
import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ProfileComponent() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [pseudo, setPseudo] = useState('');
    const [photoUrl, setPhotoUrl] = useState('');
    const [feedback, setFeedback] = useState('');
    const [feedbackType, setFeedbackType] = useState(''); // 'success' or 'error'
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConnectingService, setIsConnectingService] = useState(false);

    // Update states once session is loaded
    useEffect(() => {
        if (session) {
            setPseudo(session.user.pseudo || '');
            setPhotoUrl(session.user.image || '');
        }
    }, [session]);

    // Redirect to sign in if not authenticated
    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/auth/signin');
        }
    }, [status, router]);

    if (status === 'loading') {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Chargement de votre profil...</p>
            </div>
        );
    }

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
        setIsSubmitting(true);

        try {
            // Validation
            if (!pseudo.trim()) {
                setFeedbackType('error');
                setFeedback('Le pseudo ne peut pas être vide');
                setIsSubmitting(false);
                return;
            }

            const res = await fetch('/api/profile/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pseudo, photoUrl })
            });

            const data = await res.json();

            if (!res.ok) {
                setFeedbackType('error');
                if (data.suggestion) {
                    setFeedback(`${data.error}. Suggestion: ${data.suggestion}`);
                    setPseudo(data.suggestion);
                } else {
                    setFeedback(data.error || 'Une erreur est survenue');
                }
            } else {
                setFeedbackType('success');
                setFeedback('Profil mis à jour avec succès!');

                // Update session data by refreshing the page after a short delay
                setTimeout(() => {
                    router.reload();
                }, 1500);
            }
        } catch (error) {
            console.error('Profile update error:', error);
            setFeedbackType('error');
            setFeedback('Erreur lors de la mise à jour du profil');
        } finally {
            setIsSubmitting(false);
        }
    };

    const connectService = (provider) => {
        setIsConnectingService(true);

        // Définir les options pour signIn
        const options = {
            redirect: true,
            callbackUrl: `${window.location.origin}/profile`
        };

        signIn(provider, options);
    };

    const unlinkService = async (provider) => {
        if (window.confirm(`Êtes-vous sûr de vouloir délier votre compte ${provider}?`)) {
            try {
                const res = await fetch('/api/profile/unlink', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider })
                });

                if (res.ok) {
                    setFeedbackType('success');
                    setFeedback(`Compte ${provider} délié avec succès`);

                    // Refresh the page after a short delay
                    setTimeout(() => {
                        router.reload();
                    }, 1500);
                } else {
                    const data = await res.json();
                    setFeedbackType('error');
                    setFeedback(data.error || `Erreur lors de la déconnexion de ${provider}`);
                }
            } catch (error) {
                console.error('Service unlink error:', error);
                setFeedbackType('error');
                setFeedback(`Erreur lors de la déconnexion de ${provider}`);
            }
        }
    };

    function ServiceStatus({ service, isConnected }) {
        return (
            <div className="service-status">
                <div className={`status-indicator ${isConnected ? 'connected' : ''}`}>
                    {isConnected ? 'Lié' : 'Non lié'}
                </div>
                <span className="service-name">{service}</span>
            </div>
        );
    }

    return (
        <div className="profile-container">
            <h1>Mon Profil</h1>

            <div className="profile-header">
                {photoUrl ? (
                    <img src={photoUrl} alt="Photo de profil" className="profile-avatar" />
                ) : (
                    <div className="default-avatar">
                        {pseudo ? pseudo[0].toUpperCase() : '?'}
                    </div>
                )}
            </div>

            {feedback && (
                <div className={`feedback-message ${feedbackType}`}>
                    {feedback}
                </div>
            )}

            <form onSubmit={handleSubmit} className="profile-form">
                <div className="form-group">
                    <label htmlFor="pseudo">Pseudo</label>
                    <input
                        id="pseudo"
                        type="text"
                        value={pseudo}
                        onChange={(e) => setPseudo(e.target.value)}
                        required
                        className="form-input"
                        disabled={isSubmitting}
                    />
                </div>

                <div className="form-group">
                    <label htmlFor="photo">Photo de profil</label>
                    <input
                        id="photo"
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        className="form-input"
                        disabled={isSubmitting}
                    />
                    <small className="form-help">Format recommandé: JPG ou PNG, carré</small>
                </div>

                <button
                    type="submit"
                    className="btn-update"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Mise à jour...' : 'Mettre à jour le profil'}
                </button>
            </form>

            <div className="services-section">
                <h2>Services de musique</h2>
                <p className="services-info">
                    Liez un service de musique pour jouer à Devine la Zik. Au moins un service est requis.
                </p>

                <div className="services-grid">
                    <div className="service-card">
                        <ServiceStatus
                            service="Spotify"
                            isConnected={session?.user?.spotify}
                        />
                        {session?.user?.spotify ? (
                            <button
                                className="btn-disconnect"
                                onClick={() => unlinkService('spotify')}
                                disabled={isConnectingService}
                            >
                                Délier Spotify
                            </button>
                        ) : (
                            <button
                                className="btn-connect"
                                onClick={() => connectService('spotify')}
                                disabled={isConnectingService}
                            >
                                {isConnectingService ? 'Connexion...' : 'Connecter Spotify'}
                            </button>
                        )}
                    </div>

                    <div className="service-card">
                        <ServiceStatus
                            service="Deezer"
                            isConnected={session?.user?.deezer}
                        />
                        {session?.user?.deezer ? (
                            <button
                                className="btn-disconnect"
                                onClick={() => unlinkService('deezer')}
                                disabled={isConnectingService}
                            >
                                Délier Deezer
                            </button>
                        ) : (
                            <button
                                className="btn-connect"
                                onClick={() => connectService('deezer')}
                                disabled={isConnectingService}
                            >
                                {isConnectingService ? 'Connexion...' : 'Connecter Deezer'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <div className="profile-actions">
                <Link href="/lobby" className="btn-primary">
                    Retour au lobby
                </Link>
            </div>
        </div>
    );
}