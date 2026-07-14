'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useData, GAS_WEB_APP_URL } from '@/components/DataProvider';
import { authHeaders } from '@/lib/auth';
import EditHomeworkModal from '@/components/EditHomeworkModal';
import DiscordSummaryPreview from '@/components/DiscordSummaryPreview';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import AdminPagination from '@/components/admin/AdminPagination';
import { fetchAdminJson, type AdminListResult, type AdminPageSize } from '@/lib/adminList';

type SummaryPreviewMode = 'rendered' | 'raw';

type SummaryParts = {
  header: string;
  contentToday: string;
  homeworkToday: string;
  homeworkAll: string;
  footer: string;
};

type SummarySectionKey = 'contentToday' | 'homeworkToday' | 'homeworkAll' | 'footer';

type SummarySections = Record<SummarySectionKey, boolean>;

const DEFAULT_SUMMARY_SECTIONS: SummarySections = {
  contentToday: true,
  homeworkToday: true,
  homeworkAll: true,
  footer: true,
};

const SUMMARY_SECTION_OPTIONS: { key: SummarySectionKey; label: string }[] = [
  { key: 'contentToday', label: 'เนื้อหาวันนี้' },
  { key: 'homeworkToday', label: 'การบ้านวันนี้' },
  { key: 'homeworkAll', label: 'การบ้านทั้งหมด' },
  { key: 'footer', label: 'Bottom part' },
];

function assembleSummaryFromParts(parts: SummaryParts, sections: SummarySections): string {
  let message = parts.header || '';
  if (sections.contentToday && parts.contentToday) message += parts.contentToday;
  if (sections.homeworkToday && parts.homeworkToday) message += parts.homeworkToday;
  if (sections.homeworkAll && parts.homeworkAll) message += parts.homeworkAll;
  if (sections.footer && parts.footer) message += parts.footer;
  return message.trimEnd() + (message ? '\n' : '');
}

type HomeworkRow = {
  id: string;
  subject: string;
  title: string;
  description?: string;
  deadline?: string;
  link_image?: string;
};

