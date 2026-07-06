'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicAdminAiChatPage from '@/components/ui/classic/AdminAiChatPage';
import ExperimentalAdminAiChatPage from '@/components/ui/experimental/admin/AdminAiChatPage';

export default function AdminAiChatPage() {
  return (
    <UiPageSwitch classic={ClassicAdminAiChatPage} experimental={ExperimentalAdminAiChatPage} />
  );
}
