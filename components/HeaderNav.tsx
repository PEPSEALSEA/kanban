'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';

export default function HeaderNav() {
  const pathname = usePathname();
  const { user } = useData();
  const showAdmin = user && isAdminEmail(user.email);

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
    </div>
  );
}
