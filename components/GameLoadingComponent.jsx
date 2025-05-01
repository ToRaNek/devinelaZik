// components/GameLoadingComponent.jsx
import { useState, useEffect } from 'react';

export default function GameLoadingComponent({ loadingState }) {
    const [dots, setDots] = useState('');

    // Animate the loading dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => {
                if (prev.length >= 3) return '';
                return prev + '.';
            });
        }, 500);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="game-loading-container">
            <h2>Préparation de la partie</h2>

            <div className="loading-spinner-large"></div>

            <p className="loading-message">
                {loadingState.message || "Chargement des données musicales"}{dots}
            </p>

            {loadingState.progress !== undefined && (
                <div className="loading-progress-container">
                    <div className="loading-progress-bar">
                        <div
                            className="loading-progress-fill"
                            style={{ width: `${loadingState.progress}%` }}
                        ></div>
                    </div>
                    <div className="loading-progress-text">
                        {loadingState.progress}%
                    </div>
                </div>
            )}

            {loadingState.detail && (
                <p className="loading-detail">{loadingState.detail}</p>
            )}

            <div className="loading-tips">
                <h3>Le saviez-vous ?</h3>
                <p>{getRandomTip()}</p>
            </div>

            <style jsx>{`
        .game-loading-container {
          background: white;
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
          max-width: 600px;
          margin: 0 auto;
        }
        
        .loading-spinner-large {
          width: 80px;
          height: 80px;
          border: 8px solid #f3f3f3;
          border-top: 8px solid #007bff;
          border-radius: 50%;
          margin: 1.5rem auto;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .loading-message {
          font-size: 1.2rem;
          margin: 1rem 0;
        }
        
        .loading-progress-container {
          margin: 1.5rem 0;
        }
        
        .loading-progress-bar {
          height: 10px;
          background: #e9ecef;
          border-radius: 5px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }
        
        .loading-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #007bff, #6a11cb);
          border-radius: 5px;
          transition: width 0.3s ease;
        }
        
        .loading-progress-text {
          font-weight: bold;
        }
        
        .loading-detail {
          color: #6c757d;
          font-size: 0.9rem;
        }
        
        .loading-tips {
          margin-top: 2rem;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .loading-tips h3 {
          font-size: 1rem;
          color: #007bff;
          margin-bottom: 0.5rem;
        }
        
        .loading-tips p {
          font-style: italic;
          color: #495057;
        }
      `}</style>
        </div>
    );
}

// Random tips to display during loading
function getRandomTip() {
    const tips = [
        "Devine la Zik utilise l'API Spotify pour accéder à vos musiques préférées.",
        "Plus vous utilisez Spotify, plus les questions seront pertinentes !",
        "L'algorithme évite les doublons pour vous proposer des questions variées.",
        "La plupart des extraits audio durent 30 secondes.",
        "Répondre rapidement vous rapporte plus de points !",
        "Les questions sont générées à partir des goûts musicaux de tous les joueurs.",
        "Si vous ne trouvez pas la réponse, l'album peut vous donner un indice."
    ];

    return tips[Math.floor(Math.random() * tips.length)];
}