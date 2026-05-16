'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HeaderNav() {
  const pathname = usePathname();

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
      </nav>
    </div>
  );
}
