'use client';

import ChatPanel from '@/components/chat/ChatPanel';
import AppShell from '@/components/ui/experimental/layout/AppShell';

export default function ExperimentalChatPage() {
  return (
    <AppShell title="AI Chat" breadcrumb={['AI Chat']}>
      <div className="flex min-h-[calc(100vh-120px)] flex-col">
        <ChatPanel variant="experimental" />
      </div>
    </AppShell>
  );
}
