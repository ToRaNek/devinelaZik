// components/Header.jsx
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';

export default function Header() {
    const { data: session, status } = useSession();
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setMenuOpen(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [menuRef]);

    // Don't render anything while loading
    if (status === 'loading') return null;

    // Don't render if not authenticated
    if (status === 'unauthenticated') return null;

    const handleSignOut = () => {
        signOut({ callbackUrl: '/' });
    };

    // Check if user has connected a music service
    const hasMusicService = session?.user?.spotify || session?.user?.deezer;

    return (
        <header className="app-header">
            <div className="header-left">
                <Link href="/" className="brand-logo">
                    Devine la Zik
                </Link>

                <nav className="main-nav">
                    <Link href="/lobby" className={`nav-link ${!hasMusicService ? 'disabled' : ''}`}>
                        Jouer
                    </Link>
                </nav>
            </div>

            <div className="header-right">
                {session && (
                    <div className="profile-menu" ref={menuRef}>
                        <button
                            className="profile-button"
                            onClick={() => setMenuOpen(!menuOpen)}
                            aria-expanded={menuOpen}
                            aria-label="Menu profil"
                        >
                            {session.user.image ? (
                                <img src={session.user.image} alt="Profile" className="profile-icon" />
                            ) : (
                                <div className="profile-icon-placeholder">
                                    {session.user.pseudo?.[0]?.toUpperCase() || 'U'}
                                </div>
                            )}
                            <span className="profile-name">{session.user.pseudo || session.user.name}</span>
                        </button>

                        {menuOpen && (
                            <div className="profile-dropdown">
                                <Link href="/profile" className="dropdown-item">
                                    Mon Profil
                                </Link>

                                {!hasMusicService && (
                                    <div className="dropdown-alert">
                                        <span>❗</span> Connectez un service de musique pour jouer
                                    </div>
                                )}

                                <button onClick={handleSignOut} className="dropdown-item logout">
                                    Se déconnecter
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </header>
    );
}