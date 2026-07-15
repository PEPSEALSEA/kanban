'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import { IconAdmin, IconArchive, IconKanban } from '@/components/icons';

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
    </div>
  );
}
