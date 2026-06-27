'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicAdminContentArchivePage from '@/components/ui/classic/AdminContentArchivePage';
import ExperimentalAdminContentArchivePage from '@/components/ui/experimental/admin/AdminContentArchivePage';

export default function AdminContentArchivePage() {
  return (
    <UiPageSwitch classic={ClassicAdminContentArchivePage} experimental={ExperimentalAdminContentArchivePage} />
  );
}
