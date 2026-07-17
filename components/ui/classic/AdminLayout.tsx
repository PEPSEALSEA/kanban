'use client';

import React, { useState, useEffect } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import { useData } from '@/components/DataProvider';
import Link from 'next/link';

import { isAdminEmail } from '@/lib/admin';
import { ADMIN_NAV_MORE_EVENT } from '@/lib/adminNav';
import { IconBan } from '@/components/icons';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const { user } = useData();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const handleChange = () => {
      setIsMobileViewport(mq.matches);
      if (!mq.matches) setMobileSidebarOpen(false);
    };
    handleChange();
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (user) {
      if (isAdminEmail(user.email)) {
        setIsAdmin(true);
      }
    }
    setIsAuthChecking(false);
  }, [user]);

  useEffect(() => {
    const openMore = () => setMobileSidebarOpen(true);
    window.addEventListener(ADMIN_NAV_MORE_EVENT, openMore);
    return () => window.removeEventListener(ADMIN_NAV_MORE_EVENT, openMore);
  }, []);

  if (isAuthChecking) {
    return (
      <div className="admin-theme" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--admin-bg)' }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-theme" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--admin-bg)', padding: '2rem' }}>
        <div className="admin-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}><IconBan className="w-12 h-12" /></div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Access Denied</h2>
          <p style={{ color: 'var(--admin-text-muted)', marginBottom: '2rem' }}>This area is reserved for administrators only.</p>
          <Link href="/" className="admin-btn-primary">Return Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-theme admin-layout">
      <AdminSidebar
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        isMobile={isMobileViewport}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      {mobileSidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-overlay"
          aria-label="Close menu"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
