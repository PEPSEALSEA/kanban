'use client';

import React, { useState, useMemo } from 'react';
import { useData } from '@/components/DataProvider';
import EditHomeworkModal from '@/components/EditHomeworkModal';

export default function KanbanEditor() {
  const { allHomework, refreshData } = useData();
  const [editingHomework, setEditingHomework] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHomework = useMemo(() => {
    let tasks = [...allHomework];
    
    // Sort by created date descending (newest first)
    tasks.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    
    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      tasks = tasks.filter(hw => 
        (hw.title || '').toLowerCase().includes(lowerTerm) || 
        (hw.subject || '').toLowerCase().includes(lowerTerm) ||
        (hw.description || '').toLowerCase().includes(lowerTerm)
      );
    }
    
    return tasks;
  }, [allHomework, searchTerm]);

  return (
    <div className="admin-dashboard">
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>Kanban Editor</h1>
        <p style={{ color: 'var(--admin-text-muted)' }}>Manage and edit existing Kanban tasks.</p>
      </header>

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
              {filteredHomework.map((hw) => (
                <tr key={hw.id} style={{ borderBottom: '1px solid var(--admin-border)' }}>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ 
                      background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, color: '#334155'
                    }}>
                      {hw.subject}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--admin-text-main)' }}>{hw.title}</td>
                  <td style={{ padding: '1rem', color: 'var(--admin-text-muted)' }}>
                    {hw.deadline ? new Date(hw.deadline).toLocaleDateString() : 'No deadline'}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{ color: '#64748b' }}>
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
              {filteredHomework.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
                    No tasks found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
