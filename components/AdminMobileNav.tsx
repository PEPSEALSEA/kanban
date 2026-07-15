'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { IconDashboard, IconEdit, IconFolder, IconTag, IconMenu } from '@/components/icons';

const NAV_ITEMS = [
  { name: 'Dashboard', icon: IconDashboard, path: '/admin' },
  { name: 'Kanban', icon: IconEdit, path: '/admin/kanban' },
  { name: 'Archive', icon: IconFolder, path: '/admin/content-archive' },
  { name: 'Subjects', icon: IconTag, path: '/admin/subjects' },
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
            <item.icon className="admin-mobile-nav-icon" />
            <span>{item.name}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className="admin-mobile-nav-item admin-mobile-nav-more"
        onClick={onMore}
      >
        <IconMenu className="admin-mobile-nav-icon" />
        <span>More</span>
      </button>
    </nav>
  );
}
