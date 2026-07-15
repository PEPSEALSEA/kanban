'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useData } from '@/components/DataProvider';
import CreateContentModal from '@/components/CreateContentModal';
import EditContentModal from '@/components/EditContentModal';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import AdminPagination from '@/components/admin/AdminPagination';
import { fetchAdminJson, type AdminListResult, type AdminPageSize } from '@/lib/adminList';
import { IconMusic, IconPaperclip, IconEdit, IconPlus, IconSearch, IconFolder } from '@/components/icons';

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

const ContentItem = React.memo(({ item, subjects, onEdit, isMobile }: { item: LearningContent, subjects: any[], onEdit: (item: any) => void, isMobile: boolean }) => {
  const subjectColor = subjects.find(s => s.name.trim().toLowerCase() === (item.subject || '').trim().toLowerCase())?.color || 'var(--admin-primary)';
  
  if (isMobile) {
    return (
      <div style={{ 
        background: 'rgba(255, 255, 255, 0.03)', 
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
          {item.title}
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
          {item.title}
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
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<{ type: 'create' | 'edit', content?: any } | null>(null);
  const { isMobile } = useDeviceDetection();

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, subjectFilter, limit]);

  const loadContent = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const data = await fetchAdminJson<AdminListResult<LearningContent>>('adminContentList', {
        page,
        limit,
        q: debouncedSearch || undefined,
        subject: subjectFilter !== 'All' ? subjectFilter : undefined,
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
  }, [page, limit, debouncedSearch, subjectFilter]);

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
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>Content Archive Editor</h1>
          <p style={{ color: 'var(--admin-text-muted)' }}>Manage your learning materials, audio lectures, and study guides.</p>
        </div>
        <button 
          onClick={() => setActiveModal({ type: 'create' })}
          className="admin-btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <IconPlus className="w-4 h-4" /> Add New Content
        </button>
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
    </div>
  );
}
