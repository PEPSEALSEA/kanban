'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { googleLogout } from '@react-oauth/google';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import { clearIdToken } from '@/lib/auth';

function IconKanban({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3.5" y="4.5" width="5" height="15" rx="1.5" />
      <rect x="9.5" y="4.5" width="5" height="10" rx="1.5" />
      <rect x="15.5" y="4.5" width="5" height="12" rx="1.5" />
    </svg>
  );
}

function IconArchive({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3.5" y="5.5" width="17" height="14" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M8 13.5h3" strokeLinecap="round" />
    </svg>
  );
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M5 18.5 6.2 15.8A7.5 7.5 0 1 1 10 19.4L5 18.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconAdmin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6.1 6.1l1.6 1.6M16.3 16.3l1.6 1.6M17.9 6.1l-1.6 1.6M7.7 16.3l-1.6 1.6" strokeLinecap="round" />
    </svg>
  );
}

export default function HeaderNav() {
  const pathname = usePathname();
  const { user, setUser, refreshData } = useData();
  const showAdmin = user && isAdminEmail(user.email);

  const handleLogout = () => {
    googleLogout();
    clearIdToken();
    setUser(null);
    localStorage.removeItem('homework_user');
    refreshData();
  };

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/kanban' || pathname === '';
    return pathname.startsWith(path);
  };

  return (
    <div className="header-nav-container">
      <nav className="header-nav" aria-label="Primary">
        <Link 
          href="/" 
          className={`nav-item ${isActive('/') ? 'active' : ''}`}
        >
          <IconKanban className="nav-item-icon" />
          <span className="nav-item-label">Kanban</span>
        </Link>
        <Link 
          href="/content" 
          className={`nav-item ${isActive('/content') ? 'active' : ''}`}
        >
          <IconArchive className="nav-item-icon" />
          <span className="nav-item-label">Archive</span>
        </Link>
        {user && (
          <Link
            href="/chat"
            className={`nav-item ${isActive('/chat') ? 'active' : ''}`}
          >
            <IconChat className="nav-item-icon" />
            <span className="nav-item-label">Chat</span>
          </Link>
        )}
        {showAdmin && (
          <Link
            href="/admin"
            className={`nav-item nav-item-admin ${isActive('/admin') ? 'active' : ''}`}
          >
            <IconAdmin className="nav-item-icon" />
            <span className="nav-item-label">Admin</span>
          </Link>
        )}
      </nav>

      <div className="header-nav-auth">
        {!user ? (
          <GoogleSignInButton />
        ) : (
          <div className="header-nav-user">
            <img src={user.picture} alt="" className="header-nav-avatar" />
            <button type="button" onClick={handleLogout} className="header-nav-logout">
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
