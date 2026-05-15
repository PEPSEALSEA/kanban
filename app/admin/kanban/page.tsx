'use client';

import React, { useState, useMemo } from 'react';
import { useData, GAS_WEB_APP_URL } from '@/components/DataProvider';
import EditHomeworkModal from '@/components/EditHomeworkModal';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

export default function KanbanEditor() {
  const { allHomework, refreshData, subjects } = useData();
  const [editingHomework, setEditingHomework] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSendingSummary, setIsSendingSummary] = useState(false);
  const [summaryLogs, setSummaryLogs] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const { isMobile } = useDeviceDetection();

  const filteredHomework = useMemo(() => {
    let tasks = [...allHomework];

    // Sort by deadline descending (latest first)
    tasks.sort((a, b) => {
      const dateA = (a as any).deadline ? new Date((a as any).deadline).getTime() : 0;
      const dateB = (b as any).deadline ? new Date((b as any).deadline).getTime() : 0;
      
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      
      // Secondary sort by id descending (assuming newer tasks have larger IDs)
      return String((b as any).id).localeCompare(String((a as any).id));
    });

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

  const handleSendSummary = async () => {
    if (!confirm('Are you sure you want to send the daily summary to Discord now?')) return;

    setIsSendingSummary(true);
    setSummaryLogs('Sending...');

    try {
      // We use a POST request with the action parameter
      const response = await fetch(`${GAS_WEB_APP_URL}?action=sendSummary&date=${summaryDate}`, {
        method: 'POST',
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
              onClick={handleSendSummary}
              disabled={isSendingSummary}
              style={{
                background: '#5865F2', // Discord color
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '0.75rem',
                cursor: isSendingSummary ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: isSendingSummary ? 0.7 : 1,
                transition: 'all 0.2s ease'
              }}
            >
              {isSendingSummary ? '⌛ Sending...' : '📢 Send Daily Summary to Discord'}
            </button>
          </div>
        </div>
      </header>

      {summaryLogs && (
        <div className="admin-card" style={{ marginBottom: '2rem', borderLeft: '4px solid #5865F2', position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Execution Logs</h3>
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
          {isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {filteredHomework.map((hw) => (
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
              {filteredHomework.length === 0 && (
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
                {filteredHomework.map((hw) => (
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
                {filteredHomework.length === 0 && (
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
