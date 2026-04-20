'use client';

import React, { useState, useMemo } from 'react';
import { useData } from '@/components/DataProvider';
import CreateContentModal from '@/components/CreateContentModal';
import EditContentModal from '@/components/EditContentModal';
import MarkdownRenderer from '@/components/MarkdownRenderer';

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
};

export default function ContentArchiveEditor() {
  const { learningContent, isLoading, refreshData } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('All');
  const [activeModal, setActiveModal] = useState<{ type: 'create' | 'edit', content?: any } | null>(null);

  const filteredContent = useMemo(() => {
    return learningContent.filter((item: LearningContent) => {
      const matchesSearch = 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSubject = subjectFilter === 'All' || item.subject === subjectFilter;
      return matchesSearch && matchesSubject;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [learningContent, searchTerm, subjectFilter]);

  const subjects = ['All', 'Math', 'Science', 'History', 'English', 'Arts', 'Computer', 'Other'];

  if (isLoading && learningContent.length === 0) {
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
          <span>➕</span> Add New Content
        </button>
      </header>

      {/* Filters and Search */}
      <div className="admin-card" style={{ marginBottom: '2rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '250px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--admin-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Search Content</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
              <input 
                type="text" 
                placeholder="Search by title or description..." 
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
              {subjects.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Content List */}
      <div className="admin-card" style={{ padding: 0, overflow: 'hidden' }}>
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
            {filteredContent.length > 0 ? (
              filteredContent.map((item: LearningContent) => (
                <tr key={item.id}>
                  <td style={{ verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{new Date(item.date).toLocaleDateString()}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>ID: {item.id}</div>
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--admin-primary)', marginBottom: '0.25rem' }}>{item.title}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--admin-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      <MarkdownRenderer content={item.description} />
                    </div>
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <span style={{ 
                      display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700,
                      background: 'var(--admin-bg-soft)', color: 'var(--admin-primary)', border: '1px solid var(--admin-border)'
                    }}>
                      {item.subject}
                    </span>
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {item.audio_file_id && <span title="Has Audio" style={{ fontSize: '1.2rem' }}>🎵</span>}
                      {item.attachments && <span title="Has Attachments" style={{ fontSize: '1.2rem' }}>📎</span>}
                      {!item.audio_file_id && !item.attachments && <span style={{ color: 'var(--admin-text-muted)', fontSize: '0.8rem' }}>None</span>}
                    </div>
                  </td>
                  <td style={{ verticalAlign: 'top', textAlign: 'center' }}>
                    <button 
                      onClick={() => setActiveModal({ type: 'edit', content: item })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '0.5rem', borderRadius: '4px' }}
                      className="admin-nav-item"
                    >
                      ✏️
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
                  <div>No content found matching your filters.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {activeModal?.type === 'create' && (
        <CreateContentModal 
          onClose={() => setActiveModal(null)} 
          onRefresh={refreshData} 
        />
      )}
      {activeModal?.type === 'edit' && (
        <EditContentModal 
          content={activeModal.content} 
          onClose={() => setActiveModal(null)} 
          onRefresh={refreshData} 
        />
      )}
    </div>
  );
}
