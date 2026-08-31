'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useData } from '@/components/DataProvider';
import CreateContentModal from '@/components/CreateContentModal';
import EditContentModal from '@/components/EditContentModal';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import AdminPagination from '@/components/admin/AdminPagination';
import { fetchAdminJson, type AdminListResult, type AdminPageSize } from '@/lib/adminList';
import { uploadToTelegramDirect } from '@/lib/telegram';
import { compressAudioIfNeeded } from '@/lib/audio-compressor';
import { UPLOAD_SERVICE_URL } from '@/lib/config';
import { makeAudioEntry } from '@/lib/audioItems';
import { saveLearningContent } from '@/lib/contentSave';
import { IconMusic, IconPaperclip, IconEdit, IconPlus, IconSearch, IconFolder, IconX, IconCheck, IconZap, IconTurtle, IconScissors, IconAlert } from '@/components/icons';

type LearningContent = {
  id: string;
  date: string;
  subject: string;
  title: string;
  description: string;
  audio_file_id: string;
  audio_url: string;
  attachments: string;
  links: string;
  is_private?: string;
};

const isPrivateContent = (item: LearningContent) => item.is_private === '1' || String(item.is_private || '').toLowerCase() === 'true';

type AudioDraft = {
  id: string;
  file: File;
  filename: string;
  date: string;
  rawSubject: string;
  subject: string;
  groupId: string;
  matched: boolean;
};

type BatchGroup = {
  id: string;
  date: string;
  subject: string;
  customSubject: string;
  files: AudioDraft[];
};

const normalizeSubject = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '');

