'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminSidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (val: boolean) => void }) {
  const pathname = usePathname();

  const navItems = [
    { name: 'Dashboard', icon: '📊', path: '/admin' },
    { name: 'Kanban Editor', icon: '📝', path: '/admin/kanban' },
    { name: 'Content Archive Editor', icon: '📁', path: '/admin/content-archive' },
  ];

  return (
    <aside className={`admin-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--admin-border)' }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.5rem' }}>🎓</span>
            <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--admin-primary)' }}>StudyFlow</span>
          </div>
        )}
        <button 
          onClick={() => setCollapsed(!collapsed)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--admin-text-muted)' }}
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      <nav style={{ marginTop: '1.5rem', flex: 1 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <Link 
              key={item.path} 
              href={item.path} 
              className={`admin-nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.name : ''}
            >
              <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
              {!collapsed && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--admin-border)' }}>
        <Link href="/" className="admin-nav-item" style={{ margin: 0, paddingLeft: collapsed ? '1.2rem' : '0.8rem' }}>
          <span style={{ fontSize: '1.2rem' }}>🚪</span>
          {!collapsed && <span>Exit Admin</span>}
        </Link>
      </div>
    </aside>
  );
}
