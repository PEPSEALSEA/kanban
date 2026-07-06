'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import { clearIdToken } from '@/lib/auth';
import { completeGoogleLogin } from '@/lib/googleLogin';
import { Button } from '@/components/ui/experimental/primitives';
import '@/components/ui/experimental/experimental.css';

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  breadcrumb?: string[];
  actions?: React.ReactNode;
};

const BASE_NAV = [
  { href: '/', label: 'Board', icon: '◫' },
  { href: '/content', label: 'Archive', icon: '◷' },
];

const CHAT_NAV = { href: '/chat', label: 'AI Chat', icon: '◎' };

const ADMIN_NAV = [
  { href: '/admin', label: 'Overview', icon: '◎' },
  { href: '/admin/kanban', label: 'Homework', icon: '◫' },
  { href: '/admin/content-archive', label: 'Content', icon: '◷' },
  { href: '/admin/subjects', label: 'Subjects', icon: '◈' },
  { href: '/admin/ai-chat', label: 'AI Chat Logs', icon: '◉' },
];

export default function AppShell({ children, title, breadcrumb, actions }: AppShellProps) {
  const pathname = usePathname();
  const { user, setUser, refreshData } = useData();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isAdminRoute = pathname.startsWith('/admin');
  const showAdmin = user && isAdminEmail(user.email);
  const navItems = useMemo(() => {
    if (isAdminRoute) return ADMIN_NAV;
    return user ? [...BASE_NAV, CHAT_NAV] : BASE_NAV;
  }, [isAdminRoute, user]);

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/kanban' || pathname === '';
    if (path === '/admin') return pathname === '/admin' || pathname === '/kanban/admin';
    return pathname.startsWith(path);
  };

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

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="experimental-theme exp-shell">
      <aside
        className={`exp-sidebar ${collapsed ? 'exp-sidebar--collapsed' : ''} ${mobileOpen ? 'exp-sidebar--open' : ''}`}
      >
        <div className="exp-sidebar__brand">
          <div className="exp-sidebar__brand-mark">S</div>
          {!collapsed && <span>StudyFlow</span>}
        </div>

        <nav className="exp-sidebar__nav">
          {!isAdminRoute && navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`exp-sidebar__link ${isActive(item.href) ? 'exp-sidebar__link--active' : ''}`}
              title={item.label}
            >
              <span className="exp-sidebar__link-icon">{item.icon}</span>
              {!collapsed && item.label}
            </Link>
          ))}

          {showAdmin && !isAdminRoute && (
            <Link
              href="/admin"
              className={`exp-sidebar__link ${isActive('/admin') ? 'exp-sidebar__link--active' : ''}`}
            >
              <span className="exp-sidebar__link-icon">⚙</span>
              {!collapsed && 'Admin'}
            </Link>
          )}

          {isAdminRoute && (
            <>
              {!collapsed && (
                <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--exp-ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Administration
                </div>
              )}
              {ADMIN_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`exp-sidebar__link ${isActive(item.href) ? 'exp-sidebar__link--active' : ''}`}
                >
                  <span className="exp-sidebar__link-icon">{item.icon}</span>
                  {!collapsed && item.label}
                </Link>
              ))}
              <Link href="/" className="exp-sidebar__link" style={{ marginTop: 12 }}>
                <span className="exp-sidebar__link-icon">←</span>
                {!collapsed && 'Back to app'}
              </Link>
            </>
          )}
        </nav>

        <div className="exp-sidebar__footer">
          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((v) => !v)}
              style={{ width: '100%', justifyContent: 'flex-start' }}
            >
              {collapsed ? '→' : '← Collapse'}
            </Button>
          )}
          {collapsed && (
            <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)} title="Expand">
              →
            </Button>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          style={{ position: 'fixed', inset: 0, zIndex: 35, background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className={`exp-main ${collapsed ? 'exp-main--collapsed' : ''}`}>
        <header className="exp-topbar">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            style={{ display: 'none' }}
          >
            ☰
          </Button>

          <div className="exp-topbar__breadcrumb">
            {breadcrumb?.map((crumb, i) => (
              <React.Fragment key={crumb}>
                {i > 0 && <span>/</span>}
                <span>{crumb}</span>
              </React.Fragment>
            )) ?? (title && <span className="exp-topbar__title">{title}</span>)}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            {actions}
            {!user ? (
              <div style={{ borderRadius: 8, overflow: 'hidden' }}>
                <GoogleLogin onSuccess={handleLoginSuccess} onError={() => {}} size="medium" theme="filled_black" auto_select />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src={user.picture}
                  alt=""
                  style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--exp-hairline)' }}
                />
                <span style={{ fontSize: 13, color: 'var(--exp-ink-muted)', maxWidth: 120 }} className="hidden md:inline">
                  {user.name.split(' ')[0]}
                </span>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  Sign out
                </Button>
              </div>
            )}
          </div>
        </header>

        <main className="exp-content exp-animate-in">{children}</main>
      </div>
    </div>
  );
}
