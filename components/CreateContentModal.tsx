'use client';

import React, { useState } from 'react';

const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";

export default function CreateContentModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    subject: 'Math',
    title: '',
    description: '',
    audio_file_id: '',
    audio_url: '',
    attachments: [] as string[],
    links: [] as string[]
  });

  const [customSubject, setCustomSubject] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'attachment') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);

    try {
      for (const file of files) {
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

        const result = await response.json();
        if (result.success) {
          if (type === 'audio') {
            setFormData(prev => ({ ...prev, audio_url: result.url, audio_file_id: result.id }));
          } else {
            setFormData(prev => ({ ...prev, attachments: [...prev.attachments, `${result.url}#${encodeURIComponent(file.name)}`] }));
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'addLearningContent',
          ...formData,
          audio_file_id: formData.audio_file_id?.replace(/[{}]/g, '').split('#')[0].trim(),
          audio_url: formData.audio_url?.replace(/[{}]/g, '').split('#')[0].trim(),
          subject: formData.subject === 'Other' ? customSubject : formData.subject,
          attachments: formData.attachments.join(','),
          links: formData.links.join(',')
        })
      });
      setStatus('success');
      onRefresh();
      setTimeout(onClose, 1500);
    } catch (error) {
      setStatus('error');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="admin-card" style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem' }}>Create Learning Content</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>Audio lectures, notes, and study materials</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Date</label>
              <input 
                type="date" 
                required 
                value={formData.date} 
                onChange={e => setFormData({ ...formData, date: e.target.value })}
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
              />
            </div>
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
          </div>

          <div>
             <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Topic Title</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Introduction to Calculus"
              value={formData.title} 
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Content / Lesson Description</label>
            <textarea 
              rows={5} 
              placeholder="Enter lesson notes..."
              value={formData.description} 
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none', resize: 'none', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Audio Lecture (MP3)</label>
              <input 
                type="file" 
                accept="audio/*" 
                onChange={e => handleFileUpload(e, 'audio')} 
                disabled={isUploading}
                style={{ fontSize: '0.8rem' }}
              />
              {formData.audio_url && <p style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '0.5rem' }}>✓ Audio file ready</p>}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>PDF / Attachments</label>
              <input 
                type="file" 
                multiple 
                onChange={e => handleFileUpload(e, 'attachment')} 
                disabled={isUploading}
                style={{ fontSize: '0.8rem' }}
              />
              <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {formData.attachments.map((url, i) => (
                  <div key={i} style={{ background: '#f1f5f9', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>
                    📎 {decodeURIComponent(url.split('#')[1] || 'File')}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--admin-border)', paddingTop: '1.5rem' }}>
            <button 
              type="button" 
              onClick={onClose}
              style={{ flex: 1, padding: '0.8rem', borderRadius: '0.75rem', border: '1px solid var(--admin-border)', background: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={status === 'submitting' || isUploading}
              style={{ 
                flex: 1, padding: '0.8rem', borderRadius: '0.75rem', border: 'none', 
                background: status === 'success' ? '#10b981' : 'var(--admin-accent)', 
                color: 'white', fontWeight: 600, cursor: 'pointer' 
              }}
            >
              {status === 'idle' && 'Save Learning Content'}
              {status === 'submitting' && 'Processing...'}
              {status === 'success' && 'Archived Successfully! ✨'}
              {status === 'error' && 'Retry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