export default function KanbanEditor() {
  const { subjects } = useData();
  const [homework, setHomework] = useState<HomeworkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<AdminPageSize>(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [editingHomework, setEditingHomework] = useState<any>(null);
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [summaryParts, setSummaryParts] = useState<SummaryParts | null>(null);
  const [summarySections, setSummarySections] = useState<SummarySections>(DEFAULT_SUMMARY_SECTIONS);
  const [summaryPreviewMode, setSummaryPreviewMode] = useState<SummaryPreviewMode>('rendered');
  const [summaryPreviewError, setSummaryPreviewError] = useState<string | null>(null);
  const [summaryLogs, setSummaryLogs] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const { isMobile } = useDeviceDetection();

  const summaryPreview = useMemo(
    () => (summaryParts ? assembleSummaryFromParts(summaryParts, summarySections) : null),
    [summaryParts, summarySections],
  );

  const closeSummaryPreview = () => {
    setSummaryParts(null);
    setSummaryPreviewError(null);
    setSummaryPreviewMode('rendered');
    setSummarySections(DEFAULT_SUMMARY_SECTIONS);
  };

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, limit]);

  const loadHomework = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await fetchAdminJson<AdminListResult<HomeworkRow>>('adminHomeworkList', {
        page,
        limit,
        q: debouncedSearch || undefined,
      });
      setHomework(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setListError(e.message || 'Failed to load homework');
      setHomework([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [page, limit, debouncedSearch]);

  useEffect(() => {
    void loadHomework();
  }, [loadHomework]);

  const handleOpenSummaryPreview = async () => {
    setIsLoadingPreview(true);
    setSummaryPreviewError(null);
    setSummarySections(DEFAULT_SUMMARY_SECTIONS);

    try {
      const response = await fetch(`${GAS_WEB_APP_URL}?action=dailySummary&date=${summaryDate}`, { headers: authHeaders() });
      const data = (await response.json()) as any;
      if (data.success) {
        const payload = data.data ?? data;
        const parts = payload.parts as SummaryParts | undefined;
        const text = payload.summary ?? '';
        if (parts?.header) {
          setSummaryPreviewMode('rendered');
          setSummaryParts(parts);
        } else if (text) {
          setSummaryPreviewMode('rendered');
          setSummaryParts({
            header: text,
            contentToday: '',
            homeworkToday: '',
            homeworkAll: '',
            footer: '',
          });
        } else {
          setSummaryPreviewError('Preview is empty.');
        }
      } else {
        setSummaryPreviewError(data.error || 'Failed to load preview.');
      }
    } catch (e: any) {
      console.error(e);
      setSummaryPreviewError(e.message || 'Failed to load preview.');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleConfirmSendSummary = async () => {
    const sectionsToSend = { ...summarySections };
    setIsSendingSummary(true);
    setSummaryLogs('Sending...');
    closeSummaryPreview();

    try {
      const response = await fetch(`${GAS_WEB_APP_URL}?action=sendSummary&date=${summaryDate}`, {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'sendSummary',
          date: summaryDate,
          contentToday: sectionsToSend.contentToday,
          homeworkToday: sectionsToSend.homeworkToday,
          homeworkAll: sectionsToSend.homeworkAll,
          footer: sectionsToSend.footer,
        }),
      });

      const data = (await response.json()) as any;
      if (data.success) {
        setSummaryLogs(data.data || 'Summary sent successfully.');
      } else {
        setSummaryLogs('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (e: any) {
      console.error(e);
      setSummaryLogs('Error: ' + e.message + '\n\nNote: This might be a CORS error or a timeout. Check Discord to see if the summary arrived.');
    } finally {
      setIsSendingSummary(false);
    }
  };

  return (
    <div className="admin-dashboard">
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>Kanban Editor</h1>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <p style={{ color: 'var(--admin-text-muted)', margin: 0 }}>Manage and edit existing Kanban tasks.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)' }}>Target Date:</span>
              <input
                type="date"
                value={summaryDate}
                onChange={(e) => setSummaryDate(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--admin-border)',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--admin-text-main)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  fontWeight: 600
                }}
              />
            </div>
            <button
              onClick={handleOpenSummaryPreview}
              disabled={isSendingSummary || isLoadingPreview}
              style={{
                background: '#5865F2',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '0.75rem',
                cursor: isSendingSummary || isLoadingPreview ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: isSendingSummary || isLoadingPreview ? 0.7 : 1,
                transition: 'all 0.2s ease'
              }}
            >
              {isLoadingPreview ? '⌛ Loading preview...' : isSendingSummary ? '⌛ Sending...' : '📢 Send Daily Summary to Discord'}
            </button>
          </div>
        </div>
      </header>

      {(summaryParts || summaryPreviewError) && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="admin-card" style={{ width: '100%', maxWidth: '720px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', color: 'var(--admin-text-main)', margin: 0 }}>Daily Summary Preview</h2>
                <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--admin-text-muted)' }}>
                  Target date: {summaryDate} — ข้อความนี้จะถูกส่งไป Discord
                </p>
              </div>
              <button
                onClick={closeSummaryPreview}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--admin-text-muted)' }}
              >
                ✕
              </button>
            </div>

            {summaryPreviewError ? (
              <p style={{ color: '#f87171', margin: 0 }}>{summaryPreviewError}</p>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem 1.1rem', marginBottom: '1rem', padding: '0.85rem 1rem', borderRadius: '0.75rem', border: '1px solid var(--admin-border)', background: 'rgba(255,255,255,0.03)' }}>
                  {SUMMARY_SECTION_OPTIONS.map(({ key, label }) => {
                    const hasContent = key === 'footer'
                      ? !!(summaryParts?.footer)
                      : !!(summaryParts?.[key]);
                    return (
                      <label
                        key={key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          color: hasContent ? 'var(--admin-text-main)' : 'var(--admin-text-muted)',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={summarySections[key]}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setSummarySections((prev) => ({ ...prev, [key]: checked }));
                          }}
                          style={{ width: 16, height: 16, accentColor: '#5865F2', cursor: 'pointer' }}
                        />
                        {label}
                        {!hasContent && (
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--admin-text-muted)' }}>(ว่าง)</span>
                        )}
                      </label>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', fontWeight: 600 }}>
                    {summaryPreview!.length} characters
                    {summaryPreview!.length > 2000 && (
                      <span style={{ color: '#fbbf24', marginLeft: '0.5rem' }}>
                        (Discord limit is 2000 — may be truncated)
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--admin-border)' }}>
                    <button
                      type="button"
                      onClick={() => setSummaryPreviewMode('rendered')}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: 'none',
                        cursor: 'pointer',
                        background: summaryPreviewMode === 'rendered' ? '#5865F2' : 'transparent',
                        color: summaryPreviewMode === 'rendered' ? '#fff' : 'var(--admin-text-muted)',
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setSummaryPreviewMode('raw')}
                      style={{
                        padding: '6px 12px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        border: 'none',
                        borderLeft: '1px solid var(--admin-border)',
                        cursor: 'pointer',
                        background: summaryPreviewMode === 'raw' ? '#5865F2' : 'transparent',
                        color: summaryPreviewMode === 'raw' ? '#fff' : 'var(--admin-text-muted)',
                      }}
                    >
                      Raw text
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto', maxHeight: '50vh' }}>
                  {summaryPreviewMode === 'rendered' ? (
                    <DiscordSummaryPreview content={summaryPreview!} />
                  ) : (
                    <pre style={{
                      background: '#0f172a',
                      color: '#e2e8f0',
                      padding: '1.25rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.85rem',
                      overflow: 'auto',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      border: '1px solid var(--admin-border)',
                      minHeight: '100%',
                    }}>
                      {summaryPreview}
                    </pre>
                  )}
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--admin-border)' }}>
              <button
                onClick={closeSummaryPreview}
                disabled={isSendingSummary}
                style={{
                  background: 'transparent',
                  color: 'var(--admin-text-muted)',
                  border: '1px solid var(--admin-border)',
                  padding: '10px 20px',
                  borderRadius: '0.75rem',
                  cursor: isSendingSummary ? 'not-allowed' : 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9rem'
                }}
              >
                ยกเลิก
              </button>
              {!summaryPreviewError && summaryPreview && (
                <button
                  onClick={handleConfirmSendSummary}
                  disabled={isSendingSummary || !summaryPreview.trim()}
                  style={{
                    background: '#5865F2',
                    color: 'white',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '0.75rem',
                    cursor: isSendingSummary || !summaryPreview.trim() ? 'not-allowed' : 'pointer',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    opacity: isSendingSummary || !summaryPreview.trim() ? 0.7 : 1
                  }}
                >
                  {isSendingSummary ? '⌛ Sending...' : 'ยืนยันส่งไป Discord'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {summaryLogs && (
        <div className="admin-card" style={{ marginBottom: '2rem', borderLeft: '4px solid #5865F2', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>Execution Logs</h3>
            <button
              onClick={() => setSummaryLogs(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)', fontWeight: 600 }}
            >
              Close
            </button>
          </div>
          <pre style={{
            background: '#0f172a',
            color: '#38bdf8',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            fontSize: '0.85rem',
            overflowX: 'auto',
            maxHeight: '300px',
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap'
          }}>
            {summaryLogs}
          </pre>
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Search tasks by title, subject, or description..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '1rem',
            borderRadius: '0.75rem',
            border: '1px solid var(--admin-border)',
            fontSize: '1rem',
            outline: 'none',
            marginBottom: '1rem'
          }}
        />

        <div style={{ overflowX: 'auto' }}>
          {listError && (
            <div style={{ padding: '1rem', color: '#f87171', marginBottom: '0.5rem' }}>{listError}</div>
          )}
          {listLoading && homework.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>Loading…</div>
          ) : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {homework.map((hw) => (
                <div key={hw.id} style={{ 
                  background: 'rgba(255, 255, 255, 0.03)', 
                  border: '1px solid var(--admin-border)', 
                  borderRadius: '1rem', 
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ 
                      background: `${subjects.find(s => s.name.trim().toLowerCase() === (hw.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)'}22`, 
                      padding: '4px 10px', 
                      borderRadius: '6px', 
                      fontSize: '0.75rem', 
                      fontWeight: 700, 
                      color: subjects.find(s => s.name.trim().toLowerCase() === (hw.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)',
                      border: `1px solid ${subjects.find(s => s.name.trim().toLowerCase() === (hw.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)'}44`
                    }}>
                      {hw.subject}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>
                      {hw.deadline ? new Date(hw.deadline).toLocaleDateString() : 'No deadline'}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--admin-text-main)', margin: 0 }}>{hw.title}</h3>
                  <div style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>
                    {(hw.link_image ? hw.link_image.split(',').filter(Boolean) : []).length} items attached
                  </div>
                  <button 
                    onClick={() => setEditingHomework(hw)}
                    style={{ 
                      background: 'var(--admin-primary)', 
                      color: 'white', 
                      border: 'none', 
                      padding: '12px', 
                      borderRadius: '0.75rem', 
                      cursor: 'pointer',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      width: '100%'
                    }}
                  >
                    Edit Task
                  </button>
                </div>
              ))}
              {homework.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                  No tasks found matching your search.
                </div>
              )}
            </div>
          ) : (
            <table className="admin-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '1rem', borderBottom: '2px solid var(--admin-border)' }}>Subject</th>
                  <th style={{ padding: '1rem', borderBottom: '2px solid var(--admin-border)' }}>Title</th>
                  <th style={{ padding: '1rem', borderBottom: '2px solid var(--admin-border)' }}>Deadline</th>
                  <th style={{ padding: '1rem', borderBottom: '2px solid var(--admin-border)' }}>Attachments</th>
                  <th style={{ padding: '1rem', borderBottom: '2px solid var(--admin-border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {homework.map((hw) => (
                  <tr key={hw.id} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ 
                        background: `${subjects.find(s => s.name.trim().toLowerCase() === (hw.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)'}22`, 
                        padding: '4px 8px', 
                        borderRadius: '4px', 
                        fontSize: '0.85rem', 
                        fontWeight: 600, 
                        color: subjects.find(s => s.name.trim().toLowerCase() === (hw.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)',
                        border: `1px solid ${subjects.find(s => s.name.trim().toLowerCase() === (hw.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)'}44`
                      }}>
                        {hw.subject}
                      </span>
                    </td>
                    <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--admin-text-main)' }}>{hw.title}</td>
                    <td style={{ padding: '1rem', color: 'var(--admin-text-muted)' }}>
                      {hw.deadline ? new Date(hw.deadline).toLocaleDateString() : 'No deadline'}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ color: 'var(--admin-text-muted)' }}>
                        {(hw.link_image ? hw.link_image.split(',').filter(Boolean) : []).length} items
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <button 
                        onClick={() => setEditingHomework(hw)}
                        style={{ 
                          background: 'var(--admin-primary)', 
                          color: 'white', 
                          border: 'none', 
                          padding: '6px 14px', 
                          borderRadius: '0.5rem', 
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '0.85rem'
                        }}
                      >
                        Edit Task
                      </button>
                    </td>
                  </tr>
                ))}
                {homework.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                      No tasks found matching your search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        <AdminPagination
          page={page}
          limit={limit}
          total={total}
          disabled={listLoading}
          onPageChange={setPage}
          onLimitChange={setLimit}
        />
      </div>

      {editingHomework && (
        <EditHomeworkModal
          homework={editingHomework}
          onClose={() => setEditingHomework(null)}
          onRefresh={loadHomework}
        />
      )}
    </div>
  );
}
