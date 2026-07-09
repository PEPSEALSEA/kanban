'use client';

import React from 'react';
import AdminLayout from '@/components/ui/classic/AdminLayout';

export default function AdminShellLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}

