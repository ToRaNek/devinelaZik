// components/PlaylistSelectionComponent.jsx
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function PlaylistSelectionComponent() {
    const { data: session } = useSession();
    const [playlists, setPlaylists] = useState([]);
    const [selectedPlaylists, setSelectedPlaylists] = useState([]);
    const [useLikedTracks, setUseLikedTracks] = useState(true);
    const [useListeningHistory, setUseListeningHistory] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState('');
    const [error, setError] = useState('');

    // Charger les playlists et les préférences existantes
    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);

                // Récupérer les playlists
                const playlistsRes = await fetch('/api/music/playlists');

                if (!playlistsRes.ok) {
                    throw new Error('Impossible de récupérer vos playlists');
                }

                const playlistsData = await playlistsRes.json();
                setPlaylists(playlistsData.playlists || []);

                // Récupérer les préférences
                const preferencesRes = await fetch('/api/music/preferences');

                if (preferencesRes.ok) {
                    const preferencesData = await preferencesRes.json();
                    setSelectedPlaylists(preferencesData.playlistIds || []);
                    setUseLikedTracks(preferencesData.useLikedTracks !== false);
                    setUseListeningHistory(preferencesData.useListeningHistory !== false);
                }
            } catch (err) {
                console.error('Error fetching playlists data:', err);
                setError(err.message || 'Une erreur est survenue');
            } finally {
                setLoading(false);
            }
        };

        if (session?.user?.spotify) {
            fetchData();
        } else {
            setLoading(false);
            setError('Veuillez connecter votre compte Spotify pour gérer vos playlists');
        }
    }, [session]);

    // Gérer la sélection/désélection d'une playlist
    const togglePlaylist = (playlistId) => {
        setSelectedPlaylists(prev =>
            prev.includes(playlistId)
                ? prev.filter(id => id !== playlistId)
                : [...prev, playlistId]
        );
    };

    // Sauvegarder les préférences
    const savePreferences = async () => {
        try {
            setSaving(true);
            setFeedback('');
            setError('');

            // Récupérer les noms des playlists sélectionnées
            const playlistNames = playlists
                .filter(playlist => selectedPlaylists.includes(playlist.id))
                .map(playlist => playlist.name);

            const response = await fetch('/api/music/preferences', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    playlistIds: selectedPlaylists,
                    playlistNames,
                    useLikedTracks,
                    useListeningHistory
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Erreur lors de la sauvegarde');
            }

            setFeedback('Préférences musicales sauvegardées avec succès!');

            // Effacer le message après 3 secondes
            setTimeout(() => setFeedback(''), 3000);
        } catch (err) {
            console.error('Error saving preferences:', err);
            setError(err.message || 'Erreur lors de la sauvegarde des préférences');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="playlists-loading">
                <div className="loading-spinner"></div>
                <p>Chargement de vos playlists...</p>
            </div>
        );
    }

    if (error && !playlists.length) {
        return (
            <div className="playlists-error">
                <p>{error}</p>
                {!session?.user?.spotify && (
                    <button
                        className="btn-connect"
                        onClick={() => signIn('spotify', { callbackUrl: '/profile' })}
                    >
                        Connecter Spotify
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className="playlists-selection">
            <h3>Sélection des sources musicales</h3>

            <div className="music-sources-options">
                <div className="source-option">
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={useLikedTracks}
                            onChange={() => setUseLikedTracks(!useLikedTracks)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-label">Titres likés sur Spotify</span>
                    </label>
                    <p className="source-description">
                        Inclure tous vos titres favoris/likés dans le jeu
                    </p>
                </div>

                <div className="source-option">
                    <label className="toggle-switch">
                        <input
                            type="checkbox"
                            checked={useListeningHistory}
                            onChange={() => setUseListeningHistory(!useListeningHistory)}
                        />
                        <span className="toggle-slider"></span>
                        <span className="toggle-label">Historique d'écoute récent</span>
                    </label>
                    <p className="source-description">
                        Inclure les titres récemment écoutés sur Spotify
                    </p>
                </div>
            </div>

            <h4>Mes playlists ({playlists.length})</h4>
            <p className="playlists-help">
                Sélectionnez les playlists que vous souhaitez inclure dans le jeu
            </p>

            <div className="playlists-list">
                {playlists.length === 0 ? (
                    <p className="no-playlists">Aucune playlist trouvée sur votre compte Spotify</p>
                ) : (
                    playlists.map(playlist => (
                        <div
                            key={playlist.id}
                            className={`playlist-item ${selectedPlaylists.includes(playlist.id) ? 'selected' : ''}`}
                            onClick={() => togglePlaylist(playlist.id)}
                        >
                            <div className="playlist-image">
                                {playlist.images && playlist.images[0] ? (
                                    <img src={playlist.images[0].url} alt={playlist.name} />
                                ) : (
                                    <div className="playlist-image-placeholder">
                                        <i className="playlist-icon">🎵</i>
                                    </div>
                                )}
                                <div className="playlist-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={selectedPlaylists.includes(playlist.id)}
                                        onChange={() => {}} // Géré par l'onClick du conteneur
                                    />
                                </div>
                            </div>
                            <div className="playlist-info">
                                <h4 className="playlist-name">{playlist.name}</h4>
                                <p className="playlist-tracks">{playlist.tracks} titres</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="actions-container">
                <button
                    className="btn-save-preferences"
                    onClick={savePreferences}
                    disabled={saving}
                >
                    {saving ? 'Sauvegarde...' : 'Sauvegarder mes préférences'}
                </button>

                {feedback && (
                    <div className="feedback success">
                        {feedback}
                    </div>
                )}

                {error && (
                    <div className="feedback error">
                        {error}
                    </div>
                )}
            </div>

            <style jsx>{`
        .playlists-selection {
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid #dee2e6;
        }
        
        .music-sources-options {
          margin-bottom: 1.5rem;
        }
        
        .source-option {
          margin-bottom: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .toggle-switch {
          display: flex;
          align-items: center;
          cursor: pointer;
          margin-bottom: 0.5rem;
        }
        
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        
        .toggle-slider {
          position: relative;
          display: inline-block;
          width: 40px;
          height: 24px;
          background-color: #ccc;
          border-radius: 24px;
          margin-right: 10px;
          transition: .4s;
        }
        
        .toggle-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          border-radius: 50%;
          transition: .4s;
        }
        
        input:checked + .toggle-slider {
          background-color: #007bff;
        }
        
        input:checked + .toggle-slider:before {
          transform: translateX(16px);
        }
        
        .toggle-label {
          font-weight: 500;
        }
        
        .source-description {
          margin: 0;
          padding-left: 50px;
          font-size: 0.875rem;
          color: #6c757d;
        }
        
        .playlists-help {
          font-size: 0.875rem;
          color: #6c757d;
          margin-bottom: 1rem;
        }
        
        .playlists-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
          max-height: 400px;
          overflow-y: auto;
          padding: 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          margin-bottom: 1.5rem;
        }
        
        .playlist-item {
          border: 1px solid #dee2e6;
          border-radius: 8px;
          overflow: hidden;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .playlist-item:hover {
          transform: translateY(-3px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }
        
        .playlist-item.selected {
          border-color: #007bff;
          background-color: rgba(0, 123, 255, 0.05);
        }
        
        .playlist-image {
          position: relative;
          height: 120px;
          background: #eee;
        }
        
        .playlist-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        
        .playlist-image-placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%);
        }
        
        .playlist-icon {
          font-style: normal;
          font-size: 2rem;
        }
        
        .playlist-checkbox {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 24px;
          height: 24px;
          background: white;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        
        .playlist-info {
          padding: 0.75rem;
        }
        
        .playlist-name {
          margin: 0 0 0.25rem 0;
          font-size: 0.95rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .playlist-tracks {
          margin: 0;
          font-size: 0.8rem;
          color: #6c757d;
        }
        
        .btn-save-preferences {
          width: 100%;
          padding: 0.75rem 1.5rem;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }
        
        .btn-save-preferences:hover {
          background: #0069d9;
        }
        
        .btn-save-preferences:disabled {
          background: #6c757d;
          cursor: not-allowed;
        }
        
        .feedback {
          margin-top: 1rem;
          padding: 0.75rem;
          border-radius: 8px;
          text-align: center;
        }
        
        .feedback.success {
          background-color: #d4edda;
          color: #155724;
        }
        
        .feedback.error {
          background-color: #f8d7da;
          color: #721c24;
        }
      `}</style>
        </div>
    );
}