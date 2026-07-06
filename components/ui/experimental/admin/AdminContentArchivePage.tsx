'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/components/DataProvider';
import CreateContentModal from '@/components/CreateContentModal';
import EditContentModal from '@/components/EditContentModal';
import { Badge, Button, Input } from '@/components/ui/experimental/primitives';
import { getSubjectColor } from '@/hooks/kanban/useKanbanHome';

export default function ExperimentalAdminContentArchivePage() {
  const { learningContent, subjects, refreshData } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<(typeof learningContent)[0] | null>(null);

  const filtered = useMemo(() => {
    let items = [...learningContent];
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.subject.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q)
      );
    }
    return items;
  }, [learningContent, searchTerm]);

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 4 }}>Content archive</h1>
          <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)' }}>Manage learning materials</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>New content</Button>
      </div>

      <Input
        placeholder="Search content…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 16 }}
      />

      <div className="exp-table-wrap">
        <table className="exp-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Title</th>
              <th>Subject</th>
              <th>Media</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td style={{ fontFamily: 'var(--exp-mono)', fontSize: 12 }}>
                  {new Date(item.date).toLocaleDateString('th-TH')}
                </td>
                <td>
                  <div style={{ fontWeight: 500, color: 'var(--exp-ink)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {item.title}
                    {(item.is_private === '1' || String(item.is_private || '').toLowerCase() === 'true') && (
                      <Badge color="#ef4444">Private</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--exp-ink-tertiary)', fontFamily: 'var(--exp-mono)' }}>{item.id}</div>
                </td>
                <td><Badge color={getSubjectColor(item.subject, subjects)}>{item.subject}</Badge></td>
                <td style={{ fontSize: 16 }}>
                  {item.audio_file_id && '🎵 '}
                  {item.attachments && '📎'}
                </td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateContentModal onClose={() => setShowCreate(false)} onRefresh={refreshData} />}
      {editing && <EditContentModal content={editing} onClose={() => setEditing(null)} onRefresh={refreshData} />}
    </div>
  );
}
