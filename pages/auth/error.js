// pages/auth/error.js
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ErrorPage() {
    const router = useRouter();
    const { error } = router.query;

    const getErrorMessage = (errorCode) => {
        switch (errorCode) {
            case 'OAuthAccountNotLinked':
                return 'Ce compte est déjà lié à un autre utilisateur. Veuillez vous connecter avec le compte que vous avez utilisé précédemment.';
            case 'EmailCreateAccount':
                return 'Impossible de créer un compte avec cet email.';
            case 'Callback':
                return 'Une erreur est survenue lors de la connexion avec le service.';
            case 'OAuthSignin':
                return 'Erreur lors de l\'initialisation de la connexion OAuth.';
            case 'OAuthCallback':
                return 'Erreur lors du retour de l\'authentification OAuth.';
            case 'Configuration':
                return 'Erreur de configuration du serveur.';
            default:
                return `Une erreur inattendue est survenue: ${errorCode || 'Code d\'erreur inconnu'}`;
        }
    };

    return (
        <div className="auth-error-container">
            <h1>Erreur d'authentification</h1>

            <div className="error-card">
                <p className="error-message">{getErrorMessage(error)}</p>

                <div className="error-details">
                    <p>Code d'erreur: <code>{error}</code></p>
                </div>

                <div className="error-actions">
                    <Link href="/auth/signin" className="btn btn-primary">
                        Retour à la page de connexion
                    </Link>
                </div>
            </div>

            <style jsx>{`
        .auth-error-container {
          max-width: 600px;
          margin: 3rem auto;
          padding: 1rem;
          text-align: center;
        }
        
        h1 {
          color: #333;
          margin-bottom: 2rem;
        }
        
        .error-card {
          background: #fff;
          padding: 2rem;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .error-message {
          font-size: 1.2rem;
          color: #dc3545;
          margin-bottom: 1.5rem;
        }
        
        .error-details {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1.5rem;
          text-align: left;
        }
        
        code {
          font-family: monospace;
          background: #e9ecef;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
        }
        
        .error-actions {
          margin-top: 1.5rem;
        }
        
        .btn {
          display: inline-block;
          padding: 0.5rem 1rem;
          font-size: 1rem;
          font-weight: 500;
          text-align: center;
          cursor: pointer;
          border-radius: 4px;
          transition: background-color 0.2s;
          text-decoration: none;
        }
        
        .btn-primary {
          background-color: #007bff;
          color: white;
          border: none;
        }
        
        .btn-primary:hover {
          background-color: #0069d9;
        }
      `}</style>
        </div>
    );
}