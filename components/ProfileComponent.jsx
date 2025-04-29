// components/ProfileComponent.jsx
"use client";
import { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';

export default function ProfileComponent() {
  const { data: session } = useSession();
  const [pseudo, setPseudo] = useState(session?.user?.pseudo || '');
  const [feedback, setFeedback] = useState('');

  const handlePseudoUpdate = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo })
    });

    const data = await res.json();
    if (data.error) {
      setFeedback(data.error);
      if (data.suggestion) setPseudo(data.suggestion);
    } else {
      setFeedback('Profil mis à jour');
    }
  };

  // Rest of the component remains the same

  const connectService = (provider) => {
    signIn(provider, { callbackUrl: '/profile' });
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
        <div className="profile-header">
          {session?.user?.image ? (
              <img src={session.user.image} alt="Profile" className="profile-avatar" />
          ) : (
              <div className="default-avatar">
                {pseudo ? pseudo[0].toUpperCase() : '?'}
              </div>
          )}
        </div>

        <form onSubmit={handlePseudoUpdate} className="profile-form">
          <div className="form-group">
            <label htmlFor="pseudo">Username</label>
            <input
                id="pseudo"
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                required
            />
          </div>
          <button type="submit" className="btn-update">Update Profile</button>
        </form>

        <div className="services-section">
          <h2>Music Services</h2>
          <div className="services-grid">
            <div className="service-card">
              <ServiceStatus
                  service="Spotify"
                  isConnected={session?.user?.spotify}
              />
              {session?.user?.spotify ? (
                  <button className="btn-connected" disabled>Connected</button>
              ) : (
                  <button
                      className="btn-connect"
                      onClick={() => connectService('spotify')}
                  >
                    Connect Spotify
                  </button>
              )}
            </div>

            <div className="service-card">
              <ServiceStatus
                  service="Deezer"
                  isConnected={session?.user?.deezer}
              />
              {session?.user?.deezer ? (
                  <button className="btn-connected" disabled>Connected</button>
              ) : (
                  <button
                      className="btn-connect"
                      onClick={() => connectService('deezer')}
                  >
                    Connect Deezer
                  </button>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}