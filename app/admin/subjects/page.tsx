'use client';

import React, { useState, useMemo } from 'react';
import { useData, GAS_WEB_APP_URL } from '@/components/DataProvider';
import { authHeaders } from '@/lib/auth';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

export default function SubjectManagement() {
  const { subjects, refreshData } = useData();
  const { isMobile } = useDeviceDetection();
  const [newSubject, setNewSubject] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Auto-generate a vibrant color using HSL
  const generateAutoColor = () => {
    // We want vibrant, but not too light/dark
    const hue = Math.floor(Math.random() * 360);
    const saturation = 70 + Math.floor(Math.random() * 20); // 70-90%
    const lightness = 45 + Math.floor(Math.random() * 10); // 45-55%
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const color = generateAutoColor();
      const res = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'addSubject', name: newSubject.trim(), color })
      });
      if (res.ok) {
        setNewSubject('');
        await refreshData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this subject?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'deleteSubject', id })
      });
      if (res.ok) {
        await refreshData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-page">
      <header style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>Subject Management</h1>
        <p style={{ color: 'var(--admin-text-muted)' }}>Manage categories and color coding for your tasks.</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '2rem', alignItems: 'start' }}>
        {/* Add Section */}
        <div className="admin-card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--admin-text-main)' }}>Add New Subject</h2>
          <form onSubmit={handleAddSubject} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--admin-text-muted)' }}>Subject Name</label>
              <input 
                type="text" 
                placeholder="e.g. Advanced Physics"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                required
                style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', outline: 'none' }}
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', fontStyle: 'italic' }}>
              ✨ A vibrant color will be auto-generated for this subject.
            </p>
            <button 
              type="submit" 
              disabled={isSubmitting}
              style={{ 
                width: '100%', padding: '0.8rem', borderRadius: '0.75rem', border: 'none', 
                background: 'var(--admin-primary)', color: 'white', fontWeight: 700, cursor: 'pointer' 
              }}
            >
              {isSubmitting ? 'Adding...' : 'Add Subject'}
            </button>
          </form>
        </div>

        {/* List Section */}
        <div className="admin-card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.5rem', color: 'var(--admin-text-main)' }}>Current Subjects</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {subjects.map((sub) => (
              <div key={sub.id} style={{ 
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                padding: '0.75rem', borderRadius: '0.5rem', background: 'var(--admin-bg-soft)',
                border: '1px solid var(--admin-border)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: sub.color }}></div>
                  <span style={{ fontWeight: 600, color: 'var(--admin-text-main)' }}>{sub.name}</span>
                </div>
                <button 
                  onClick={() => handleDeleteSubject(sub.id)}
                  disabled={deletingId === sub.id}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                  title="Delete Subject"
                >
                  {deletingId === sub.id ? '...' : '✕'}
                </button>
              </div>
            ))}
            {subjects.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: '2rem' }}>No custom subjects yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
