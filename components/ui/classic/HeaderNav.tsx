'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import { clearIdToken } from '@/lib/auth';
import { completeGoogleLogin } from '@/lib/googleLogin';

export default function HeaderNav() {
  const pathname = usePathname();
  const { user, setUser, refreshData } = useData();
  const showAdmin = user && isAdminEmail(user.email);

  const handleLoginSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    await completeGoogleLogin(credentialResponse.credential, setUser, refreshData);
  };

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
      <nav className="header-nav">
        <Link 
          href="/" 
          className={`nav-item uppercase tracking-tighter ${isActive('/') ? 'active' : ''}`}
        >
          <span className="text-xl">📋</span>
          KANBAN
        </Link>
        <Link 
          href="/content" 
          className={`nav-item uppercase tracking-tighter ${isActive('/content') ? 'active' : ''}`}
        >
          <span className="text-xl">📅</span>
          ARCHIVE
        </Link>
        {user && (
          <Link
            href="/chat"
            className={`nav-item uppercase tracking-tighter ${isActive('/chat') ? 'active' : ''}`}
          >
            <span className="text-xl">💬</span>
            AI CHAT
          </Link>
        )}
        {showAdmin && (
          <Link
            href="/admin"
            className={`nav-item nav-item-admin uppercase tracking-tighter ${isActive('/admin') ? 'active' : ''}`}
          >
            <span className="text-xl">⚙️</span>
            ADMIN
          </Link>
        )}
      </nav>

      <div className="header-nav-auth">
        {!user ? (
          <GoogleLogin onSuccess={handleLoginSuccess} onError={() => {}} size="medium" auto_select />
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
