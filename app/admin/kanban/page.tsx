'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicAdminKanbanPage from '@/components/ui/classic/AdminKanbanPage';
import ExperimentalAdminKanbanPage from '@/components/ui/experimental/admin/AdminKanbanPage';

export default function AdminKanbanPage() {
  return (
    <UiPageSwitch classic={ClassicAdminKanbanPage} experimental={ExperimentalAdminKanbanPage} />
  );
}
