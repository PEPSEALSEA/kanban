'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
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
        subject: 'คณิตศาสตร์',
        title: '',
        description: '',
        deadline: '',
        link_work: [] as string[],
        link_image: [] as string[],
        note: ''
    });

    const [newLink, setNewLink] = useState('');
    const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState('');
    const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; id: string }[]>([]);

    // --- UI STATES ---
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; isDanger?: boolean } | null>(null);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

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

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 4000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    const extractDriveId = (url: string) => {
        if (!url || !url.includes('http')) return null;
        if (url.includes('drive.google.com/file/d/')) {
            const parts = url.split('/d/');
            if (parts[1]) return parts[1].split('/')[0];
        }
        if (url.includes('/d/')) {
            const parts = url.split('/d/');
            if (parts[1]) return parts[1].split(/[/?#]/)[0];
        }
        return null;
    };

    const getFileLabel = (url: string) => {
        const lower = url.toLowerCase();
        if (lower.includes('googleusercontent.com') || lower.match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i)) return 'รูปภาพประกอบ';
        if (lower.includes('.pdf') || lower.includes('pdf')) return 'เอกสาร PDF';
        if (lower.includes('.doc') || lower.includes('msword')) return 'เอกสาร Word';
        if (lower.includes('.xls') || lower.includes('excel')) return 'ตาราง Excel';
        return 'ไฟล์แนบ';
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newItems = files.map(f => ({ name: f.name, status: 'uploading' as const, id: Math.random().toString(36).substr(2, 9) }));
        setUploadQueue(newItems);
        setIsUploading(true);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const fileId = newItems[i].id;

                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve) => {
                    reader.onload = () => {
                        const base64 = (reader.result as string).split(',')[1];
                        resolve(base64);
                    };
                    reader.readAsDataURL(file);
                });

                const base64Data = await base64Promise;
                const cType = file.type || 'application/octet-stream';

                const response = await fetch(`${UPLOAD_WEB_APP_URL}?action=upload&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(cType)}`, {
                    method: 'POST',
                    body: base64Data
                });

                const result = await response.json();
                if (result.success) {
                    setFormData(prev => ({ ...prev, link_image: [...prev.link_image, result.url] }));
                    setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'done' } : f));
                } else {
                    setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
                }
            }
        } catch (error) {
            setNotification({ message: "การอัปโหลดล้มเหลว", type: 'error' });
        } finally {
            e.target.value = '';
        }
    };

    const triggerSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setConfirmModal({
            title: "ยืนยันการเผยแพร่",
            message: "คุณต้องการเพิ่มงานใหม่นี้ลงในระบบใช่หรือไม่?",
            onConfirm: () => {
                setConfirmModal(null);
                executeSubmit();
            }
        });
    };

    const executeSubmit = async () => {
        setStatus('submitting');
        try {
            const submissionData = {
                ...formData,
                link_work: formData.link_work.join(','),
                link_image: formData.link_image.join(',')
            };

            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                body: new URLSearchParams({
                    action: 'addHomework',
                    ...submissionData
                })
            });

            const result = await response.json();
            if (!result?.success) throw new Error(result?.error || 'Backend error');

            setStatus('success');
            setNotification({ message: "เพิ่มงานใหม่สำเร็จแล้ว! ✨", type: 'success' });
            setFormData({
                subject: 'คณิตศาสตร์',
                title: '',
                description: '',
                deadline: '',
                link_work: [],
                link_image: [],
                note: ''
            });
            setTimeout(() => setStatus('idle'), 3000);
        } catch (error) {
            setStatus('error');
            setNotification({ message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล", type: 'error' });
        }
    };

    if (isAuthChecking) {
        return (
            <div style={{ background: '#020617', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
                <div className="loader"></div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem', letterSpacing: '1px' }}>กำลังตรวจสอบสิทธิ์...</div>
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', padding: '1.5rem' }}>
                <div className="glass" style={{ padding: '4rem 3rem', borderRadius: '3rem', textAlign: 'center', border: '1px solid rgba(244, 63, 94, 0.2)', maxWidth: '500px' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>🚫</div>
                    <h2 style={{ color: '#f43f5e', fontSize: '2rem', fontWeight: 900, marginBottom: '1rem' }}>คุณไม่มีสิทธิ์เข้าถึง</h2>
                    <p style={{ color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>หน้านี้สงวนไว้สำหรับผู้ดูแลระบบเท่านั้น หากคุณคิดว่านี่เป็นข้อผิดพลาด โปรดติดต่อผู้พัฒนา</p>
                    <Link href="/" style={{ display: 'inline-block', marginTop: '2.5rem', background: 'rgba(255,255,255,0.05)', padding: '1rem 2rem', borderRadius: '1.25rem', color: '#fff', textDecoration: 'none', fontWeight: 700, border: '1px solid rgba(255,255,255,0.1)' }}>
                        กลับสู่หน้าหลัก
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', padding: '4rem 1.5rem', background: '#020617' }}>
            <div style={{ maxWidth: '850px', margin: '0 auto' }}>
                <header style={{ marginBottom: '4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.5rem' }}>
                            <span style={{ padding: '6px 12px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '1px' }}>ADMIN ONLY</span>
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>/</span>
                            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 600 }}>Create</span>
                        </div>
                        <h1 style={{ fontSize: '3.5rem', fontWeight: 900, margin: 0, letterSpacing: '-0.04em', background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.5) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                            ลงประกาศงาน
                        </h1>
                    </div>
                    <Link href="/" className="glass" style={{ padding: '1rem 1.5rem', borderRadius: '1.25rem', fontSize: '0.9rem', fontWeight: 800, color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span>←</span> กลับหน้าบอร์ด
                    </Link>
                </header>

                <form onSubmit={triggerSubmit} className="glass" style={{ padding: '3.5rem', borderRadius: '3rem', display: 'flex', flexDirection: 'column', gap: '2.5rem', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)', boxShadow: '0 40px 100px rgba(0,0,0,0.5)' }}>

                    {/* ข้อมูลพื้นฐาน */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                        <div className="form-group">
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>วิชา (Subject)</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    list="subjects-list"
                                    required
                                    className="glass"
                                    style={{ width: '100%', padding: '1.1rem 1.25rem', borderRadius: '1.25rem', background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', fontSize: '1rem', fontWeight: 600 }}
                                    value={formData.subject}
                                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                                    placeholder="เลือกหรือพิมพ์ชื่อวิชา..."
                                />
                                <datalist id="subjects-list">
                                    {['คณิตศาสตร์', 'วิทยาศาสตร์', 'ประวัติศาสตร์', 'ภาษาอังกฤษ', 'ศิลปะ', 'คอมพิวเตอร์', 'เคมี', 'ฟิสิกส์', 'ชีววิทยา', 'ภาษาไทย'].map(s => <option key={s} value={s} />)}
                                </datalist>
                            </div>
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>กำหนดส่ง (Deadline)</label>
                            <input
                                type="date"
                                required
                                className="glass"
                                style={{ width: '100%', padding: '1.1rem 1.25rem', borderRadius: '1.25rem', background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', fontSize: '1rem', fontWeight: 600 }}
                                value={formData.deadline}
                                onChange={(e) => setFormData({ ...formData, deadline: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>หัวข้องาน (Title)</label>
                        <input
                            type="text"
                            required
                            placeholder="เช่น บทที่ 4: การคำนวณเลขยกกำลัง"
                            className="glass"
                            style={{ width: '100%', padding: '1.1rem 1.25rem', borderRadius: '1.25rem', background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', fontSize: '1.1rem', fontWeight: 700 }}
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>รายละเอียด (Description)</label>
                        <textarea
                            rows={4}
                            placeholder="ระบุรายละเอียดของงาน คำสั่ง หรือหมายเหตุ..."
                            className="glass"
                            style={{ width: '100%', padding: '1.25rem', borderRadius: '1.5rem', background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none', resize: 'none', fontSize: '1rem', lineHeight: 1.6 }}
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                    </div>

                    {/* จัดการลิงก์ภายนอก */}
                    <div className="form-group">
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>ลิงก์เพิ่มเติม (External Links)</label>
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '1.25rem' }}>
                            <input
                                type="url"
                                placeholder="คัดลอกลิงก์มาวางที่นี่..."
                                className="glass"
                                style={{ flex: 1, padding: '1.1rem 1.25rem', borderRadius: '1.25rem', background: 'rgba(255,255,255,0.03)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)', outline: 'none' }}
                                value={newLink}
                                onChange={(e) => setNewLink(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => { if (newLink) { setFormData(prev => ({ ...prev, link_work: [...prev.link_work, newLink] })); setNewLink(''); } }}
                                style={{ padding: '0 2.5rem', borderRadius: '1.25rem', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 20px rgba(99, 102, 241, 0.2)' }}
                            >เพิ่ม</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {formData.link_work.map((link, idx) => (
                                <div key={idx} style={{ padding: '0.75rem 1.25rem', borderRadius: '1rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }}>🔗 {link}</span>
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, link_work: prev.link_work.filter((_, i) => i !== idx) }))}
                                        style={{ color: '#f43f5e', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700 }}
                                    >ลบออก</button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* อัปโหลดไฟล์ */}
                    <div className="form-group">
                        <label style={{ display: 'block', color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem', marginBottom: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>ไฟล์แนบและรูปภาพประกอบ (Drive Upload)</label>
                        <label className="glass" style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3.5rem',
                            border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '2.5rem', cursor: 'pointer', transition: '0.3s', background: 'rgba(255,255,255,0.02)', position: 'relative', overflow: 'hidden'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: isUploading ? 'bounce 1s infinite' : 'none' }}>{isUploading ? '🚀' : '☁️'}</div>
                            <span style={{ fontSize: '1rem', fontWeight: 800, color: '#fff' }}>{isUploading ? 'กำลังอัปโหลด...' : 'คลิกเพื่อเลือกไฟล์หรือรูปภาพ'}</span>
                            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginTop: '8px' }}>ไฟล์จะถูกเก็บไว้ใน Google Drive โดยอัตโนมัติ</span>
                            {isUploading && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, height: '4px', background: 'var(--primary)', width: '100%', animation: 'loading-bar 2s infinite linear' }}></div>
                            )}
                            <input type="file" multiple accept="" hidden onChange={handleFileUpload} disabled={isUploading} />
                        </label>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1.25rem', marginTop: '2rem' }}>
                            {formData.link_image.map((url, idx) => {
                                const [rawUrl, hashName] = url.split('#');
                                const realFilename = hashName ? decodeURIComponent(hashName) : getFileLabel(url);
                                const isImage = rawUrl.includes('googleusercontent.com') || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i);
                                const driveId = extractDriveId(rawUrl);
                                const viewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/view` : rawUrl;

                                return (
                                    <div key={idx} style={{ position: 'relative', borderRadius: '1.5rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', transition: '0.3s' }} className="file-preview-card">
                                        {isImage ? (
                                            <img src={rawUrl} style={{ width: '100%', height: '120px', objectFit: 'cover' }} alt={realFilename} />
                                        ) : (
                                            <div style={{ height: '120px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '2rem' }}>{rawUrl.toLowerCase().includes('pdf') || realFilename.toLowerCase().endsWith('.pdf') ? '📕' : '📄'}</span>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, textAlign: 'center', padding: '0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                                    {realFilename}
                                                </span>
                                            </div>
                                        )}

                                        <div style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.02)' }}>
                                            <a href={viewUrl} target="_blank" rel="noreferrer" style={{ display: 'block', textAlign: 'center', fontSize: '0.7rem', color: '#fff', background: 'rgba(255,255,255,0.05)', padding: '8px 0', borderRadius: '8px', textDecoration: 'none', fontWeight: 700 }}>ดูไฟล์</a>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => setFormData(prev => ({ ...prev, link_image: prev.link_image.filter((_, i) => i !== idx) }))}
                                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(244, 63, 94, 0.9)', border: 'none', color: '#fff', borderRadius: '50%', width: '24px', height: '24px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}
                                        >✕</button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={status === 'submitting'}
                        className="glass"
                        style={{
                            marginTop: '2rem',
                            padding: '1.5rem',
                            borderRadius: '1.5rem',
                            background: status === 'success' ? '#10b981' : 'var(--primary)',
                            color: '#fff',
                            border: 'none',
                            fontSize: '1.1rem',
                            fontWeight: 900,
                            cursor: status === 'submitting' ? 'wait' : 'pointer',
                            transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            boxShadow: status === 'success' ? '0 15px 35px rgba(16, 185, 129, 0.3)' : '0 15px 35px rgba(99, 102, 241, 0.3)'
                        }}
                    >
                        {status === 'idle' && '🚀 เผยแพร่ประกาศงาน'}
                        {status === 'submitting' && '📤 กำลังส่งข้อมูลไปยังระบบ...'}
                        {status === 'success' && '✨ เพิ่มงานสำเร็จแล้ว!'}
                        {status === 'error' && '❌ ลองใหม่อีกครั้ง'}
                    </button>
                </form>
            </div>

            {/* MODALS & NOTIFICATIONS */}
            {uploadQueue.length > 0 && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.85)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', zIndex: 12500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
                    <div className="glass" style={{ width: '100%', maxWidth: '450px', padding: '3rem', borderRadius: '3rem', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15, 23, 42, 0.95)', boxShadow: '0 50px 100px rgba(0,0,0,0.7)' }}>
                        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: '1rem', animation: uploadQueue.some(f => f.status === 'uploading') ? 'bounce 1s infinite' : 'none' }}>🚀</div>
                            <h3 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '0.5rem', letterSpacing: '-0.03em' }}>กำลังอัปโหลดไฟล์</h3>
                            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.95rem' }}>โปรดรอสักครู่ ระบบกำลังจัดเก็บข้อมูลของคุณ...</p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto' }}>
                            {uploadQueue.map(f => (
                                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '14px 18px', background: 'rgba(255,255,255,0.03)', borderRadius: '1.25rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    {f.status === 'uploading' ? (
                                        <div className="loader" style={{ width: '20px', height: '20px', border: '2px solid rgba(99, 102, 241, 0.2)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                                    ) : f.status === 'done' ? (
                                        <span style={{ fontSize: '1.2rem', color: '#10b981' }}>✅</span>
                                    ) : (
                                        <span style={{ fontSize: '1.2rem', color: '#f43f5e' }}>❌</span>
                                    )}
                                    <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: f.status === 'done' ? 0.5 : 1 }}>{f.name}</span>
                                    {f.status === 'done' && <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>อัปโหลดเสร็จแล้ว</span>}
                                </div>
                            ))}
                        </div>

                        {uploadQueue.every(f => f.status !== 'uploading') && (
                            <button
                                onClick={() => { setUploadQueue([]); setIsUploading(false); }}
                                style={{ width: '100%', marginTop: '2.5rem', padding: '1.25rem', borderRadius: '1.5rem', background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 15px 35px rgba(99, 102, 241, 0.3)', transition: '0.3s' }}
                            >ตกลง</button>
                        )}
                    </div>
                </div>
            )}

            {notification && (
                <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 12000, animation: 'slideInRight 0.3s ease-out' }}>
                    <div className="glass" style={{ padding: '1rem 2rem', borderRadius: '1.25rem', background: notification.type === 'success' ? '#10b981' : (notification.type === 'error' ? '#f43f5e' : '#6366f1'), color: '#fff', fontWeight: 800, boxShadow: '0 10px 40px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '12px', border: 'none' }}>
                        <span style={{ fontSize: '1.2rem' }}>{notification.type === 'success' ? '✅' : (notification.type === 'error' ? '❌' : 'ℹ️')}</span>
                        {notification.message}
                    </div>
                </div>
            )}

            {confirmModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)', zIndex: 11500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="glass" style={{ width: '100%', maxWidth: '420px', padding: '3rem', borderRadius: '3rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(15, 23, 42, 0.95)', boxShadow: '0 50px 100px rgba(0,0,0,0.7)' }}>
                        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: confirmModal.isDanger ? 'rgba(244, 63, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 2rem', fontSize: '2.5rem' }}>
                            {confirmModal.isDanger ? '⚠️' : '🎯'}
                        </div>
                        <h3 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: '0.75rem', color: '#fff', letterSpacing: '-0.03em' }}>{confirmModal.title}</h3>
                        <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: '3rem', lineHeight: 1.6, fontSize: '1rem' }}>{confirmModal.message}</p>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button
                                onClick={() => setConfirmModal(null)}
                                style={{ flex: 1, padding: '1.1rem', borderRadius: '1.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontWeight: 800, cursor: 'pointer' }}
                            >ยกเลิก</button>
                            <button
                                onClick={confirmModal.onConfirm}
                                style={{ flex: 1, padding: '1.1rem', borderRadius: '1.25rem', background: confirmModal.isDanger ? '#f43f5e' : 'var(--primary)', border: 'none', color: '#fff', fontWeight: 900, cursor: 'pointer', boxShadow: '0 10px 20px rgba(99, 102, 241, 0.3)' }}
                            >ยืนยัน</button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes loading-bar {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideInRight { 
                    from { opacity: 0; transform: translateX(30px); } 
                    to { opacity: 1; transform: translateX(0); } 
                }
                .file-preview-card:hover {
                    transform: translateY(-5px);
                    border-color: rgba(99, 102, 241, 0.5) !important;
                }
            `}</style>
        </main>
    );
}
