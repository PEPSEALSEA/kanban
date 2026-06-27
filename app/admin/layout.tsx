'use client';

import React from 'react';
import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicAdminLayout from '@/components/ui/classic/AdminLayout';
import ExperimentalAdminLayout from '@/components/ui/experimental/admin/AdminLayout';

function ClassicAdminShell({ children }: { children: React.ReactNode }) {
  return <ClassicAdminLayout>{children}</ClassicAdminLayout>;
}

function ExperimentalAdminShell({ children }: { children: React.ReactNode }) {
  return <ExperimentalAdminLayout>{children}</ExperimentalAdminLayout>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <UiPageSwitch
      classic={ClassicAdminShell}
      experimental={ExperimentalAdminShell}
      props={{ children }}
    />
  );
}
