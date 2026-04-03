'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HeaderNav() {
  const pathname = usePathname();

  // Helper to check if a path is active
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
          <span style={{ fontSize: '1.2rem' }}>📋</span>
          Kanban Board
        </Link>
        <Link 
          href="/content" 
          className={`nav-item ${isActive('/content') ? 'active' : ''}`}
        >
          <span style={{ fontSize: '1.2rem' }}>📅</span>
          Content Archive
        </Link>
      </nav>
    </div>
  );
}
