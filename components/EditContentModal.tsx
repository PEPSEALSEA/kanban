'use client';

import React, { useState, useEffect } from 'react';
import { uploadToTelegramDirect } from '@/lib/telegram';
import { compressAudioIfNeeded } from '@/lib/audio-compressor';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';
import { useModalShell } from '@/hooks/useModalShell';
import { useData } from '@/components/DataProvider';

import { API_URL, UPLOAD_SERVICE_URL } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { audioItemsFromContent, makeAudioEntry } from '@/lib/audioItems';
import { saveLearningContent } from '@/lib/contentSave';

const GAS_WEB_APP_URL = API_URL;
const UPLOAD_WEB_APP_URL = UPLOAD_SERVICE_URL;

export default function EditContentModal({ 
  content, 
  onClose, 
  onRefresh 
}: { 
  content: any; 
  onClose: () => void; 
  onRefresh: () => void; 
}) {
  const { subjects } = useData();
  const parseItems = (str: string | undefined): string[] => {
    if (!str) return [];
    return str.split(',').filter(Boolean);
  };

  const isPredefinedSubject = subjects.some(s => s.name.trim().toLowerCase() === (content.subject || '').trim().toLowerCase());

  const isSheetTruthy = (v?: string) => v === '1' || String(v || '').toLowerCase() === 'true';

  const [formData, setFormData] = useState({
    date: (() => { const d = content.date ? new Date(content.date) : new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })(),
    subject: isPredefinedSubject ? content.subject : 'Other',
    title: content.title || '',
    description: content.description || '',
    audios: audioItemsFromContent(content.audio_url, content.audio_file_id),
    attachments: parseItems(content.attachments),
    links: parseItems(content.links),
    is_private: isSheetTruthy(content.is_private),
  });

  const [customSubject, setCustomSubject] = useState(isPredefinedSubject ? '' : content.subject);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [activeUploadType, setActiveUploadType] = useState<'audio' | 'attachment' | null>(null);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'deleting'>('idle');
  const { isMobile } = useDeviceDetection();
  const { overlayClassName, overlayStyle, panelClassName } = useModalShell();

  const tryAutoSave = async (nextFormData: typeof formData) => {
    if (!nextFormData.title.trim()) return;
    try {
      await saveLearningContent(nextFormData, customSubject, content.id);
      onRefresh();
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'attachment') => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    setActiveUploadType(type);
    setUploadProgress('✂️ Checking file size...');

    try {
      for (const file of files) {
        let fileToUpload = file;
        
        // Audio Compression Step (Only if over 45MB)
        if (type === 'audio' && file.size > 45 * 1024 * 1024) {
          setUploadProgress('✂️ Very large file. Optimizing...');
          try {
            const compressionResult = await compressAudioIfNeeded(file, (p) => {
              setUploadProgress(`✂️ Compressing: ${p}%`);
            });
            if (compressionResult.compressed) {
              fileToUpload = compressionResult.file;
            }
          } catch (compressErr) {
            console.error('Compression failed:', compressErr);
          }
        }

        setUploadProgress('⚡ High-Speed Direct Uploading...');

        // Try Direct Upload (High Speed)
        const result = await uploadToTelegramDirect(fileToUpload, type === 'audio' ? 'audio' : 'document');
        
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

          if (type === 'audio') {
            const entry = makeAudioEntry(result.url, file.name, result.fileId);
            setFormData(prev => {
              const next = { ...prev, audios: [...prev.audios, entry] };
              tryAutoSave(next);
              return next;
            });
          } else {
            setFormData(prev => ({ ...prev, attachments: [...prev.attachments, `${result.url}#${encodeURIComponent(file.name)}#${result.fileId}`] }));
          }
        } else {
          // Fallback to GAS (Slow)
          const errorMsg = result.error || 'Direct Upload Failed';
          setUploadProgress(`🐢 Slow Fallback (${errorMsg})...`);
          
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

          const res = (await response.json()) as any;
          if (res.success) {
            if (type === 'audio') {
              const entry = makeAudioEntry(res.url, file.name, res.id);
              setFormData(prev => {
                const next = { ...prev, audios: [...prev.audios, entry] };
                tryAutoSave(next);
                return next;
              });
            } else {
              setFormData(prev => ({ ...prev, attachments: [...prev.attachments, `${res.url}#${encodeURIComponent(file.name)}#${res.id}`] }));
            }
          }
        }
      }
    } catch (error) {
      console.error('Upload process failed:', error);
      setUploadProgress('❌ Upload Failed');
    } finally {
      setIsUploading(false);
      setActiveUploadType(null);
      setUploadProgress('');
    }
  };

  const removeAttachment = (urlToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      attachments: prev.attachments.filter(url => url !== urlToRemove)
    }));
  };

  const removeAudio = (entryToRemove: string) => {
    setFormData(prev => {
      const next = { ...prev, audios: prev.audios.filter(a => a !== entryToRemove) };
      if (next.title.trim()) tryAutoSave(next);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    try {
      await saveLearningContent(formData, customSubject, content.id);
      setStatus('success');
      onRefresh();
      setTimeout(onClose, 1500);
    } catch (error) {
      console.error(error);
      setStatus('error');
    }
  };

  const handleDelete = async () => {
    if (window.confirm("Are you sure you want to delete this content? This action cannot be undone.")) {
      setStatus('deleting');
      try {
        await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ action: 'deleteLearningContent', id: content.id })
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
    <div className={overlayClassName} style={overlayStyle}>
      <div className={panelClassName} style={{ width: '100%', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid var(--admin-border)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', color: 'var(--admin-text-main)' }}>Edit Learning Content</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>Mange audio lectures and study materials</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--admin-text-muted)' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
           <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
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
                {subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                <option value="Other">Other</option>
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

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Audio Lecture (MP3)</label>
              <input 
                type="file" 
                accept="audio/*"
                multiple
                onChange={e => handleFileUpload(e, 'audio')} 
                disabled={isUploading}
              />
              {isUploading && uploadProgress && activeUploadType === 'audio' && (
                <p style={{ fontSize: '0.7rem', color: uploadProgress.includes('⚡') ? '#10b981' : '#f59e0b', marginTop: '0.4rem', fontWeight: 600 }}>
                  {uploadProgress}
                </p>
              )}
              <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {formData.audios.map((entry, i) => (
                  <div key={i} style={{ background: 'var(--admin-bg-soft)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--admin-border)' }}>
                    <span>🎵 {decodeURIComponent(entry.split('#')[1] || 'Audio')}</span>
                    <button type="button" onClick={() => removeAudio(entry)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
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
              {isUploading && uploadProgress && activeUploadType === 'attachment' && (
                <p style={{ fontSize: '0.7rem', color: uploadProgress.includes('⚡') ? '#10b981' : '#f59e0b', marginTop: '0.4rem', fontWeight: 600 }}>
                  {uploadProgress}
                </p>
              )}
              <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {formData.attachments.map((url, i) => (
                  <div key={i} style={{ background: 'var(--admin-bg-soft)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid var(--admin-border)' }}>
                    <span>📎 {decodeURIComponent(url.split('#')[1] || 'File')}</span>
                    <button type="button" onClick={() => removeAttachment(url)} style={{ background: 'none', border: 'none', color: '#ef4444', fontWeight: 'bold', cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--admin-text-main)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.is_private}
              onChange={(e) => setFormData({ ...formData, is_private: e.target.checked })}
            />
            Private content (admin only)
          </label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1.5rem', borderTop: '1px solid var(--admin-border)', paddingTop: '1.5rem' }}>
            <button 
              type="button" 
              onClick={handleDelete}
              disabled={status === 'submitting' || status === 'deleting' || isUploading}
              style={{ flex: isMobile ? 1 : 'none', padding: '0.8rem 1.2rem', borderRadius: '0.75rem', border: 'none', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', fontWeight: 600, cursor: 'pointer' }}
            >
              {status === 'deleting' ? 'Deleting...' : 'Delete'}
            </button>
            {!isMobile && <div style={{ flex: 1 }}></div>}
            <button 
              type="button" 
              onClick={onClose}
              style={{ flex: isMobile ? 1 : 'none', padding: '0.8rem 2rem', borderRadius: '0.75rem', border: '1px solid var(--admin-border)', background: 'none', color: 'var(--admin-text-main)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={status === 'submitting' || status === 'deleting' || isUploading}
              style={{ 
                flex: isMobile ? '1 0 100%' : 'none', padding: '0.8rem 2rem', borderRadius: '0.75rem', border: 'none', 
                background: status === 'success' ? '#10b981' : 'var(--admin-accent)', 
                color: 'white', fontWeight: 600, cursor: 'pointer' 
              }}
            >
              {status === 'idle' && 'Save Changes'}
              {status === 'submitting' && 'Processing...'}
              {status === 'success' && 'Saved! ✨'}
              {status === 'error' && 'Retry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
