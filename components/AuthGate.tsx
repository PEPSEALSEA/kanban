'use client';

import type { ReactNode } from 'react';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { useData } from '@/components/DataProvider';
import { ALLOWED_EMAIL_DOMAIN } from '@/lib/allowedEmail';

export default function AuthGate({ children }: { children: ReactNode }) {
  const { user, authReady, loginError } = useData();

  if (!authReady) {
    return (
      <div className="login-gate">
        <div className="loader" aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="login-gate">
        <div className="login-gate-card">
          <img className="login-gate-icon" src="/kanban/icon.png" alt="" />
          <h1 className="login-gate-title">StudyFlow</h1>
          <p className="login-gate-subtitle">เข้าสู่ระบบด้วยบัญชีโรงเรียน</p>
          <p className="login-gate-hint">
            ใช้ Google ที่ลงท้ายด้วย @{ALLOWED_EMAIL_DOMAIN}
          </p>
          <div className="login-gate-button">
            <GoogleSignInButton size="large" theme="filled_blue" width="280" text="signin_with" />
          </div>
          {loginError ? <p className="login-gate-error">{loginError}</p> : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
