'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import { saveIdToken, clearIdToken, authHeaders } from '@/lib/auth';
import { API_URL } from '@/lib/config';

export default function HeaderNav() {
  const pathname = usePathname();
  const { user, setUser, refreshData } = useData();
  const showAdmin = user && isAdminEmail(user.email);

  const handleLoginSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    saveIdToken(credentialResponse.credential);
    const decoded = jwtDecode<{ email: string; name: string; picture: string }>(credentialResponse.credential);
    const newUser = { email: decoded.email, name: decoded.name, picture: decoded.picture };
    setUser(newUser);
    localStorage.setItem('homework_user', JSON.stringify(newUser));
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'addUser',
          display_name: newUser.name,
          photo_url: newUser.picture,
        }),
      });
    } catch {
      /* ignore */
    }
    refreshData();
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
          <GoogleLogin onSuccess={handleLoginSuccess} onError={() => {}} size="medium" />
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
