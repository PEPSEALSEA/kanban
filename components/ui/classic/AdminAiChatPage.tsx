'use client';

import AdminAiChatLogsPanel from '@/components/AdminAiChatLogsPanel';
import { useData } from '@/components/DataProvider';

export default function ClassicAdminAiChatPage() {
  const { aiChatLogs } = useData();

  return (
    <div style={{ padding: '2rem' }}>
      <AdminAiChatLogsPanel logs={aiChatLogs} />
    </div>
  );
}
