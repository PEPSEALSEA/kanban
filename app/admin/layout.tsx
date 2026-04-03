'use client';

import React, { useState, useEffect } from 'react';
import AdminSidebar from '@/components/AdminSidebar';
import { useData } from '@/components/DataProvider';
import Link from 'next/link';

const ADMIN_EMAILS = ['pepsealsea@gmail.com', 'iampep2009@gmail.com', 'sealseapep@gmail.com'];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const { user } = useData();

  useEffect(() => {
    if (user) {
      if (ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        setIsAdmin(true);
      }
    }
    setIsAuthChecking(false);
  }, [user]);

  if (isAuthChecking) {
    return (
      <div className="admin-theme" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
        <div className="loader"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="admin-theme" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '2rem' }}>
        <div className="admin-card" style={{ maxWidth: '400px', textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚫</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Access Denied</h2>
          <p style={{ color: 'var(--admin-text-muted)', marginBottom: '2rem' }}>This area is reserved for administrators only.</p>
          <Link href="/" className="admin-btn-primary">Return Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-theme admin-layout">
      <AdminSidebar collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
