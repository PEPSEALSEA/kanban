'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicAdminSubjectsPage from '@/components/ui/classic/AdminSubjectsPage';
import ExperimentalAdminSubjectsPage from '@/components/ui/experimental/admin/AdminSubjectsPage';

export default function AdminSubjectsPage() {
  return (
    <UiPageSwitch classic={ClassicAdminSubjectsPage} experimental={ExperimentalAdminSubjectsPage} />
  );
}
