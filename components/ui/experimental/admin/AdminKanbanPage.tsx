'use client';

import React, { useMemo, useState } from 'react';
import { useData, GAS_WEB_APP_URL } from '@/components/DataProvider';
import { authHeaders } from '@/lib/auth';
import EditHomeworkModal from '@/components/EditHomeworkModal';
import DiscordSummaryPreview from '@/components/DiscordSummaryPreview';
import { Badge, Button, Input } from '@/components/ui/experimental/primitives';
import { getSubjectColor } from '@/hooks/kanban/useKanbanHome';

type SummaryPreviewMode = 'rendered' | 'raw';

export default function ExperimentalAdminKanbanPage() {
  const { allHomework, refreshData, subjects } = useData();
  const [editingHomework, setEditingHomework] = useState<(typeof allHomework)[0] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [summaryPreview, setSummaryPreview] = useState<string | null>(null);
  const [summaryPreviewMode, setSummaryPreviewMode] = useState<SummaryPreviewMode>('rendered');
  const [summaryPreviewError, setSummaryPreviewError] = useState<string | null>(null);
  const [summaryLogs, setSummaryLogs] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const filteredHomework = useMemo(() => {
    let tasks = [...allHomework];
    tasks.sort((a, b) => new Date(b.deadline).getTime() - new Date(a.deadline).getTime());
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      tasks = tasks.filter(
        (hw) =>
          hw.title.toLowerCase().includes(lower) ||
          hw.subject.toLowerCase().includes(lower) ||
          hw.description.toLowerCase().includes(lower)
      );
    }
    return tasks;
  }, [allHomework, searchTerm]);

  const handleOpenSummaryPreview = async () => {
    setIsLoadingPreview(true);
    setSummaryPreviewError(null);
    try {
      const response = await fetch(`${GAS_WEB_APP_URL}?action=dailySummary&date=${summaryDate}`, { headers: authHeaders() });
      const data = (await response.json()) as { success?: boolean; summary?: string; data?: { summary?: string }; error?: string };
      if (data.success) {
        const text = data.summary ?? data.data?.summary ?? '';
        if (!text) setSummaryPreviewError('Preview is empty.');
        else {
          setSummaryPreviewMode('rendered');
          setSummaryPreview(text);
        }
      } else setSummaryPreviewError(data.error || 'Failed to load preview.');
    } catch (e: unknown) {
      setSummaryPreviewError(e instanceof Error ? e.message : 'Failed to load preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmSendSummary = async () => {
    setIsSendingSummary(true);
    setSummaryLogs('Sending...');
    setSummaryPreview(null);
    try {
      const response = await fetch(`${GAS_WEB_APP_URL}?action=sendSummary&date=${summaryDate}`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = (await response.json()) as { success?: boolean; data?: string; error?: string };
      setSummaryLogs(data.success ? data.data || 'Summary sent.' : 'Error: ' + (data.error || 'Unknown'));
    } catch (e: unknown) {
      setSummaryLogs('Error: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setIsSendingSummary(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 4 }}>Homework editor</h1>
          <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)' }}>Manage tasks and Discord daily summaries</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Input type="date" value={summaryDate} onChange={(e) => setSummaryDate(e.target.value)} style={{ width: 'auto' }} />
          <Button variant="secondary" size="sm" onClick={handleOpenSummaryPreview} disabled={isSendingSummary || isLoadingPreview}>
            {isLoadingPreview ? 'Loading…' : 'Preview summary'}
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirmSendSummary} disabled={isSendingSummary}>
            {isSendingSummary ? 'Sending…' : 'Send to Discord'}
          </Button>
        </div>
      </div>

      {summaryPreviewError && (
        <div style={{ padding: 12, marginBottom: 16, borderRadius: 8, background: 'rgba(229,72,77,0.1)', color: 'var(--exp-danger)', fontSize: 13 }}>
          {summaryPreviewError}
        </div>
      )}

      {summaryPreview && (
        <div className="exp-card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <Button variant={summaryPreviewMode === 'rendered' ? 'primary' : 'ghost'} size="sm" onClick={() => setSummaryPreviewMode('rendered')}>Rendered</Button>
            <Button variant={summaryPreviewMode === 'raw' ? 'primary' : 'ghost'} size="sm" onClick={() => setSummaryPreviewMode('raw')}>Raw</Button>
            <Button variant="ghost" size="sm" onClick={() => setSummaryPreview(null)} style={{ marginLeft: 'auto' }}>Close</Button>
          </div>
          {summaryPreviewMode === 'rendered' ? (
            <DiscordSummaryPreview content={summaryPreview} />
          ) : (
            <pre style={{ fontSize: 12, overflow: 'auto', color: 'var(--exp-ink-muted)', fontFamily: 'var(--exp-mono)' }}>{summaryPreview}</pre>
          )}
        </div>
      )}

      {summaryLogs && (
        <div className="exp-card" style={{ marginBottom: 24, fontSize: 13, color: 'var(--exp-ink-muted)', whiteSpace: 'pre-wrap' }}>
          {summaryLogs}
        </div>
      )}

      <Input
        placeholder="Search homework…"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ maxWidth: 360, marginBottom: 16 }}
      />

      <div className="exp-table-wrap">
        <table className="exp-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Title</th>
              <th>Deadline</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredHomework.map((hw) => (
              <tr key={hw.id}>
                <td><Badge color={getSubjectColor(hw.subject, subjects)}>{hw.subject}</Badge></td>
                <td style={{ color: 'var(--exp-ink)' }}>{hw.title}</td>
                <td style={{ fontFamily: 'var(--exp-mono)', fontSize: 12 }}>
                  {new Date(hw.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => setEditingHomework(hw)}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingHomework && (
        <EditHomeworkModal
          homework={editingHomework}
          onClose={() => setEditingHomework(null)}
          onRefresh={refreshData}
        />
      )}
    </div>
  );
}
