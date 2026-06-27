'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicAdminDashboardPage from '@/components/ui/classic/AdminDashboardPage';
import ExperimentalAdminDashboardPage from '@/components/ui/experimental/admin/AdminDashboardPage';

export default function AdminDashboardPage() {
  return (
    <UiPageSwitch classic={ClassicAdminDashboardPage} experimental={ExperimentalAdminDashboardPage} />
  );
}
