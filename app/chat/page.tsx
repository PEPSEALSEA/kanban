'use client';

import UiPageSwitch from '@/components/UiPageSwitch';
import ClassicChatPage from '@/components/ui/classic/ChatPage';
import ExperimentalChatPage from '@/components/ui/experimental/pages/ChatPage';

export default function ChatPage() {
  return (
    <UiPageSwitch classic={ClassicChatPage} experimental={ExperimentalChatPage} />
  );
}
