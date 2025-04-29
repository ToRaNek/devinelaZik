// components/Header.jsx
import Link from 'next/link';
import { useSession } from 'next-auth/react';

export default function Header() {
    const { data: session } = useSession();

    if (!session) return null;

    return (
        <header className="app-header">
            <div className="header-left">
                <Link href="/lobby" className="play-button">
                    Jouer
                </Link>
            </div>
            <div className="header-right">
                <Link href="/profile" className="profile-link">
                    {session.user.image ? (
                        <img src={session.user.image} alt="Profile" className="profile-icon" />
                    ) : (
                        <div className="profile-icon-placeholder">
                            {session.user.pseudo?.[0]?.toUpperCase() || 'U'}
                        </div>
                    )}
                </Link>
            </div>
        </header>
    );
}