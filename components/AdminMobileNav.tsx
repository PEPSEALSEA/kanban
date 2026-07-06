'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { name: 'Dashboard', icon: '📊', path: '/admin' },
  { name: 'Kanban', icon: '📝', path: '/admin/kanban' },
  { name: 'Archive', icon: '📁', path: '/admin/content-archive' },
  { name: 'Subjects', icon: '🏷️', path: '/admin/subjects' },
];

export default function AdminMobileNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="admin-mobile-nav" aria-label="Admin navigation">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.path;
        return (
          <Link
            key={item.path}
            href={item.path}
            className={`admin-mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="admin-mobile-nav-icon">{item.icon}</span>
            <span>{item.name}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className="admin-mobile-nav-item admin-mobile-nav-more"
        onClick={onMore}
      >
        <span className="admin-mobile-nav-icon">☰</span>
        <span>More</span>
      </button>
    </nav>
  );
}
