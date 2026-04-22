'use client';

import React, { useState } from 'react';
import { uploadToTelegramDirect } from '@/lib/telegram';

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";

export default function EditHomeworkModal({ 
  homework, 
  onClose, 
  onRefresh 
}: { 
  homework: any; 
  onClose: () => void; 
  onRefresh: () => void; 
}) {
  const parseLinks = (links: string | undefined): string[] => {
    if (!links) return [];
    return links.split(',').filter(Boolean);
  };

  const isPredefinedSubject = ['Math', 'Science', 'History', 'English', 'Arts', 'Computer'].includes(homework.subject);

  const [formData, setFormData] = useState({
    subject: isPredefinedSubject ? homework.subject : 'Other',
    title: homework.title || '',
    description: homework.description || '',
    deadline: homework.deadline ? (() => { const d = new Date(homework.deadline); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })() : '',
    link_image: parseLinks(homework.link_image)
  });

  const [customSubject, setCustomSubject] = useState(isPredefinedSubject ? '' : homework.subject);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'deleting'>('idle');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      for (const file of files) {
        // Try Direct Upload (High Speed)
        const result = await uploadToTelegramDirect(file, 'document');
        
        if (result.success) {
          // Register in database sheet (background)
          fetch(`${UPLOAD_WEB_APP_URL}?action=registerUpload`, {
            method: 'POST',
            body: JSON.stringify({
              fileId: result.fileId,
              url: result.url,
              filename: file.name,
              contentType: file.type
            })
          }).catch(err => console.error('Metadata registration failed:', err));

          setFormData(prev => ({ 
            ...prev, 
            link_image: [...prev.link_image, `${result.url}#${encodeURIComponent(file.name)}`] 
          }));
        } else {
          // Fallback to GAS (Slow)
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(file);
          });

          const base64Data = await base64Promise;
          const response = await fetch(`${UPLOAD_WEB_APP_URL}?action=upload&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || 'application/octet-stream')}`, {
            method: 'POST',
            body: base64Data
          });

          const res = await response.json();
          if (res.success) {
            setFormData(prev => ({ 
              ...prev, 
              link_image: [...prev.link_image, `${res.url}#${encodeURIComponent(file.name)}`] 
            }));
          }
        }
      }
    } catch (error) {
      console.error('Upload process failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const removeAttachment = (urlToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      link_image: prev.link_image.filter(url => url !== urlToRemove)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'editHomework',
          id: homework.id,
          subject: formData.subject === 'Other' ? customSubject : formData.subject,
          title: formData.title,
          description: formData.description,
          deadline: formData.deadline,
          link_image: formData.link_image.join(',')
        })
      });
      setStatus('success');
      onRefresh();
      setTimeout(onClose, 1500);
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const handleDeleteTask = async () => {
    if (window.confirm("Are you sure you want to delete this task? This action cannot be undone.")) {
      setStatus('deleting');
      try {
        await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          body: new URLSearchParams({
            action: 'deleteHomework',
            id: homework.id
          })
        });
        setStatus('success');
        onRefresh();
        setTimeout(onClose, 1500);
      } catch (error) {
        console.error(error);
        setStatus('error');
      }
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="admin-card" style={{ width: '100%', maxWidth: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Edit Task</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Subject</label>
              <select 
                value={formData.subject} 
                onChange={e => setFormData({ ...formData, subject: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
              >
                 {['Math', 'Science', 'History', 'English', 'Arts', 'Computer', 'Other'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {formData.subject === 'Other' && (
                <div style={{ marginTop: '0.5rem' }}>
                  <input 
                    type="text" 
                    placeholder="Subject Name"
                    value={customSubject}
                    onChange={e => setCustomSubject(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
                  />
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Deadline</label>
              <input 
                type="date" 
                required 
                value={formData.deadline} 
                onChange={e => setFormData({ ...formData, deadline: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Assignment Title</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Chapter 4 Quiz"
              value={formData.title} 
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Description / Instructions</label>
            <textarea 
              rows={4} 
              placeholder="Provide details about the assignment..."
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none', resize: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Attachments (Telegram Upload)</label>
            <input 
              type="file" 
              multiple 
              onChange={handleFileUpload} 
              disabled={isUploading}
              style={{ fontSize: '0.8rem' }}
            />
            {isUploading && <p style={{ fontSize: '0.75rem', color: 'var(--admin-primary)', marginTop: '0.5rem' }}>Uploading...</p>}
            <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {formData.link_image.map((url, i) => (
                <div key={i} style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>📎 {decodeURIComponent(url.split('#')[1] || 'File')}</span>
                  <button 
                    type="button" 
                    onClick={() => removeAttachment(url)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
             <button 
              type="button" 
              onClick={handleDeleteTask}
              disabled={status === 'submitting' || status === 'deleting'}
              style={{ padding: '0.8rem 1.2rem', borderRadius: '0.75rem', border: 'none', background: '#fee2e2', color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}
            >
              {status === 'deleting' ? 'Deleting...' : 'Delete Task'}
            </button>
            <button 
              type="button" 
              onClick={onClose}
              style={{ flex: 1, padding: '0.8rem', borderRadius: '0.75rem', border: '1px solid var(--admin-border)', background: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={status === 'submitting' || status === 'deleting'}
              style={{ 
                flex: 1, padding: '0.8rem', borderRadius: '0.75rem', border: 'none', 
                background: status === 'success' ? '#10b981' : 'var(--admin-primary)', 
                color: 'white', fontWeight: 600, cursor: 'pointer' 
              }}
            >
              {status === 'idle' && 'Save Changes'}
              {status === 'submitting' && 'Saving...'}
              {status === 'success' && 'Saved! ✨'}
              {status === 'error' && 'Retry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
