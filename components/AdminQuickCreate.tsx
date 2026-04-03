'use client';

import React from 'react';

type QuickCreateProps = {
  onCreateHomework: () => void;
  onCreateContent: () => void;
};

export default function AdminQuickCreate({ onCreateHomework, onCreateContent }: QuickCreateProps) {
  return (
    <div className="quick-create-grid" style={{ marginBottom: '2.5rem' }}>
      <div 
        className="admin-card" 
        onClick={onCreateHomework}
        style={{ cursor: 'pointer', display: 'flex', gap: '1.5rem', alignItems: 'center' }}
      >
        <div style={{ 
          width: '64px', height: '64px', borderRadius: '1rem', 
          background: 'rgba(37, 99, 235, 0.1)', color: 'var(--admin-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem'
        }}>
          📝
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Create Homework</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>Post a new assignment to the Kanban board.</p>
        </div>
        <div style={{ fontSize: '1.5rem', color: 'var(--admin-border)' }}>→</div>
      </div>

      <div 
        className="admin-card" 
        onClick={onCreateContent}
        style={{ cursor: 'pointer', display: 'flex', gap: '1.5rem', alignItems: 'center' }}
      >
        <div style={{ 
          width: '64px', height: '64px', borderRadius: '1rem', 
          background: 'rgba(13, 148, 136, 0.1)', color: 'var(--admin-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '2rem'
        }}>
          📚
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Create Learning Content</h3>
          <p style={{ color: 'var(--admin-text-muted)', fontSize: '0.85rem' }}>Add new study materials to the archive.</p>
        </div>
        <div style={{ fontSize: '1.5rem', color: 'var(--admin-border)' }}>→</div>
      </div>
    </div>
  );
}
