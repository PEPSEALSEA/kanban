'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useData } from '@/components/DataProvider';
import { isAdminEmail } from '@/lib/admin';
import AppShell from '@/components/ui/experimental/layout/AppShell';
import { Skeleton } from '@/components/ui/experimental/primitives';

export default function ExperimentalAdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useData();
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (user && isAdminEmail(user.email)) setIsAdmin(true);
    setIsAuthChecking(false);
  }, [user]);

  if (isAuthChecking) {
    return (
      <div className="experimental-theme" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Skeleton style={{ width: 32, height: 32, borderRadius: '50%' }} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="experimental-theme" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div className="exp-card" style={{ maxWidth: 400, textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⛔</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Access denied</h2>
          <p style={{ fontSize: 14, color: 'var(--exp-ink-subtle)', marginBottom: 20 }}>
            This area is reserved for administrators only.
          </p>
          <Link href="/" className="exp-btn exp-btn--primary" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            Return home
          </Link>
        </div>
      </div>
    );
  }

  return <AppShell breadcrumb={['Admin']}>{children}</AppShell>;
}