function parseAudioFilename(filename: string, subjects: any[]): Omit<AudioDraft, 'id' | 'file' | 'groupId'> {
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '').trim();
  const match = nameWithoutExt.match(/^(\d{1,2})[-_](\d{1,2})[-_](\d{2,4})\s+(.+)$/);
  const today = new Date();
  let date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  let rawSubject = nameWithoutExt;

  if (match) {
    const [, dd, mm, yy, subjectPart] = match;
    const numericYear = Number(yy);
    const fullYear = yy.length === 2
      ? (numericYear >= 43 ? 2500 + numericYear - 543 : 2000 + numericYear)
      : (numericYear > 2400 ? numericYear - 543 : numericYear);
    date = `${fullYear}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    rawSubject = subjectPart.trim();
  }

  const rawKey = normalizeSubject(rawSubject);
  const exact = subjects.find((s) => normalizeSubject(s.name) === rawKey);
  const fuzzy = exact || subjects.find((s) => {
    const key = normalizeSubject(s.name);
    return key.includes(rawKey) || rawKey.includes(key);
  });

  return {
    filename,
    date,
    rawSubject,
    subject: fuzzy?.name || 'Other',
    matched: Boolean(fuzzy),
  };
}

function isHighSpeedProgress(progress: string) {
  return progress.includes('High-Speed');
}

function BatchAudioUploadModal({
  subjects,
  onClose,
  onRefresh,
}: {
  subjects: any[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [drafts, setDrafts] = useState<AudioDraft[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createdIds, setCreatedIds] = useState<string[]>([]);
  const { isMobile } = useDeviceDetection();

  const groups = useMemo<BatchGroup[]>(() => {
    const map = new Map<string, BatchGroup>();
    drafts.forEach((draft) => {
      const groupId = draft.groupId || `${draft.date}__${draft.subject}`;
      if (!map.has(groupId)) {
        const first = drafts.find((d) => d.groupId === groupId) || draft;
        map.set(groupId, {
          id: groupId,
          date: first.date,
          subject: first.subject,
          customSubject: first.subject === 'Other' ? first.rawSubject : '',
          files: [],
        });
      }
      map.get(groupId)!.files.push(draft);
    });
    return Array.from(map.values());
  }, [drafts]);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    setCreatedIds([]);
    const nextDrafts = files.map((file, index) => {
      const parsed = parseAudioFilename(file.name, subjects);
      return {
        ...parsed,
        id: `${file.name}-${file.size}-${file.lastModified}-${index}`,
        file,
        groupId: `${parsed.date}__${parsed.subject}__${parsed.rawSubject}`,
      };
    });
    setDrafts(nextDrafts);
  };

  const updateDraft = (id: string, changes: Partial<Pick<AudioDraft, 'date' | 'subject' | 'groupId'>>) => {
    setDrafts((prev) => prev.map((draft) => {
      if (draft.id !== id) return draft;
      const next = { ...draft, ...changes };
      if (changes.date || changes.subject) next.groupId = `${next.date}__${next.subject}__${next.rawSubject}`;
      return next;
    }));
  };

  const uploadAudio = async (file: File) => {
    let fileToUpload = file;
    if (file.size > 45 * 1024 * 1024) {
      setProgress(`Optimizing ${file.name}`);
      try {
        const compressionResult = await compressAudioIfNeeded(file, (p) => {
          setProgress(`Optimizing ${file.name}: ${p}%`);
        });
        if (compressionResult.compressed) fileToUpload = compressionResult.file;
      } catch (compressErr) {
        console.error('Compression failed:', compressErr);
      }
    }

    setProgress(`High-Speed Uploading ${file.name}`);
    const result = await uploadToTelegramDirect(fileToUpload, 'audio');
    if (result.success) {
      fetch(`${UPLOAD_SERVICE_URL}?action=registerUpload`, {
        method: 'POST',
        body: JSON.stringify({
          fileId: result.fileId,
          url: result.url,
          filename: file.name,
          contentType: file.type,
        }),
      }).catch((err) => console.error('Metadata registration failed:', err));
      return makeAudioEntry(result.url, file.name, result.fileId);
    }

    setProgress(`Slow-Fallback Uploading ${file.name}`);
    const reader = new FileReader();
    const base64Data = await new Promise<string>((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    const response = await fetch(`${UPLOAD_SERVICE_URL}?action=upload&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || 'application/octet-stream')}`, {
      method: 'POST',
      body: base64Data,
    });
    const fallback = (await response.json()) as any;
    if (!fallback.success) throw new Error(fallback.error || `Upload failed: ${file.name}`);
    return makeAudioEntry(fallback.url, file.name, fallback.id);
  };

  const createDraftCards = async () => {
    if (groups.length === 0 || status === 'uploading') return;
    setStatus('uploading');
    setError(null);
    setCreatedIds([]);
    const ids: string[] = [];

    try {
      for (const group of groups) {
        setProgress(`Creating draft for ${group.subject} (${group.files.length} files)`);
        const audios: string[] = [];
        for (const draft of group.files) {
          audios.push(await uploadAudio(draft.file));
        }
        const id = await saveLearningContent({
          date: group.date,
          subject: group.subject,
          title: '',
          description: '',
          audios,
          attachments: [],
          links: [],
          is_private: false,
        }, group.customSubject);
        ids.push(id);
        setCreatedIds([...ids]);
      }
      setStatus('success');
      setProgress('');
      onRefresh();
    } catch (e: any) {
      console.error(e);
      setStatus('error');
      setError(e.message || 'Batch upload failed');
    }
  };

  const overlayStyle = {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  };

  const subjectOptions = [...subjects.map((s) => s.name), 'Other'];

  return (
    <div style={overlayStyle}>
      <div className="admin-card" style={{ width: '100%', maxWidth: '980px', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1rem', gap: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--admin-text-main)', margin: 0 }}>Batch Audio Upload</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--admin-text-muted)', margin: '0.25rem 0 0' }}>สร้าง draft content จากไฟล์ชื่อแบบ dd-mm-yy subject แล้วค่อยกลับมาเติม title/description</p>
          </div>
          <button onClick={onClose} disabled={status === 'uploading'} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--admin-text-muted)', display: 'flex' }} title="Close">
            <IconX className="w-5 h-5" />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 0.9fr', gap: '1.25rem' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ border: '1px dashed var(--admin-border)', borderRadius: '0.75rem', padding: '1rem', background: 'var(--admin-bg-soft)' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--admin-text-main)', marginBottom: '0.5rem' }}>Audio files</label>
              <input type="file" accept="audio/*" multiple onChange={handleFiles} disabled={status === 'uploading'} style={{ fontSize: '0.85rem' }} />
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '0.5rem' }}>Example: 31-08-69 ชีวะ.mp3 จะอ่านเป็นวันที่ 2026-08-31 และวิชา ชีวะ</div>
            </div>

            {drafts.length > 0 && (
              <div style={{ border: '1px solid var(--admin-border)', borderRadius: '0.75rem', overflow: 'hidden' }}>
                <div style={{ padding: '0.75rem 1rem', background: 'var(--admin-bg-soft)', fontWeight: 800, color: 'var(--admin-text-main)', fontSize: '0.85rem' }}>File review</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {drafts.map((draft) => (
                    <div key={draft.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 0.8fr 0.9fr', gap: '0.75rem', padding: '0.85rem 1rem', borderTop: '1px solid var(--admin-border)', alignItems: 'center' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: 'var(--admin-text-main)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{draft.filename}</div>
                        <div style={{ fontSize: '0.72rem', color: draft.matched ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem' }}>
                          {draft.matched ? <IconCheck className="w-3.5 h-3.5" /> : <IconAlert className="w-3.5 h-3.5" />}
                          parsed subject: {draft.rawSubject}
                        </div>
                      </div>
                      <input
                        type="date"
                        value={draft.date}
                        disabled={status === 'uploading'}
                        onChange={(e) => updateDraft(draft.id, { date: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)' }}
                      />
                      <select
                        value={draft.subject}
                        disabled={status === 'uploading'}
                        onChange={(e) => updateDraft(draft.id, { subject: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)' }}
                      >
                        {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '1rem', color: 'var(--admin-text-main)', margin: 0 }}>Content groups</h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>{groups.length} cards</span>
            </div>

            {groups.length === 0 ? (
              <div style={{ padding: '2rem', border: '1px solid var(--admin-border)', borderRadius: '0.75rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                Select audio files to preview draft cards.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.id} style={{ border: '1px solid var(--admin-border)', borderRadius: '0.75rem', padding: '1rem', background: 'var(--admin-bg-soft)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <input
                      type="date"
                      value={group.date}
                      disabled={status === 'uploading'}
                      onChange={(e) => {
                        setDrafts((prev) => prev.map((draft) => draft.groupId === group.id ? { ...draft, date: e.target.value } : draft));
                      }}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)' }}
                    />
                    <select
                      value={group.subject}
                      disabled={status === 'uploading'}
                      onChange={(e) => {
                        setDrafts((prev) => prev.map((draft) => draft.groupId === group.id ? { ...draft, subject: e.target.value } : draft));
                      }}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)' }}
                    >
                      {subjectOptions.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
                    </select>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>{group.files.length} audio files</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {group.files.map((draft) => (
                      <div key={draft.id} style={{ display: 'grid', gridTemplateColumns: groups.length > 1 ? '1fr 120px' : '1fr', gap: '0.5rem', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.78rem', color: 'var(--admin-text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{draft.filename}</span>
                        {groups.length > 1 && (
                          <select
                            value={group.id}
                            disabled={status === 'uploading'}
                            onChange={(e) => {
                              const targetGroupId = e.target.value;
                              if (targetGroupId !== group.id) updateDraft(draft.id, { groupId: targetGroupId });
                            }}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '0.45rem', border: '1px solid var(--admin-border)', fontSize: '0.72rem' }}
                          >
                            {groups.map((target, index) => <option key={target.id} value={target.id}>Group {index + 1}</option>)}
                          </select>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}

            {progress && (
              <div style={{ fontSize: '0.78rem', color: isHighSpeedProgress(progress) ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {isHighSpeedProgress(progress) ? <IconZap className="w-4 h-4" /> : progress.includes('Slow-Fallback') ? <IconTurtle className="w-4 h-4" /> : <IconScissors className="w-4 h-4" />}
                {progress}
              </div>
            )}
            {error && <div style={{ color: '#f87171', fontSize: '0.8rem' }}>{error}</div>}
            {createdIds.length > 0 && <div style={{ color: '#10b981', fontSize: '0.8rem' }}>Created: {createdIds.join(', ')}</div>}

            <div style={{ display: 'flex', gap: '0.75rem', borderTop: '1px solid var(--admin-border)', paddingTop: '1rem' }}>
              <button type="button" onClick={onClose} disabled={status === 'uploading'} style={{ flex: 1, padding: '0.75rem', borderRadius: '0.75rem', border: '1px solid var(--admin-border)', background: 'none', color: 'var(--admin-text-main)', cursor: 'pointer' }}>Cancel</button>
              <button type="button" onClick={createDraftCards} disabled={groups.length === 0 || status === 'uploading'} className="admin-btn-primary" style={{ flex: 1, justifyContent: 'center', opacity: groups.length === 0 || status === 'uploading' ? 0.6 : 1 }}>
                {status === 'uploading' ? 'Uploading...' : status === 'success' ? 'Drafts Created' : 'Create Draft Cards'}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

const ContentItem = React.memo(({ item, subjects, onEdit, isMobile }: { item: LearningContent, subjects: any[], onEdit: (item: any) => void, isMobile: boolean }) => {
  const subjectColor = subjects.find(s => s.name.trim().toLowerCase() === (item.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)';
  const title = item.title?.trim() || 'Untitled draft';
  
  if (isMobile) {
    return (
      <div style={{ 
        background: 'var(--admin-bg-soft)', 
        border: '1px solid var(--admin-border)', 
        borderRadius: '1rem', 
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--admin-text-main)' }}>{new Date(item.date).toLocaleDateString()}</div>
          <span style={{ 
            padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700,
            background: `${subjectColor}22`,
            color: subjectColor,
            border: `1px solid ${subjectColor}44`
          }}>
            {item.subject}
          </span>
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', marginBottom: '-0.5rem' }}>ID: {item.id}</div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--admin-text-main)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: item.title?.trim() ? 'var(--admin-text-main)' : '#f59e0b' }}>{title}</span>
          {isPrivateContent(item) && (
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              Private
            </span>
          )}
        </h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.description}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            {item.audio_file_id && <span title="Has Audio"><IconMusic className="w-4 h-4" /></span>}
            {item.attachments && <span title="Has Attachments"><IconPaperclip className="w-4 h-4" /></span>}
          </div>
          <button 
            onClick={() => onEdit(item)}
            style={{ background: 'var(--admin-primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '0.5rem', fontWeight: 700, cursor: 'pointer' }}
          >
            Edit Content
          </button>
        </div>
      </div>
    );
  }

  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--admin-text-main)' }}>{new Date(item.date).toLocaleDateString()}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>ID: {item.id}</div>
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--admin-text-main)', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: item.title?.trim() ? 'var(--admin-text-main)' : '#f59e0b' }}>{title}</span>
          {isPrivateContent(item) && (
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
              Private
            </span>
          )}
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.description}
        </div>
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <span style={{ 
          display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
          background: `${subjectColor}22`,
          color: subjectColor,
          border: `1px solid ${subjectColor}44`
        }}>
          {item.subject}
        </span>
      </td>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {item.audio_file_id && <span title="Has Audio"><IconMusic className="w-4 h-4" /></span>}
          {item.attachments && <span title="Has Attachments"><IconPaperclip className="w-4 h-4" /></span>}
          {!item.audio_file_id && !item.attachments && <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.8rem' }}>None</span>}
        </div>
      </td>
      <td style={{ verticalAlign: 'top', textAlign: 'center' }}>
        <button 
          onClick={() => onEdit(item)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0.5rem', borderRadius: '4px' }}
          className="admin-nav-item"
        >
          <IconEdit className="w-4 h-4" />
        </button>
      </td>
    </tr>
  );
});

ContentItem.displayName = 'ContentItem';

export default function ContentArchiveEditor() {
  const { subjects } = useData();
  const [items, setItems] = useState<LearningContent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<AdminPageSize>(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [titleFilter, setTitleFilter] = useState<'all' | 'missing'>('all');
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<{ type: 'create' | 'edit' | 'batch', content?: any } | null>(null);
  const { isMobile } = useDeviceDetection();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, subjectFilter, titleFilter, limit]);

  const loadContent = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await fetchAdminJson<AdminListResult<LearningContent>>('adminContentList', {
        page,
        limit,
        q: debouncedSearch || undefined,
        subject: subjectFilter !== 'All' ? subjectFilter : undefined,
        missingTitle: titleFilter === 'missing' ? '1' : undefined,
      });
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e: any) {
      setListError(e.message || 'Failed to load content');
      setItems([]);
      setTotal(0);
    } finally {
      setListLoading(false);
    }
  }, [page, limit, debouncedSearch, subjectFilter, titleFilter]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const filterSubjects = ['All', ...subjects.map(s => s.name), 'Other'];

  if (listLoading && items.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="loader"></div>
      </div>
    );
  }

  return (
    <div className="admin-content-archive">
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>Content Archive Editor</h1>
          <p style={{ color: 'var(--admin-text-muted)' }}>Manage your learning materials, audio lectures, and study guides.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveModal({ type: 'batch' })}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--admin-border)', background: 'var(--admin-bg-soft)', color: 'var(--admin-text-main)', padding: '0.75rem 1rem', borderRadius: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <IconMusic className="w-4 h-4" /> Batch Audio
          </button>
          <button 
            onClick={() => setActiveModal({ type: 'create' })}
            className="admin-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <IconPlus className="w-4 h-4" /> Add New Content
          </button>
        </div>
      </header>

      <div className="admin-card" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Search Content</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4, display: 'flex' }}><IconSearch className="w-4 h-4" /></span>
              <input 
                type="text" 
                placeholder="Search by ID (LC-...), Subject, or Title..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '0.7rem 0.7rem 0.7rem 2.5rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ width: '200px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Subject</label>
            <select 
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
            >
              {filterSubjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ width: '190px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Draft State</label>
            <select 
              value={titleFilter}
              onChange={(e) => setTitleFilter(e.target.value as 'all' | 'missing')}
              style={{ width: '100%', padding: '0.7rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
            >
              <option value="all">All cards</option>
              <option value="missing">Missing title</option>
            </select>
          </div>
        </div>
      </div>

      {listError && (
        <div style={{ color: '#f87171', marginBottom: '1rem' }}>{listError}</div>
      )}

      <div className="admin-card" style={{ padding: isMobile ? '1rem' : 0, overflow: 'hidden' }}>
        {isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.length > 0 ? (
              items.map((item: LearningContent) => (
                <ContentItem 
                  key={item.id} 
                  item={item} 
                  subjects={subjects} 
                  isMobile={isMobile} 
                  onEdit={(item) => setActiveModal({ type: 'edit', content: item })} 
                />
              ))
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                No content found.
              </div>
            )}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: '120px' }}>Date</th>
                <th>Topic & Description</th>
                <th style={{ width: '120px' }}>Subject</th>
                <th style={{ width: '100px' }}>Media</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length > 0 ? (
                items.map((item: LearningContent) => (
                  <ContentItem 
                    key={item.id} 
                    item={item} 
                    subjects={subjects} 
                    isMobile={isMobile} 
                    onEdit={(item) => setActiveModal({ type: 'edit', content: item })} 
                  />
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}><IconFolder className="w-10 h-10" /></div>
                    <div>No content found matching your filters.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <div style={{ padding: isMobile ? 0 : '0 1.25rem 1rem' }}>
          <AdminPagination
            page={page}
            limit={limit}
            total={total}
            disabled={listLoading}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </div>
      </div>

      {activeModal?.type === 'create' && (
        <CreateContentModal 
          onClose={() => setActiveModal(null)} 
          onRefresh={loadContent} 
        />
      )}
      {activeModal?.type === 'edit' && (
        <EditContentModal 
          content={activeModal.content} 
          onClose={() => setActiveModal(null)} 
          onRefresh={loadContent} 
        />
      )}
      {activeModal?.type === 'batch' && (
        <BatchAudioUploadModal 
          subjects={subjects}
          onClose={() => setActiveModal(null)} 
          onRefresh={loadContent} 
        />
      )}
    </div>
  );
}
