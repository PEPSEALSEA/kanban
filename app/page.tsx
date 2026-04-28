'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { useData } from '@/components/DataProvider';
import AttachmentList from '@/components/AttachmentList';
import MarkdownRenderer from '@/components/MarkdownRenderer';
// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";
const ADMIN_EMAILS = ['pepsealsea@gmail.com', 'iampep2009@gmail.com', 'sealseapep@gmail.com'];

function getSubjectColor(subject: string): string {
  const colors: Record<string, string> = {
    'Math': '#6366f1',
    'Science': '#10b981',
    'History': '#f59e0b',
    'English': '#f43f5e',
    'Arts': '#ec4899',
    'Computer': '#8b5cf6',
    'Other': '#94a3b8'
  };
  return colors[subject] || colors['Other'];
}

type UserInfo = {
  email: string;
  name: string;
  picture: string;
};

type ProgressItem = {
  email: string;
  homework_id: string;
  status: string;
  image_url?: string;
};

type Homework = {
  id: string;
  subject: string;
  title: string;
  description: string;
  deadline: string;
  link_work: string;
  link_image: string;
  note: string;
  my_status?: 'pending' | 'in_progress' | 'done';
};

export default function StudyFlow() {
  const { 
    allHomework, 
    allUsers, 
    allProgress, 
    user, 
    setUser, 
    isLoading, 
    refreshData 
  } = useData();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeHomework, setActiveHomework] = useState<Homework | null>(null);
  const [shareText, setShareText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Homework>>({});
  const [previewItem, setPreviewItem] = useState<{ url: string; type: 'image' | 'pdf' | 'other'; filename: string; driveId?: string | null } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; isDanger?: boolean } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; id: string }[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({}); // email -> text
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState<'kanban' | 'calendar' | 'timeline'>('kanban');
  const [focusDate, setFocusDate] = useState(new Date());

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  // Derived state: Homework with computed status based on current user's progress
  const homeworkWithStatus = useMemo(() => {
    return allHomework.map(hw => {
      const userProgress = allProgress.find(p =>
        String(p.email).toLowerCase() === String(user?.email).toLowerCase() &&
        String(p.homework_id) === String(hw.id)
      );
      return {
        ...hw,
        my_status: (userProgress?.status || 'pending') as 'pending' | 'in_progress' | 'done',
      };
    });
  }, [allHomework, allProgress, user]);

  const memoizedHomeworkAttachments = useMemo(() => {
    if (!activeHomework) return [];
    
    const parseItem = (url: string) => {
      const parts = url.split('#');
      const decodedUrl = parts[0];
      let title = 'Document';
      let fileId: string | undefined = undefined;

      // Extract parts: url#title#fileId
      if (parts.length >= 2) title = decodeURIComponent(parts[1]);
      if (parts.length >= 3) fileId = decodeURIComponent(parts[2]);

      return {
        url: decodedUrl,
        title,
        fileId,
        type: title.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg)$/) || decodedUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)($|\?)/) ? 'link_image' as const : 'link_work' as const
      };
    };

    return [
      ...(activeHomework.link_work ? activeHomework.link_work.split(',').filter(Boolean).map(parseItem) : []),
      ...(activeHomework.link_image ? activeHomework.link_image.split(',').filter(Boolean).map(parseItem) : [])
    ];
  }, [activeHomework?.id, activeHomework?.link_work, activeHomework?.link_image]);

  const handleLoginSuccess = async (credentialResponse: any) => {
    const decoded: any = jwtDecode(credentialResponse.credential);
    const newUser = {
      email: decoded.email,
      name: decoded.name,
      picture: decoded.picture
    };
    setUser(newUser);
    localStorage.setItem('homework_user', JSON.stringify(newUser));

    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'addUser',
          email: newUser.email,
          display_name: newUser.name,
          photo_url: newUser.picture
        })
      });
      refreshData();
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    googleLogout();
    setUser(null);
    localStorage.removeItem('homework_user');
    refreshData();
  };

  const handleFileUpload = async (file: File, homeworkId: string, status: string, fileId: string): Promise<boolean> => {
    try {
      setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'uploading' } : f));

      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.readAsDataURL(file);
      });

      const base64Data = await base64Promise;

      await fetch(
        `${UPLOAD_WEB_APP_URL}?action=uploadProof&email=${encodeURIComponent(user?.email || '')}&homework_id=${encodeURIComponent(String(homeworkId))}&status=${encodeURIComponent(status)}&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        {
          method: 'POST',
          mode: 'no-cors',
          body: base64Data
        }
      );

      setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'done' } : f));
      return true;
    } catch (error) {
      console.error("Upload failed:", error);
      setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
      return false;
    }
  };

  const toggleComplete = async (e: React.MouseEvent, hwId: string, currentStatus?: string) => {
    e.stopPropagation();
    if (!user) return;
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';

    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        body: new URLSearchParams({
          action: 'updateProgress',
          email: user.email,
          homework_id: String(hwId),
          status: newStatus
        })
      });
      await refreshData();
    } catch (e) {
      console.error(e);
    }
  };

  const uploadOrReplaceProof = async (e: React.MouseEvent, hwId: string) => {
    e.stopPropagation();
    if (!user) return;

    const current = allProgress.find(p => p.email === user.email && String(p.homework_id) === String(hwId));
    const currentStatus = current?.status || 'pending';

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    const filePromise = new Promise<File | null>((resolve) => {
      input.onchange = (event: any) => {
        const file = event.target.files?.[0];
        resolve(file || null);
      };
    });

    input.click();
    const file = await filePromise;
    if (!file) return;

    const ok = await handleFileUpload(file, hwId, currentStatus, Math.random().toString(36).substr(2, 9));
    if (ok) await refreshData();
  };

  const handleDeleteHomework = async (id: string) => {
    setConfirmModal({
      title: "Confirm Deletion",
      message: "Are you sure? This will delete the homework and all associated files.",
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const hw = allHomework.find(h => String(h.id) === String(id));
          const assignmentFiles = hw?.link_image ? hw.link_image.split(',') : [];
          const activityFiles = allProgress.filter(p => String(p.homework_id) === String(id)).map(p => p.image_url).filter(Boolean);
          let allUrls = [...assignmentFiles];
          activityFiles.forEach(urlStr => { if (urlStr) allUrls.push(...urlStr.split(',')); });
          const driveIds = allUrls.map(url => extractDriveId(url.trim())).filter(Boolean) as string[];

          if (driveIds.length > 0) {
            const uniqueIds = Array.from(new Set(driveIds)).join(',');
            try {
              await fetch(`${UPLOAD_WEB_APP_URL}?action=deleteFiles&driveIds=${uniqueIds}`, { method: 'POST', mode: 'no-cors' });
            } catch (e) {}
          }

          await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: new URLSearchParams({ action: 'deleteHomework', id })
          });

          refreshData();
          setActiveHomework(null);
          setNotification({ message: "Assignment deleted successfully.", type: 'success' });
        } catch (e) {
          setNotification({ message: "Failed to delete assignment.", type: 'error' });
        }
      }
    });
  };

  const fetchComments = useCallback(async (hwId: string) => {
    try {
      const res = await fetch(`${GAS_WEB_APP_URL}?action=comments&homework_id=${hwId}`);
      const data = await res.json();
      if (data.success) setComments(data.data);
    } catch (e) { }
  }, []);

  useEffect(() => {
    if (activeHomework) {
      fetchComments(activeHomework.id);
    } else {
      setComments([]);
    }
  }, [activeHomework, fetchComments]);

  const handlePostComment = async (ownerEmail: string) => {
    const text = commentText[ownerEmail];
    if (!text || !user || !activeHomework) return;

    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          action: 'addComment',
          homework_id: String(activeHomework.id),
          owner_email: ownerEmail,
          commenter_email: user.email,
          text: text
        })
      });
      setCommentText(prev => ({ ...prev, [ownerEmail]: "" }));
      fetchComments(activeHomework.id);
    } catch (e) { }
  };
  const handleShareSubmission = async () => {
    if (!shareText || !user || !activeHomework) return;
    try {
      await fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          action: 'updateProgress',
          email: user.email,
          homework_id: String(activeHomework.id),
          status: 'done',
          image_url: shareText,
          append: 'true'
        })
      });
      setShareText("");
      refreshData();
      setNotification({ message: "Update shared successfully.", type: 'success' });
    } catch (e) {
      setNotification({ message: "Failed to share update.", type: 'error' });
    }
  };


  const handleEditHomework = async () => {
    if (!activeHomework) return;
    setConfirmModal({
      title: "Update Information",
      message: "Save changes to this assignment?",
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: new URLSearchParams({
              action: 'editHomework',
              id: activeHomework.id,
              ...editForm as any
            })
          });
          setIsEditing(false);
          refreshData();
          setActiveHomework(prev => prev ? { ...prev, ...editForm } : null);
          setNotification({ message: "Changes saved.", type: 'success' });
        } catch (e) {
          setNotification({ message: "Failed to save changes.", type: 'error' });
        }
      }
    });
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    for (const file of files) {
      const reader = new FileReader();
      const base64Promise = new Promise<string>(r => { reader.onload = () => r((reader.result as string).split(',')[1]); reader.readAsDataURL(file); });
      const base64Data = await base64Promise;
      const res = await fetch(`${UPLOAD_WEB_APP_URL}?action=upload&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type || 'application/octet-stream')}`, {
        method: 'POST',
        body: base64Data
      });
      const result = await res.json();
      if (result.success) {
        setEditForm(prev => {
          const currentLinks = prev.link_image ? prev.link_image.split(',').filter(Boolean) : [];
          return { ...prev, link_image: [...currentLinks, `${result.url}#${encodeURIComponent(file.name)}#${result.id}`].join(',') };
        });
      }
    }
    setIsUploading(false);
  };

  const extractDriveId = (url: string) => {
    if (!url || !url.includes('http')) return null;
    if (url.includes('drive.google.com/file/d/')) return url.split('/d/')[1].split('/')[0];
    if (url.includes('/d/')) return url.split('/d/')[1].split(/[/?#]/)[0];
    return null;
  };

  const getFileLabel = (url: string) => {
    const lower = url.toLowerCase();
    if (lower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'Image Resource';
    if (lower.includes('pdf')) return 'PDF Document';
    return 'Attached Document';
  };

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const categorized = { soon: [] as Homework[], week: [] as Homework[], backlog: [] as Homework[] };
    homeworkWithStatus.forEach(hw => {
      const deadline = new Date(hw.deadline);
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      // Filter: Show only "after today" onwards (diffDays >= 1)
      if (diffDays < 1) return;

      if (diffDays <= 3) categorized.soon.push(hw);
      else if (diffDays <= 7) categorized.week.push(hw);
      else categorized.backlog.push(hw);
    });
    const sortFn = (a: Homework, b: Homework) => (a.my_status === 'done' ? 1 : 0) - (b.my_status === 'done' ? 1 : 0);
    return { soon: categorized.soon.sort(sortFn), week: categorized.week.sort(sortFn), backlog: categorized.backlog.sort(sortFn) };
  }, [homeworkWithStatus]);

  const getFinishedUsers = (hwId: string) => {
    return allProgress.filter(p => String(p.homework_id) === String(hwId) && p.status === 'done').map(p => {
      const u = allUsers.find(user => String(user.email).toLowerCase() === String(p.email).toLowerCase());
      return u ? { ...u, proof: p.image_url } : null;
    }).filter(u => u !== null) as (UserInfo & { proof?: string })[];
  };

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Global Upload Overlay */}
      {uploadQueue.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', backdropFilter: 'blur(10px)', zIndex: 20000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ width: '90%', maxWidth: '400px', padding: '2rem', borderRadius: '2rem', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '1rem' }}>Uploading Proof...</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {uploadQueue.map(f => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '10px' }}>
                  <span>{f.name}</span>
                  <span>{f.status === 'uploading' ? '⌛' : (f.status === 'done' ? '✅' : '❌')}</span>
                </div>
              ))}
            </div>
            {uploadQueue.every(f => f.status !== 'uploading') && <button onClick={() => setUploadQueue([])} className="glass" style={{ marginTop: '1.5rem', padding: '0.8rem 2rem', borderRadius: '1rem', border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}>Close</button>}
          </div>
        </div>
      )}

      <header style={{ padding: '1rem 2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(15, 23, 42, 0.8)', position: 'sticky', top: 0, backdropFilter: 'blur(10px)', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎓</span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, background: 'linear-gradient(to right, #818cf8, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>StudyFlow</h1>
        </div>
        {!user ? (
          <GoogleLogin onSuccess={handleLoginSuccess} onError={() => {}} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src={user.picture} style={{ width: '32px', height: '32px', borderRadius: '50%' }} alt="" />
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.8rem' }}>Logout</button>
          </div>
        )}
      </header>

      {/* View Switcher Controls */}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.5rem', marginBottom: '1rem', padding: '0 1rem' }}>
        <div className="glass" style={{ display: 'flex', padding: '4px', borderRadius: '14px', gap: '4px' }}>
          {(['kanban', 'calendar', 'timeline'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`view-switcher-btn ${viewMode === mode ? 'active' : ''}`}
            >
              {mode === 'kanban' && '📋'}
              {mode === 'calendar' && '📅'}
              {mode === 'timeline' && '⏳'}
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar/Timeline Navigation Controls */}
      {(viewMode === 'calendar' || viewMode === 'timeline') && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem' }}>
          <button 
            onClick={() => {
              const d = new Date(focusDate);
              if (viewMode === 'calendar') d.setMonth(d.getMonth() - 1);
              else d.setDate(d.getDate() - 7);
              setFocusDate(d);
            }}
            className="glass"
            style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer' }}
          >←</button>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, minWidth: '180px', textAlign: 'center' }}>
            {viewMode === 'calendar' 
              ? focusDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
              : `Week of ${new Date(focusDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
            }
          </h2>
          <button 
            onClick={() => {
              const d = new Date(focusDate);
              if (viewMode === 'calendar') d.setMonth(d.getMonth() + 1);
              else d.setDate(d.getDate() + 7);
              setFocusDate(d);
            }}
            className="glass"
            style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', color: '#fff', cursor: 'pointer' }}
          >→</button>
          <button 
            onClick={() => setFocusDate(new Date())}
            className="glass"
            style={{ padding: '0.5rem 1rem', borderRadius: '1rem', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
          >Today</button>
        </div>
      )}

      {/* Board Views Content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {viewMode === 'kanban' && (
          <div className="kanban-container" style={{ padding: isMobile ? '1rem' : '1rem 2.5rem 2.5rem', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '2rem', overflowX: 'auto' }}>
            {[
              { key: 'soon', title: '🔥 3 วันก่อนส่ง', items: columns.soon, color: '#f43f5e' },
              { key: 'week', title: '📅 7 วันก่อนส่ง', items: columns.week, color: '#f59e0b' },
              { key: 'backlog', title: '🐚 งานดองเค็ม', items: columns.backlog, color: '#6366f1' }
            ].map(col => (
              <div key={col.key} className="column glass" style={{ minWidth: isMobile ? '100%' : '360px', borderTop: `4px solid ${col.color}`, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{col.title}</h3>
                  <span className="badge">{col.items.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {col.items.map(hw => {
                    const isDone = hw.my_status === 'done';
                    return (
                      <div key={hw.id} className="card glass" onClick={() => setActiveHomework(hw)} style={{ opacity: isDone ? 0.5 : 1, borderLeft: `6px solid ${isDone ? '#10b981' : getSubjectColor(hw.subject)}`, padding: '1.25rem', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: getSubjectColor(hw.subject), textTransform: 'uppercase' }}>{hw.subject}</span>
                            <h4 style={{ margin: '4px 0', textDecoration: isDone ? 'line-through' : 'none' }}>{hw.title}</h4>
                          </div>
                          {user && (
                            <div onClick={(e) => { e.stopPropagation(); toggleComplete(e, hw.id, hw.my_status); }} style={{ width: '24px', height: '24px', borderRadius: '4px', border: '2px solid var(--primary)', background: isDone ? 'var(--primary)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isDone && <span style={{ color: '#fff', fontWeight: 900 }}>✓</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === 'calendar' && (
          <div style={{ padding: '0 2.5rem 2.5rem' }}>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(7, 1fr)', 
              gap: '1px', 
              background: 'var(--card-border)', 
              borderRadius: '1.5rem', 
              overflow: 'hidden',
              border: '1px solid var(--card-border)'
            }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d} style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>{d}</div>
              ))}
              {(() => {
                const year = focusDate.getFullYear();
                const month = focusDate.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const totalDays = new Date(year, month + 1, 0).getDate();
                const cells = [];
                const prevMonthDays = new Date(year, month, 0).getDate();
                
                for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, month: month - 1, year, current: false });
                for (let i = 1; i <= totalDays; i++) cells.push({ day: i, month, year, current: true });
                while (cells.length < 42) cells.push({ day: cells.length - totalDays - firstDay + 1, month: month + 1, year, current: false });
                
                return cells.map((d, i) => {
                  const isToday = new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
                  const dayTasks = homeworkWithStatus.filter(hw => {
                    const hwDate = new Date(hw.deadline);
                    return hwDate.getDate() === d.day && hwDate.getMonth() === d.month && hwDate.getFullYear() === d.year;
                  });
                  
                  return (
                    <div 
                      key={i} 
                      className={`calendar-day ${!d.current ? 'not-current' : ''} ${isToday ? 'today' : ''}`}
                      style={{ 
                        opacity: d.current ? 1 : 0.4,
                        display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto'
                      }}
                    >
                      <span style={{ fontSize: '0.85rem', fontWeight: d.current ? 700 : 400 }}>{d.day}</span>
                      {dayTasks.map(task => (
                        <div 
                          key={task.id} 
                          onClick={() => setActiveHomework(task)}
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: `${getSubjectColor(task.subject)}30`, 
                            color: getSubjectColor(task.subject), 
                            borderLeft: `2px solid ${getSubjectColor(task.subject)}`,
                            whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', cursor: 'pointer',
                            textDecoration: task.my_status === 'done' ? 'line-through' : 'none'
                          }}>
                          {task.title}
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {viewMode === 'timeline' && (
          <div style={{ padding: '0 1rem 2.5rem' }}>
            <div className="timeline-v-container">
              {Array.from({ length: 30 }).map((_, i) => {
                const d = new Date(focusDate);
                d.setDate(d.getDate() + i); // Start from focusDate (Today by default)
                const isToday = new Date().toDateString() === d.toDateString();
                
                // Filter and sort tasks for this day
                const dayTasks = homeworkWithStatus
                  .filter(hw => {
                    const hwDate = new Date(hw.deadline);
                    return hwDate.getDate() === d.getDate() && 
                           hwDate.getMonth() === d.getMonth() && 
                           hwDate.getFullYear() === d.getFullYear();
                  })
                  .sort((a, b) => {
                    if (a.my_status === 'done' && b.my_status !== 'done') return 1;
                    if (a.my_status !== 'done' && b.my_status === 'done') return -1;
                    return 0;
                  });

                // Only render days that have tasks to keep the timeline concise, 
                // OR render all days if we want a continuous line. 
                // Given the sketch has a line, let's render all but emphasize those with tasks.
                
                return (
                  <div key={i} className="timeline-v-item">
                    <div className="timeline-v-left">
                      <div className="timeline-v-date">
                        <div className="timeline-v-date-day" style={{ color: isToday ? 'var(--primary)' : 'inherit' }}>
                          {d.getDate()}
                        </div>
                        <div className="timeline-v-date-month">
                          {d.toLocaleDateString('th-TH', { month: 'short' })}
                        </div>
                      </div>
                      <div className="timeline-v-path">
                        <div className={`timeline-v-dot ${isToday ? 'active' : ''}`} style={{ background: isToday ? 'var(--primary)' : 'rgba(255,255,255,0.2)', boxShadow: isToday ? '0 0 15px var(--primary)' : 'none' }} />
                      </div>
                    </div>

                    <div className="timeline-v-right">
                      {dayTasks.length > 0 ? (
                        <div className="timeline-v-cards">
                          {dayTasks.map(task => {
                            const isDone = task.my_status === 'done';
                            return (
                              <div 
                                key={task.id} 
                                onClick={() => setActiveHomework(task)}
                                className={`timeline-card-v ${isDone ? 'done' : ''}`}
                                style={{ 
                                  borderLeft: `6px solid ${isDone ? '#10b981' : getSubjectColor(task.subject)}`,
                                }}
                              >
                                <div className="timeline-card-v-subject" style={{ color: getSubjectColor(task.subject) }}>
                                  {task.subject}
                                </div>
                                <div className="timeline-card-v-title" style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
                                  {task.title}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8rem', fontStyle: 'italic', padding: '10px 0' }}>
                          No tasks due
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Homework Detail Modal */}
      {activeHomework && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setActiveHomework(null)}>
          <div className="glass" style={{ width: '90%', maxWidth: '900px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '2rem', padding: '2.5rem' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '2rem', fontWeight: 900 }}>{activeHomework.title}</h2>
                <div style={{ display: 'flex', gap: '1rem', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                  <span>📅 {new Date(activeHomework.deadline).toLocaleDateString('th-TH')}</span>
                  <span>📁 {activeHomework.subject}</span>
                </div>
              </div>
              <button onClick={() => setActiveHomework(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '2rem' }}>
              <div>
                <h3 style={{ marginBottom: '1rem' }}>Instructions</h3>
                <div style={{ marginBottom: '1.5rem' }}>
                  <AttachmentList 
                    contentId={activeHomework.id}
                    contentType="homework"
                    attachments={memoizedHomeworkAttachments} 
                  />
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1.5rem', borderRadius: '1.5rem', lineHeight: 1.6 }}>
                  <MarkdownRenderer content={activeHomework.description || ''} />
                </div>
              </div>

              <div>
                <h3 style={{ marginBottom: '1rem' }}>Submissions</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                   {user && (
                    <div className="glass" style={{ padding: '1rem', borderRadius: '1rem' }}>
                      <textarea placeholder="Say something about your work..." value={shareText} onChange={e => setShareText(e.target.value)} style={{ width: '100%', background: 'none', border: 'none', color: '#fff', resize: 'none', outline: 'none' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
                        <button onClick={(e) => uploadOrReplaceProof(e, activeHomework.id)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>🖼️ Upload</button>
                        <button onClick={() => handleShareSubmission()} style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer' }}>Post</button>
                      </div>
                    </div>
                   )}
                   {getFinishedUsers(activeHomework.id).map((student, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '1rem' }}>
                      <img src={student.picture} style={{ width: '32px', height: '32px', borderRadius: '8px' }} alt="" />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{student.name}</span>
                          <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>DONE</span>
                        </div>
                        {student.proof && <div style={{ marginTop: '5px' }}>{student.proof.split(',').map((url, idx) => (url.startsWith('http') ? <img key={idx} src={url} style={{ width: '100%', borderRadius: '4px', marginTop: '4px' }} alt="" /> : <p key={idx} style={{ fontSize: '0.8rem' }}>{url}</p>))}</div>}
                      </div>
                    </div>
                   ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {notification && <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', background: '#10b981', color: '#fff', padding: '1rem 2rem', borderRadius: '1rem', zIndex: 20000 }}>{notification.message}</div>}
      
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ padding: '2rem', borderRadius: '2rem', textAlign: 'center', maxWidth: '400px' }}>
            <h3>{confirmModal.title}</h3>
            <p style={{ margin: '1rem 0' }}>{confirmModal.message}</p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setConfirmModal(null)} className="glass" style={{ flex: 1, padding: '0.8rem', borderRadius: '1rem' }}>Cancel</button>
              <button onClick={confirmModal.onConfirm} style={{ flex: 1, padding: '0.8rem', borderRadius: '1rem', background: confirmModal.isDanger ? '#f43f5e' : 'var(--primary)', color: '#fff' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .loader { width: 24px; height: 24px; border: 3px solid rgba(255,255,255,0.1); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
      `}</style>
    </main>
  );
}
