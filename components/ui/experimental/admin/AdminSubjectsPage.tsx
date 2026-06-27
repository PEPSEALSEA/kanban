'use client';

import React, { useState } from 'react';
import { useData, GAS_WEB_APP_URL } from '@/components/DataProvider';
import { authHeaders } from '@/lib/auth';
import { Badge, Button, Card, Input } from '@/components/ui/experimental/primitives';

export default function ExperimentalAdminSubjectsPage() {
  const { subjects, refreshData } = useData();
  const [newSubject, setNewSubject] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const generateAutoColor = () => {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 75%, 50%)`;
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubject.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'addSubject', name: newSubject.trim(), color: generateAutoColor() }),
      });
      if (res.ok) {
        setNewSubject('');
        await refreshData();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!window.confirm('Delete this subject?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'deleteSubject', id }),
      });
      if (res.ok) await refreshData();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 4 }}>Subjects</h1>
        <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)' }}>Categories and color coding for tasks</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Add subject</h2>
          <form onSubmit={handleAddSubject} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input
              placeholder="e.g. Advanced Physics"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              required
            />
            <p style={{ fontSize: 12, color: 'var(--exp-ink-subtle)' }}>A vibrant color is auto-generated.</p>
            <Button variant="primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add subject'}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Current subjects</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {subjects.map((sub) => (
              <div
                key={sub.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--exp-surface-2)',
                  border: '1px solid var(--exp-hairline)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Badge color={sub.color}>{sub.name}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteSubject(sub.id)}
                  disabled={deletingId === sub.id}
                >
                  {deletingId === sub.id ? '…' : 'Delete'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
