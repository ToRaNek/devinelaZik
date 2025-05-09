// pages/auth/signin.jsx
import { useEffect, useState } from "react";
import { getProviders, signIn, useSession } from "next-auth/react";
import { useRouter } from "next/router";

export default function SignIn({ providers }) {
    const { data: session, status } = useSession();
    const router = useRouter();
    const { callbackUrl, error } = router.query;
    const [errorMessage, setErrorMessage] = useState("");

    // If the user is already logged in, redirect them
    useEffect(() => {
        if (status === "authenticated") {
            router.push(callbackUrl || "/lobby");
        }
    }, [status, router, callbackUrl]);

    // Handle error messages
    useEffect(() => {
        if (error) {
            switch (error) {
                case "Callback":
                    setErrorMessage("Une erreur est survenue lors de l'authentification. Veuillez réessayer.");
                    break;
                case "OAuthSignin":
                    setErrorMessage("Erreur lors de la communication avec le fournisseur d'authentification.");
                    break;
                case "OAuthCallback":
                    setErrorMessage("Erreur lors de la réception des données d'authentification.");
                    break;
                case "OAuthCreateAccount":
                    setErrorMessage("Impossible de créer un compte avec ce fournisseur.");
                    break;
                default:
                    setErrorMessage(`Erreur d'authentification: ${error}`);
            }
        }
    }, [error]);

    // If still loading, show a loading spinner
    if (status === "loading") {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Chargement...</p>
            </div>
        );
    }

    return (
        <div className="homepage-container">
            <div className="hero-section">
                <div className="hero-content">
                    <h1 className="hero-title">Devine la Zik</h1>
                    <p className="hero-subtitle">
                        Connectez-vous pour commencer à jouer !
                    </p>

                    {errorMessage && (
                        <div className="auth-error">
                            {errorMessage}
                        </div>
                    )}

                    <div className="auth-buttons">
                        <button
                            className="auth-button google-button"
                            onClick={() => handleSignIn('google')}
                        >
                            <svg className="provider-icon" viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                                />
                            </svg>
                            Continuer avec Google
                        </button>

                        <button
                            className="auth-button discord-button"
                            onClick={() => handleSignIn('discord')}
                        >
                            <svg className="provider-icon" viewBox="0 0 24 24">
                                <path
                                    fill="currentColor"
                                    d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.608 1.2495-1.8447-.2762-3.6813-.2762-5.4983 0-.1634-.3933-.4064-.8742-.6147-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
                                />
                            </svg>
                            Continuer avec Discord
                        </button>
                    </div>
                </div>

                <div className="hero-illustration">
                    <div className="music-notes">
                        <div className="note note-1">♪</div>
                        <div className="note note-2">♫</div>
                        <div className="note note-3">♩</div>
                        <div className="note note-4">♬</div>
                    </div>
                    <div className="vinyl-record">
                        <div className="vinyl-inner"></div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export async function getServerSideProps() {
    const providers = await getProviders();
    return {
        props: { providers },
    };
}