'use client';

import AdminAiChatLogsPanel from '@/components/AdminAiChatLogsPanel';
import AppShell from '@/components/ui/experimental/layout/AppShell';
import { useData } from '@/components/DataProvider';

export default function ExperimentalAdminAiChatPage() {
  const { aiChatLogs } = useData();

  return (
    <AppShell title="AI Chat Logs" breadcrumb={['Admin', 'AI Chat Logs']}>
      <AdminAiChatLogsPanel logs={aiChatLogs} />
    </AppShell>
  );
}
