'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicKanbanHomePage from '@/components/ui/classic/KanbanHomePage';
import ExperimentalKanbanHomePage from '@/components/ui/experimental/pages/KanbanHomePage';

export default function HomePage() {
  return (
    <UiPageSwitch classic={ClassicKanbanHomePage} experimental={ExperimentalKanbanHomePage} />
  );
}
