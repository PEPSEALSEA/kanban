'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

// --- CONFIGURATION ---
// I've extracted this from your latest update to the GAS script
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";

// You can add more admin emails here
const ADMIN_EMAILS = ['pepsealsea@gmail.com', 'iampep2009@gmail.com'];
const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";

type UserInfo = {
    email: string;
    name: string;
    picture: string;
};

export default function AdminPage() {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [isAuthChecking, setIsAuthChecking] = useState(true);

    const [formData, setFormData] = useState({
        subject: 'Math',
        title: '',
        description: '',
        deadline: '',
        link_work: '',
        link_image: '',
        note: ''
    });

    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        const savedUser = localStorage.getItem('homework_user');
        if (savedUser) {
            const parsedUser = JSON.parse(savedUser);
            setUser(parsedUser);
            if (ADMIN_EMAILS.includes(parsedUser.email.toLowerCase())) {
                setIsAdmin(true);
            }
        }
        setIsAuthChecking(false);
    }, []);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve) => {
                reader.onload = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.readAsDataURL(file);
            });

            const base64Data = await base64Promise;

            const response = await fetch(`${UPLOAD_WEB_APP_URL}?action=upload&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`, {
                method: 'POST',
                body: base64Data
            });

            const result = await response.json();
            if (result.success) {
                setFormData(prev => ({ ...prev, link_image: result.url }));
            } else {
                alert("Upload failed: " + result.message);
            }
        } catch (error) {
            console.error("Upload error:", error);
            alert("Failed to upload image.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('submitting');

        try {
            const formDataObj: Record<string, string> = {
                action: 'addHomework',
                ...formData
            };
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                body: new URLSearchParams(formDataObj)
            });

            const result = await response.json();
            if (!result?.success) {
                throw new Error(result?.error || 'Backend error');
            }

            setStatus('success');
            setFormData({
                subject: 'Math',
                title: '',
                description: '',
                deadline: '',
                link_work: '',
                link_image: '',
                note: ''
            });

            setTimeout(() => setStatus('idle'), 3000);
        } catch (error) {
            console.error("Submission error:", error);
            setStatus('error');
            setErrorMessage('Failed to connect to the backend.');
        }
    };

    if (isAuthChecking) {
        return <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Verifying identity...</div>;
    }

    if (!isAdmin) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-gradient)' }}>
                <div className="glass" style={{ padding: '3rem', borderRadius: '1.5rem', textAlign: 'center', border: '1px solid var(--accent)' }}>
                    <h2 style={{ color: 'var(--accent)', marginBottom: '1rem' }}>Access Denied</h2>
                    <p style={{ color: 'var(--text-muted)' }}>This area is reserved for administrators.</p>
                    <Link href="/" style={{ display: 'inline-block', marginTop: '2rem', color: 'var(--primary)', textDecoration: 'underline' }}>Return to Dashboard</Link>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', padding: '3rem 1.5rem', background: 'var(--bg-gradient)' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, background: 'linear-gradient(to right, #6366f1, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            Admin Console
                        </h1>
                        <p style={{ color: 'var(--text-muted)' }}>Add new assignments to the StudyFlow database.</p>
                    </div>
                    <Link href="/" className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.75rem', fontSize: '0.875rem' }}>
                        ← Back to Board
                    </Link>
                </header>

                <form onSubmit={handleSubmit} className="glass" style={{ padding: '2.5rem', borderRadius: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', animation: 'slideIn 0.5s ease-out' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subject</label>
                            <select
                                className="glass"
                                style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--card-border)', outline: 'none' }}
                                value={formData.subject}
                                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                            >
                                {['Math', 'Science', 'History', 'English', 'Arts', 'Computer', 'Other'].map(s => <option key={s} value={s} style={{ background: '#0f172a' }}>{s}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</label>
                            <input
                                type="date"
                                required
                                className="glass"
                                style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--card-border)', outline: 'none' }}
                                value={formData.deadline}
                                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g., Chapter 4: Matrix Operations"
                            className="glass"
                            style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--card-border)', outline: 'none' }}
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
                        <textarea
                            rows={3}
                            placeholder="Provide assignment details..."
                            className="glass"
                            style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--card-border)', outline: 'none', resize: 'none' }}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Work Link</label>
                            <input
                                type="url"
                                placeholder="https://..."
                                className="glass"
                                style={{ width: '100%', padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--card-border)', outline: 'none' }}
                                value={formData.link_work}
                                onChange={(e) => setFormData({ ...formData, link_work: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Image URL (Optional)</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="url"
                                    placeholder="https://..."
                                    className="glass"
                                    style={{ flex: 1, padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid var(--card-border)', outline: 'none' }}
                                    value={formData.link_image}
                                    onChange={(e) => setFormData({ ...formData, link_image: e.target.value })}
                                />
                                <label className="glass" style={{
                                    padding: '0.875rem', borderRadius: '0.75rem', background: 'rgba(99, 102, 241, 0.1)',
                                    border: '1px dashed var(--primary)', cursor: 'pointer', fontSize: '0.75rem',
                                    display: 'flex', alignItems: 'center', transition: '0.2s', minWidth: '90px', justifyContent: 'center'
                                }}>
                                    {isUploading ? '⌛...' : '📷 Upload'}
                                    <input type="file" accept="image/*" hidden onChange={handleFileUpload} disabled={isUploading} />
                                </label>
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        className="glass"
                        style={{
                            marginTop: '1rem',
                            padding: '1.25rem',
                            borderRadius: '1rem',
                            background: status === 'success' ? '#10b981' : 'var(--primary)',
                            color: '#fff',
                            border: 'none',
                            fontWeight: 700,
                            cursor: status === 'submitting' ? 'wait' : 'pointer',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: status === 'submitting' ? 'scale(0.98)' : 'scale(1)',
                            opacity: status === 'submitting' ? 0.7 : 1
                        }}
                    >
                        {status === 'idle' && '🚀 Publish Assignment'}
                        {status === 'submitting' && '📤 Sending to Cloud...'}
                        {status === 'success' && '✨ Assignment Added!'}
                        {status === 'error' && '❌ Try Again'}
                    </button>

                    {status === 'error' && <p style={{ color: 'var(--accent)', fontSize: '0.875rem', textAlign: 'center' }}>{errorMessage}</p>}
                </form>
            </div>

            <style jsx>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </main>
    );
}
