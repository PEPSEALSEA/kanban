'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { googleLogout } from '@react-oauth/google';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import { clearIdToken } from '@/lib/auth';
import { IconAdmin, IconArchive, IconChat, IconKanban } from '@/components/icons';

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
      <div className="header-nav-dock">
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
            <span className="header-nav-auth-mobile">
              <GoogleSignInButton size="large" type="icon" shape="circle" theme="outline" />
            </span>
          ) : (
            <div className="header-nav-user">
              <button type="button" onClick={handleLogout} className="header-nav-logout" title="Logout">
                <img src={user.picture} alt="" className="header-nav-avatar" />
                <span className="header-nav-logout-text">Logout</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
