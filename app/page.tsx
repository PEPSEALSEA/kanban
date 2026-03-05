'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";
const ADMIN_EMAILS = ['pepsealsea@gmail.com', 'iampep2009@gmail.com'];

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
  const [user, setUser] = useState<UserInfo | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('homework_user');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });
  const [allHomework, setAllHomework] = useState<Homework[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [allProgress, setAllProgress] = useState<ProgressItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [activeHomework, setActiveHomework] = useState<Homework | null>(null);
  const [shareText, setShareText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Homework>>({});
  const [previewItem, setPreviewItem] = useState<{ url: string; type: 'image' | 'pdf' | 'other'; filename: string; driveId?: string | null } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; isDanger?: boolean } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; id: string }[]>([]);
  const [viewMode, setViewMode] = useState<'kanban' | 'calendar' | 'timeline'>('kanban');
  const [currentDate, setCurrentDate] = useState(new Date()); // For Calendar month navigation
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState<{ [key: string]: string }>({}); // email -> text
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setLoadingAction("Synchronizing with Cloud...");
    try {
      const [hwRes, usersRes, progressRes] = await Promise.all([
        fetch(`${GAS_WEB_APP_URL}?action=list`).then(r => r.json()),
        fetch(`${GAS_WEB_APP_URL}?action=users`).then(r => r.json()),
        fetch(`${GAS_WEB_APP_URL}?action=allProgress`).then(r => r.json())
      ]);

      if (hwRes.success) setAllHomework(hwRes.data);
      if (usersRes.success) setAllUsers(usersRes.data);
      if (progressRes.success) setAllProgress(progressRes.data);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
      setLoadingAction(null);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        // If progress entry has an image URL but the main hw doesn't, we can link it here if needed
      };
    });
  }, [allHomework, allProgress, user]);

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
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleLogout = () => {
    googleLogout();
    setUser(null);
    localStorage.removeItem('homework_user');
    setAllHomework([]);
    fetchData();
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

    setAllHomework(prev => prev.map(hw =>
      String(hw.id) === String(hwId) ? { ...hw, my_status: newStatus as any } : hw
    ));

    setAllProgress(prev => {
      const filtered = prev.filter(p => !(p.email === user.email && String(p.homework_id) === String(hwId)));
      if (newStatus === 'done') {
        return [...filtered, { email: user.email, homework_id: String(hwId), status: 'done' }];
      }
      return filtered;
    });

    setLoadingAction("Updating Status...");
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
      // Refresh data to get latest from server
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
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
    if (ok) await fetchData();
  };

  const handleDeleteHomework = async (id: string) => {
    setConfirmModal({
      title: "Confirm Deletion",
      message: "Are you sure? This will delete the homework and all associated files from Google Drive and student activity feed.",
      isDanger: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setLoadingAction("Deleting Homework & Files...");
        try {
          // 1. Collect all associated file Drive IDs (Assignment Media + Activity Feed)
          const hw = allHomework.find(h => String(h.id) === String(id));
          const assignmentFiles = hw?.link_image ? hw.link_image.split(',') : [];
          const activityFiles = allProgress
            .filter(p => String(p.homework_id) === String(id))
            .map(p => p.image_url)
            .filter(Boolean);

          let allUrls: string[] = [...assignmentFiles];
          activityFiles.forEach(urlStr => {
            if (urlStr) allUrls.push(...urlStr.split(','));
          });

          const driveIds = allUrls
            .map(url => extractDriveId(url.trim()))
            .filter(Boolean) as string[];

          // 2. Delete from Google Drive if any files exist
          if (driveIds.length > 0) {
            const uniqueIds = Array.from(new Set(driveIds)).join(',');
            try {
              await fetch(`${UPLOAD_WEB_APP_URL}?action=deleteFiles&driveIds=${uniqueIds}`, {
                method: 'POST',
                mode: 'no-cors'
              });
            } catch (e) {
              console.error("Drive file deletion error (non-critical):", e);
            }
          }

          // 3. Delete homework record from Spreadsheet
          await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: new URLSearchParams({ action: 'deleteHomework', id })
          });

          fetchData();
          setActiveHomework(null);
          setNotification({ message: "Assignment deleted successfully.", type: 'success' });
        } catch (e) {
          console.error("Delete operation failed:", e);
          setNotification({ message: "Failed to delete assignment.", type: 'error' });
        } finally {
          setLoadingAction(null);
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

    setLoadingAction("Sending Comment...");
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
      setNotification({ message: "Comment posted!", type: 'success' });
    } catch (e) {
      setNotification({ message: "Failed to post comment.", type: 'error' });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleEditHomework = async () => {
    if (!activeHomework) return;
    setConfirmModal({
      title: "Update Information",
      message: "Are you sure you want to save these changes to the assignment?",
      onConfirm: async () => {
        setConfirmModal(null);
        setLoadingAction("Saving Changes...");
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
          fetchData();
          // Update local modal data
          setActiveHomework(prev => prev ? { ...prev, ...editForm } : null);
          setNotification({ message: "Changes saved successfully.", type: 'success' });
        } catch (e) {
          console.error(e);
          setNotification({ message: "Failed to save changes.", type: 'error' });
        } finally {
          setLoadingAction(null);
        }
      }
    });
  };

  const handleEditFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          setEditForm(prev => {
            const currentLinks = prev.link_image ? prev.link_image.split(',').filter(Boolean) : [];
            const newLink = `${result.url}#${encodeURIComponent(file.name)}`;
            return { ...prev, link_image: [...currentLinks, newLink].join(',') };
          });
          setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'done' } : f));
        } else {
          setUploadQueue(prev => prev.map(f => f.id === fileId ? { ...f, status: 'error' } : f));
        }
      }
    } catch (error) {
      console.error("Upload failed:", error);
      setNotification({ message: "Failed to upload files.", type: 'error' });
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const removeInstructionFile = (idx: number) => {
    setEditForm(prev => {
      const currentLinks = prev.link_image ? prev.link_image.split(',').filter(Boolean) : [];
      const updatedLinks = currentLinks.filter((_, i) => i !== idx);
      return { ...prev, link_image: updatedLinks.join(',') };
    });
  };

  const removeExternalLink = (idx: number) => {
    setEditForm(prev => {
      const currentLinks = prev.link_work ? prev.link_work.split(',').filter(Boolean) : [];
      const updatedLinks = currentLinks.filter((_, i) => i !== idx);
      return { ...prev, link_work: updatedLinks.join(',') };
    });
  };

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
    if (lower.includes('googleusercontent.com') || lower.match(/\.(jpg|jpeg|png|gif|webp|svg)$|^data:image/i)) return 'Image Resource';
    if (lower.includes('.pdf') || lower.includes('pdf')) return 'PDF Document';
    if (lower.includes('.doc') || lower.includes('msword')) return 'Word Document';
    if (lower.includes('.xls') || lower.includes('excel')) return 'Excel Spreadsheet';
    return 'Attached Document';
  };

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const categorized = { soon: [] as Homework[], week: [] as Homework[], backlog: [] as Homework[] };
    homeworkWithStatus.forEach(hw => {
      const deadline = new Date(hw.deadline);
      const diffTime = deadline.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 3) categorized.soon.push(hw);
      else if (diffDays <= 7) categorized.week.push(hw);
      else categorized.backlog.push(hw);
    });

    const sortFn = (a: Homework, b: Homework) => {
      if (a.my_status === 'done' && b.my_status !== 'done') return 1;
      if (a.my_status !== 'done' && b.my_status === 'done') return -1;
      return 0;
    };

    return {
      soon: categorized.soon.sort(sortFn),
      week: categorized.week.sort(sortFn),
      backlog: categorized.backlog.sort(sortFn)
    };
  }, [homeworkWithStatus]);

  const getFinishedUsers = (hwId: string) => {
    const finishedWithProgress = allProgress
      .filter(p => String(p.homework_id) === String(hwId) && p.status === 'done');

    return finishedWithProgress.map(p => {
      const u = allUsers.find(user => String(user.email).toLowerCase() === String(p.email).toLowerCase());
      return u ? { ...u, proof: p.image_url } : null;
    }).filter(u => u !== null) as (UserInfo & { proof?: string })[];
  };

  const isAdmin = user && ADMIN_EMAILS.includes(user.email.toLowerCase());

  // --- CALENDAR HELPERS ---
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const days = [];
    // Previous month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, month: month - 1, year, isCurrentMonth: false });
    }
    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({ day: i, month, year, isCurrentMonth: true });
    }
    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({ day: i, month: month + 1, year, isCurrentMonth: false });
    }
    return days;
  };

  const isSameDay = (d1: Date, d2Str: string) => {
    const d2 = new Date(d2Str);
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Global Loading Overlay (for critical actions) */}
      {(loadingAction || uploadQueue.length > 0) && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          zIndex: 20000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem'
        }}>
          {uploadQueue.length > 0 ? (
            <div className="glass" style={{ width: '100%', maxWidth: '450px', padding: '2.5rem', borderRadius: '2.5rem', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚀</div>
                <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '0.5rem' }}>Uploading Files</h3>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>Please wait while we sync your work...</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
                {uploadQueue.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '12px 15px', background: 'rgba(255,255,255,0.03)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                    {f.status === 'uploading' ? (
                      <div className="loader" style={{ width: '18px', height: '18px', border: '2px solid rgba(99, 102, 241, 0.2)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                    ) : f.status === 'done' ? (
                      <span style={{ fontSize: '1.2rem', color: '#10b981' }}>✅</span>
                    ) : (
                      <span style={{ fontSize: '1.2rem', color: '#f43f5e' }}>❌</span>
                    )}
                    <span style={{ flex: 1, fontSize: '0.9rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: f.status === 'done' ? 0.5 : 1 }}>{f.name}</span>
                    {f.status === 'done' && <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 8px', borderRadius: '6px' }}>FINISHED</span>}
                  </div>
                ))}
              </div>

              {uploadQueue.every(f => f.status !== 'uploading') && (
                <button
                  onClick={() => { setUploadQueue([]); setIsUploading(false); }}
                  style={{ width: '100%', marginTop: '2rem', padding: '1.1rem', borderRadius: '1.25rem', background: 'var(--primary)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 10px 30px rgba(99, 102, 241, 0.2)' }}
                >Done</button>
              )}
            </div>
          ) : (
            <>
              <div className="loader" style={{
                width: '64px',
                height: '64px',
                border: '5px solid rgba(99, 102, 241, 0.2)',
                borderTop: '5px solid var(--primary)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <div style={{
                color: '#fff',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                background: 'linear-gradient(to right, #818cf8, #f43f5e)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textAlign: 'center'
              }}>
                {loadingAction}
              </div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', fontWeight: 500 }}>Please wait while we handle the cloud transfer.</p>
            </>
          )}
        </div>
      )}

      {/* Top-Right Sync Pill (non-blocking) */}
      {loadingAction === "Synchronizing with Cloud..." && (
        <div style={{
          position: 'fixed',
          top: '1.5rem',
          right: '1.5rem',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0.75rem 1.25rem',
          background: 'rgba(30, 41, 59, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: '1rem',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          animation: 'slideInRight 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
        }}>
          <div className="loader" style={{
            width: '18px',
            height: '18px',
            border: '2px solid rgba(129, 140, 248, 0.2)',
            borderTop: '2px solid #818cf8',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }}></div>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>Syncing...</span>
        </div>
      )}

      <header style={{
        padding: isMobile ? '0.75rem 1rem' : '1rem 2.5rem',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '1rem' : '2.5rem',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        position: 'sticky',
        top: 0,
        backdropFilter: 'blur(10px)',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontSize: isMobile ? '1.4rem' : '1.75rem', animation: 'bounce 2s infinite' }}>🎓</div>
            <h1 style={{ fontSize: isMobile ? '1.2rem' : '1.6rem', fontWeight: 900, background: 'linear-gradient(to right, #818cf8, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>การบ้าน 603</h1>
          </div>

          {!user ? (
            <div className="login-trigger">
              <GoogleLogin
                onSuccess={handleLoginSuccess}
                onError={() => console.log('Login Failed')}
                theme="filled_blue" shape="pill" size={isMobile ? "small" : "medium"} text="signin_with"
              />
            </div>
          ) : (
            <div className="glass" style={{ padding: '0.3rem 0.6rem', borderRadius: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img src={user.picture} style={{ width: isMobile ? '24px' : '32px', height: isMobile ? '24px' : '32px', borderRadius: '50%', border: '2px solid var(--primary)' }} alt="user" />
              {!isMobile && (
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{user.name}</div>
                  <button onClick={handleLogout} style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>Logout</button>
                </div>
              )}
              {isMobile && <button onClick={handleLogout} style={{ fontSize: '0.65rem', color: 'var(--accent)', background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer' }}>Exit</button>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: isMobile ? 'center' : 'flex-end', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {isAdmin && <Link href="/admin" className="glass" style={{ padding: '0.4rem 0.8rem', borderRadius: '0.75rem', background: 'rgba(244, 63, 94, 0.15)', color: '#f43f5e', fontSize: '0.7rem', fontWeight: 700, border: '1px solid rgba(244, 63, 94, 0.3)', transition: '0.2s' }}>Console</Link>}
          <div className="glass" style={{ display: 'flex', gap: '2px', padding: '3px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
            {(['kanban', 'calendar', 'timeline'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: isMobile ? '6px 10px' : '8px 16px',
                  borderRadius: '9px',
                  border: 'none',
                  fontSize: isMobile ? '0.65rem' : '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: viewMode === mode ? 'var(--primary)' : 'transparent',
                  color: viewMode === mode ? '#fff' : 'rgba(255,255,255,0.4)',
                  transition: '0.3s cubic-bezier(0.19, 1, 0.22, 1)',
                  textTransform: 'capitalize'
                }}
              >
                {mode === 'kanban' ? '📋 Board' : mode === 'calendar' ? '🗓️ Calendar' : '⏳ Timeline'}
              </button>
            ))}
          </div>
          {!isMobile && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }}></span> Live Cloud
            </div>
          )}
        </div>
      </header>

      {/* Premium Homework Detail Modal */}
      {activeHomework && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(15px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0' : '1rem' }}
          onClick={() => { setActiveHomework(null); setIsEditing(false); }}
        >
          <div className="glass" style={{
            width: '100%',
            maxWidth: isMobile ? '100vw' : '1100px',
            height: isMobile ? '100vh' : 'auto',
            maxHeight: isMobile ? '100vh' : '94vh',
            overflow: 'hidden',
            borderRadius: isMobile ? '0' : '2.5rem',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            border: isMobile ? 'none' : '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 50px 100px rgba(0,0,0,0.8)',
            animation: isMobile ? 'fadeIn 0.3s ease-out' : 'slideInRight 0.4s cubic-bezier(0.19, 1, 0.22, 1)'
          }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Dynamic Modal Header */}
            <div style={{ padding: isMobile ? '1.5rem' : '2.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', background: `linear-gradient(135deg, ${getSubjectColor(activeHomework.subject)}15 0%, rgba(0,0,0,0) 100%)`, position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'flex-start', gap: isMobile ? '1rem' : '2rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: isMobile ? '0.5rem' : '1rem' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '8px', background: `${getSubjectColor(activeHomework.subject)}25`, color: getSubjectColor(activeHomework.subject), fontSize: '0.65rem', fontWeight: 800, border: `1px solid ${getSubjectColor(activeHomework.subject)}40`, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {activeHomework.subject}
                    </span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: isMobile ? '0.7rem' : '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      🗓️ <b style={{ color: '#fff' }}>{new Date(activeHomework.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}</b>
                    </span>
                  </div>
                  {isEditing ? (
                    <input
                      className="glass"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: isMobile ? '1.2rem' : '1.8rem', fontWeight: 800, padding: '0.5rem 1rem', borderRadius: '1rem', width: '100%', outline: 'none' }}
                      value={editForm.title}
                      onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="Homework Title"
                    />
                  ) : (
                    <h2 style={{ fontSize: isMobile ? '1.5rem' : '2.2rem', fontWeight: 900, margin: 0, lineHeight: 1.1, color: '#fff', letterSpacing: '-0.02em' }}>{activeHomework.title}</h2>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px', borderRadius: '1rem' }}>
                      {!isEditing ? (
                        <button
                          onClick={() => {
                            setIsEditing(true);
                            setEditForm({ ...activeHomework, link_work: activeHomework.link_work || "", link_image: activeHomework.link_image || "" });
                          }}
                          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: 'rgba(255,255,255,0.7)', padding: '0.4rem 0.8rem', borderRadius: '0.75rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer', transition: '0.2s' }}
                        >Edit</button>
                      ) : (
                        <button
                          onClick={handleEditHomework}
                          style={{ background: 'var(--primary)', border: 'none', color: '#fff', padding: '0.4rem 0.8rem', borderRadius: '0.75rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                        >Save</button>
                      )}
                      <button
                        onClick={() => handleDeleteHomework(activeHomework.id)}
                        style={{ background: 'rgba(244, 63, 94, 0.1)', border: 'none', color: '#f43f5e', padding: '0.4rem 0.8rem', borderRadius: '0.75rem', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                      >Del</button>
                    </div>
                  )}
                  <button
                    onClick={() => { setActiveHomework(null); setIsEditing(false); }}
                    style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: isMobile ? '36px' : '48px', height: isMobile ? '36px' : '48px', borderRadius: '1rem', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
                  >✕</button>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.4fr) 1fr', flex: 1, overflowY: isMobile ? 'auto' : 'hidden' }}>
              {/* Left Side: Body & Content */}
              <div style={{ overflowY: isMobile ? 'visible' : 'auto', padding: isMobile ? '1.5rem' : '2.5rem', borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.06)', borderBottom: isMobile ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <h3 style={{ fontSize: isMobile ? '1rem' : '1.1rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255,255,255,0.9)' }}>
                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px' }}>📝</span> Instructions
                </h3>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: isMobile ? '1rem' : '1.5rem', borderRadius: '1.5rem', border: '1px solid rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', lineHeight: 1.8, marginBottom: '2rem', whiteSpace: 'pre-wrap', fontSize: isMobile ? '0.85rem' : '1rem' }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      <textarea
                        className="glass"
                        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '1.25rem', borderRadius: '1rem', width: '100%', minHeight: '180px', outline: 'none', fontSize: '0.95rem' }}
                        value={editForm.description}
                        onChange={e => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Detailed instructions..."
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Google Drive Content (Files)</label>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                            {editForm.link_image?.split(',').filter(s => s && s.trim()).map((item, idx) => {
                              const trimmedItem = item.trim();
                              const [rawUrl, hashName] = trimmedItem.split('#');
                              const realFilename = hashName ? decodeURIComponent(hashName) : getFileLabel(trimmedItem);
                              const isImage = rawUrl.includes('googleusercontent.com') || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i);

                              return (
                                <div key={idx} className="glass" style={{ borderRadius: '1rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', position: 'relative' }}>
                                  <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                                    {isImage ? (
                                      <img src={rawUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                                    ) : (
                                      <span style={{ fontSize: '1.5rem' }}>{rawUrl.toLowerCase().includes('pdf') ? '📕' : '📄'}</span>
                                    )}
                                  </div>
                                  <div style={{ padding: '6px', fontSize: '0.6rem', fontWeight: 700, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {realFilename}
                                  </div>
                                  <button
                                    onClick={() => removeInstructionFile(idx)}
                                    style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(244, 63, 94, 0.9)', border: 'none', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                  >✕</button>
                                </div>
                              );
                            })}
                            <label className="glass" style={{ border: '2px dashed rgba(255,255,255,0.1)', borderRadius: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '110px', cursor: 'pointer', transition: '0.2s', background: 'rgba(255,255,255,0.01)' }}>
                              <span style={{ fontSize: '1.5rem', marginBottom: '4px' }}>➕</span>
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)' }}>Add File</span>
                              <input type="file" multiple hidden onChange={handleEditFileUpload} />
                            </label>
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: '8px', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>External Links (URLs)</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
                            {editForm.link_work?.split(',').filter(s => s && s.trim()).map((link, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={{ flex: 1, fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 {link.trim()}</span>
                                <button
                                  onClick={() => removeExternalLink(idx)}
                                  style={{ background: 'none', border: 'none', color: '#f43f5e', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >Remove</button>
                              </div>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              id="new-external-link"
                              className="glass"
                              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '0.75rem', borderRadius: '0.75rem', outline: 'none', fontSize: '0.85rem' }}
                              placeholder="https://..."
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const target = e.target as HTMLInputElement;
                                  if (target.value) {
                                    setEditForm(prev => {
                                      const current = prev.link_work ? prev.link_work.split(',').filter(Boolean) : [];
                                      return { ...prev, link_work: [...current, target.value].join(',') };
                                    });
                                    target.value = '';
                                  }
                                }
                              }}
                            />
                            <button
                              onClick={() => {
                                const input = document.getElementById('new-external-link') as HTMLInputElement;
                                if (input && input.value) {
                                  setEditForm(prev => {
                                    const current = prev.link_work ? prev.link_work.split(',').filter(Boolean) : [];
                                    return { ...prev, link_work: [...current, input.value].join(',') };
                                  });
                                  input.value = '';
                                }
                              }}
                              style={{ padding: '0 1rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                            >Add Link</button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ marginBottom: (activeHomework.link_image || activeHomework.link_work) ? '2rem' : '0', fontSize: '1rem' }}>
                        {activeHomework.description || <i style={{ opacity: 0.5 }}>No instructions provided.</i>}
                      </div>

                      {activeHomework.link_image && (
                        <div style={{ marginBottom: '2rem' }}>
                          <h4 style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Media</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '1rem' }}>
                            {activeHomework.link_image.split(',').filter(Boolean).map((item, idx) => {
                              const trimmedItem = item.trim();
                              const [rawUrl, hashName] = trimmedItem.split('#');
                              const realFilename = hashName ? decodeURIComponent(hashName) : getFileLabel(trimmedItem);
                              const isImage = rawUrl.includes('googleusercontent.com') || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i);
                              const isPdf = rawUrl.toLowerCase().includes('pdf') || realFilename.toLowerCase().endsWith('.pdf');
                              const driveId = extractDriveId(rawUrl);

                              return (
                                <div
                                  key={idx}
                                  className="glass"
                                  style={{ borderRadius: '1rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: '0.3s' }}
                                  onClick={() => setPreviewItem({ url: rawUrl, type: isImage ? 'image' : (isPdf ? 'pdf' : 'other'), filename: realFilename, driveId })}
                                >
                                  {isImage ? (
                                    <img src={rawUrl} style={{ width: '100%', height: '90px', objectFit: 'cover' }} alt={realFilename} />
                                  ) : (
                                    <div style={{ height: '90px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '1.5rem' }}>{isPdf ? '📕' : '📄'}</span>
                                      <span style={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                        {realFilename}
                                      </span>
                                    </div>
                                  )}
                                  <div style={{ padding: '0.4rem', background: 'rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                    <span style={{ fontSize: '0.55rem', fontWeight: 800, opacity: 0.6, letterSpacing: '0.5px' }}>PREVIEW</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {!isEditing && activeHomework.link_work && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                          {activeHomework.link_work.split(',').filter(Boolean).map((link, idx) => (
                            <a
                              key={idx}
                              href={link.trim()}
                              target="_blank"
                              rel="noreferrer"
                              className="glass"
                              style={{ padding: '10px 18px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: 700, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' }}
                            >
                              🔗 Link {idx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'rgba(0,0,0,0.15)',
                overflow: isMobile ? 'visible' : 'hidden',
                height: isMobile ? 'auto' : '100%'
              }}>
                <div style={{ padding: '2rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem' }}>
                    {user && (
                      <button
                        onClick={async (e) => {
                          await toggleComplete(e, activeHomework.id, activeHomework.my_status);
                          const nextStatus = activeHomework.my_status === 'done' ? 'pending' : 'done';
                          setActiveHomework(prev => prev ? { ...prev, my_status: nextStatus as any } : null);
                        }}
                        style={{
                          flex: 1, padding: '1.1rem', borderRadius: '1.25rem', background: activeHomework.my_status === 'done' ? '#10b981' : 'var(--primary)',
                          border: 'none', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', transition: '0.3s', boxShadow: activeHomework.my_status === 'done' ? '0 10px 25px rgba(16, 185, 129, 0.3)' : '0 10px 25px rgba(99, 102, 241, 0.3)'
                        }}
                      >
                        {activeHomework.my_status === 'done' ? '✓ Assignment Completed' : '🚀 Mark as Finished'}
                      </button>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255,255,255,0.6)' }}>Activity Feed</h3>
                    <div style={{ padding: '4px 10px', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', fontSize: '0.7rem', fontWeight: 700 }}>
                      {getFinishedUsers(activeHomework.id).length} Submissions
                    </div>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
                  {/* Modern Share Input Box */}
                  <div className="glass" style={{ padding: '1.25rem', borderRadius: '1.5rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: '2rem' }}>
                    <textarea
                      placeholder="Discuss or share your work progress..."
                      style={{ width: '100%', background: 'none', border: 'none', color: '#fff', outline: 'none', resize: 'none', marginBottom: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}
                      rows={2}
                      value={shareText}
                      onChange={(e) => setShareText(e.target.value)}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[
                          { icon: '🖼️', type: 'image/*', label: 'Image' },
                          { icon: '📎', type: '*', label: 'File' }
                        ].map(btn => (
                          <label key={btn.label} className="glass" style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '0.75rem', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '6px', transition: '0.2s', fontWeight: 600 }}>
                            {btn.icon} {btn.label}
                            <input type="file" multiple hidden accept={btn.type} onChange={async (e) => {
                              const files = Array.from(e.target.files || []);
                              if (files.length > 0 && user && activeHomework) {
                                const newQueueItems = files.map(f => ({ name: f.name, status: 'uploading' as const, id: Math.random().toString(36).substr(2, 9) }));
                                setUploadQueue(newQueueItems);
                                setIsUploading(true);

                                for (let i = 0; i < files.length; i++) {
                                  await handleFileUpload(files[i], activeHomework.id, 'done', newQueueItems[i].id);
                                }
                                fetchData();
                              }
                            }} />
                          </label>
                        ))}
                      </div>
                      <button
                        disabled={!shareText || isUploading}
                        onClick={async () => {
                          if (!user) return;
                          setLoadingAction("Syncing Activity...");
                          try {
                            await fetch(GAS_WEB_APP_URL, {
                              method: 'POST',
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
                            fetchData();
                          } catch (e) { } finally { setLoadingAction(null); }
                        }}
                        style={{ padding: '8px 20px', borderRadius: '10px', background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 800, cursor: 'pointer', opacity: (!shareText || isUploading) ? 0.3 : 1, fontSize: '0.8rem', transition: '0.2s' }}
                      >Post</button>
                    </div>
                  </div>

                  {/* Activity Feed Items */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {getFinishedUsers(activeHomework.id).length === 0 && (
                      <div style={{ textAlign: 'center', padding: '3rem 1rem', opacity: 0.3 }}>
                        <span style={{ fontSize: '2rem', display: 'block', marginBottom: '1rem' }}>🧊</span>
                        <p style={{ fontSize: '0.85rem' }}>No student activity yet.</p>
                      </div>
                    )}
                    {getFinishedUsers(activeHomework.id).map((student, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', padding: '1.25rem', borderRadius: '1.5rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', animation: 'fadeIn 0.4s ease-out' }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <img src={student.picture} style={{ width: '40px', height: '40px', borderRadius: '14px', border: '2px solid rgba(255,255,255,0.1)' }} alt="" />
                          <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: '#10b981', width: '14px', height: '14px', borderRadius: '50%', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6px' }}>✓</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#fff' }}>{student.name}</span>
                            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>SUBMITTED</span>
                          </div>

                          {student.proof && (
                            <div style={{ marginTop: '10px' }}>
                              {/* Separate text comments and file attachments */}
                              {(() => {
                                const parts = student.proof.split(',').filter(s => s && s.trim());
                                const textParts = parts.filter(p => !p.trim().startsWith('http'));
                                const fileParts = parts.filter(p => p.trim().startsWith('http'));

                                return (
                                  <>
                                    {textParts.length > 0 && (
                                      <div style={{ marginBottom: fileParts.length > 0 ? '12px' : '0' }}>
                                        {textParts.map((t, idx) => (
                                          <p key={idx} style={{ margin: '0 0 6px 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, background: 'rgba(255,255,255,0.03)', padding: '8px 12px', borderRadius: '10px' }}>
                                            {t}
                                          </p>
                                        ))}
                                      </div>
                                    )}

                                    {fileParts.length > 0 && (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '8px' }}>
                                        {fileParts.map((item, idx) => {
                                          const [rawUrl, hashName] = item.split('#');
                                          const realFilename = hashName ? decodeURIComponent(hashName) : 'Attachment';
                                          const isImage = rawUrl.includes('googleusercontent.com') || rawUrl.match(/\.(jpg|jpeg|png|gif|webp)$|^data:image/i);
                                          const isPdf = rawUrl.toLowerCase().includes('pdf') || realFilename.toLowerCase().endsWith('.pdf');
                                          const driveId = extractDriveId(rawUrl);

                                          return (
                                            <div
                                              key={idx}
                                              className="glass"
                                              style={{ position: 'relative', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', transition: '0.2s' }}
                                              onClick={() => setPreviewItem({ url: rawUrl, type: isImage ? 'image' : (isPdf ? 'pdf' : 'other'), filename: realFilename, driveId })}
                                            >
                                              {isImage ? (
                                                <img src={rawUrl} style={{ width: '100%', height: '70px', objectFit: 'cover' }} alt="" />
                                              ) : (
                                                <div style={{ height: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                                  <span style={{ fontSize: '1.2rem' }}>{isPdf ? '📕' : '📄'}</span>
                                                  <span style={{ fontSize: '0.5rem', opacity: 0.5, padding: '0 4px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%' }}>{realFilename}</span>
                                                </div>
                                              )}
                                              {user?.email === student.email && (
                                                <button onClick={async (e) => {
                                                  e.stopPropagation();
                                                  setConfirmModal({
                                                    title: "Remove Attachment",
                                                    message: "Proceeding will permanently delete this file from the feed and Google Drive.",
                                                    isDanger: true,
                                                    onConfirm: async () => {
                                                      setConfirmModal(null);
                                                      setLoadingAction("Removing...");
                                                      try {
                                                        const driveId = extractDriveId(rawUrl);
                                                        if (driveId) { try { await fetch(`${UPLOAD_WEB_APP_URL}?action=deleteFiles&driveIds=${driveId}`, { method: 'POST', mode: 'no-cors' }); } catch (e) { } }
                                                        await fetch(GAS_WEB_APP_URL, {
                                                          method: 'POST',
                                                          body: new URLSearchParams({ action: 'updateProgress', email: user.email, homework_id: String(activeHomework.id), status: 'done', image_url: student.proof?.split(',').filter(u => u !== item).join(',') || "" })
                                                        });
                                                        fetchData();
                                                        setNotification({ message: "Attachment removed.", type: 'success' });
                                                      } catch (e) {
                                                        setNotification({ message: "Action failed.", type: 'error' });
                                                      } finally {
                                                        setLoadingAction(null);
                                                      }
                                                    }
                                                  });
                                                }} style={{ position: 'absolute', top: '2px', right: '2px', width: '16px', height: '16px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.8)', color: '#fff', border: 'none', fontSize: '8px', cursor: 'pointer' }}>✕</button>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Comment System UI */}
                          <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              {comments.filter(c => c.owner_email === student.email).map((c, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.01)', padding: '8px 12px', borderRadius: '12px' }}>
                                  <img src={c.commenter_picture} style={{ width: '24px', height: '24px', borderRadius: '6px' }} alt="" />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                      <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.8)' }}>{c.commenter_name}</span>
                                      <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>{new Date(c.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.4 }}>{c.text}</p>
                                  </div>
                                </div>
                              ))}

                              {user && (
                                <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                                  <img src={user.picture} style={{ width: '28px', height: '28px', borderRadius: '8px' }} alt="" />
                                  <div style={{ flex: 1, position: 'relative' }}>
                                    <input
                                      className="glass"
                                      type="text"
                                      placeholder="Write a comment..."
                                      style={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '6px 12px', paddingRight: '45px', fontSize: '0.8rem', color: '#fff', outline: 'none' }}
                                      value={commentText[student.email] || ""}
                                      onChange={(e) => setCommentText(prev => ({ ...prev, [student.email]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handlePostComment(student.email);
                                      }}
                                    />
                                    <button
                                      onClick={() => handlePostComment(student.email)}
                                      style={{ position: 'absolute', right: '4px', top: '4px', bottom: '4px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 800, fontSize: '0.7rem', cursor: 'pointer', padding: '0 8px' }}
                                    >Send</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Helper functions for different view modes */}
      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="kanban-container" style={{
          padding: isMobile ? '1rem' : '2rem 2.5rem',
          flex: 1,
          flexDirection: isMobile ? 'column' : 'row',
          overflowX: isMobile ? 'hidden' : 'auto',
          gap: isMobile ? '1.5rem' : '2rem'
        }}>
          {[
            { key: 'soon', title: '🔥 3 วันก่อนส่ง', items: columns.soon, color: '#f43f5e' },
            { key: 'week', title: '📅 7 วันก่อนส่ง', items: columns.week, color: '#f59e0b' },
            { key: 'backlog', title: '🐚 งานดองเค็ม', items: columns.backlog, color: '#6366f1' }
          ].map(col => (
            <div key={col.key} className="column glass" style={{
              minWidth: isMobile ? '100%' : '360px',
              width: isMobile ? '100%' : '360px',
              borderTop: `4px solid ${col.color}`,
              padding: isMobile ? '1rem' : '1.5rem'
            }}>
              <div className="column-header" style={{ padding: '0.5rem 0.5rem 1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="column-title" style={{ fontSize: '1.3rem', fontWeight: 700 }}>{col.title}</h3>
                  <span className="badge" style={{ padding: '4px 10px', fontSize: '0.8rem', borderRadius: '8px' }}>{col.items.length}</span>
                </div>
              </div>
              <div className="tasks-container">
                {!isLoading && col.items.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '3rem', color: 'rgba(255,255,255,0.2)', border: '2px dashed rgba(255,255,255,0.05)', borderRadius: '1.5rem' }}>
                    No active tasks
                  </div>
                )}
                {col.items.map(hw => {
                  const isDone = hw.my_status === 'done';
                  const isExpanded = expandedId === hw.id;
                  const completedBy = getFinishedUsers(hw.id);

                  return (
                    <div
                      key={hw.id}
                      className={`card glass ${isExpanded ? 'expanded' : ''}`}
                      onClick={() => setActiveHomework(hw)}
                      style={{
                        opacity: isDone ? 0.45 : 1,
                        filter: isDone ? 'grayscale(0.3)' : 'none',
                        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                        borderLeft: isDone ? '6px solid #10b981' : `6px solid ${getSubjectColor(hw.subject)}`,
                        cursor: 'pointer',
                        transform: isExpanded ? 'scale(1.02)' : 'scale(1)',
                        zIndex: isExpanded ? 10 : 1,
                        padding: isMobile ? '1rem' : '1.25rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <span className="card-tag" style={{ backgroundColor: `${getSubjectColor(hw.subject)}25`, color: getSubjectColor(hw.subject), border: `1px solid ${getSubjectColor(hw.subject)}40`, fontWeight: 700, fontSize: isMobile ? '0.6rem' : '0.7rem' }}>
                              {hw.subject}
                            </span>
                            {isDone && <span style={{ color: '#10b981', fontSize: '0.7rem', fontWeight: 800 }}>COMPLETED</span>}
                          </div>
                          <h4 style={{ margin: '0', textDecoration: isDone ? 'line-through' : 'none', fontSize: isMobile ? '1rem' : '1.15rem', fontWeight: 700, lineHeight: 1.3 }}>{hw.title}</h4>
                        </div>
                        {user && (
                          <div
                            onClick={(e) => toggleComplete(e, hw.id, hw.my_status)}
                            style={{ width: '28px', height: '28px', borderRadius: '8px', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'var(--primary)' : 'rgba(255,255,255,0.05)', transition: '0.3s', flexShrink: 0, marginLeft: '1rem' }}
                          >
                            {isDone && <span style={{ color: '#fff', fontSize: '1rem', fontWeight: 900 }}>✓</span>}
                          </div>
                        )}
                      </div>

                      <div style={{
                        maxHeight: '45px',
                        overflow: 'hidden',
                        fontSize: '0.9rem',
                        lineHeight: 1.5,
                        color: 'rgba(255,255,255,0.6)',
                        marginTop: '1rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {hw.description}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deadline</span>
                          <div style={{ color: hw.deadline === new Date().toISOString().split('T')[0] ? '#f43f5e' : '#fff', fontWeight: 800, fontSize: '0.8rem' }}>{new Date(hw.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        </div>

                        {/* Facepile Section */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {completedBy.slice(0, 4).map((u, i) => (
                              <div key={u.email} style={{ position: 'relative' }} className="avatar-group">
                                <div
                                  style={{ position: 'relative' }}
                                  onMouseEnter={(e) => {
                                    const target = e.currentTarget.querySelector('.proof-preview') as HTMLElement;
                                    if (target) target.style.opacity = '1';
                                  }}
                                  onMouseLeave={(e) => {
                                    const target = e.currentTarget.querySelector('.proof-preview') as HTMLElement;
                                    if (target) target.style.opacity = '0';
                                  }}
                                >
                                  <img
                                    src={u.picture}
                                    style={{ width: '26px', height: '26px', borderRadius: '50%', border: '2px solid #1e293b', marginLeft: i === 0 ? 0 : '-10px', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', cursor: 'help', transition: '0.2s' }}
                                    title={u.name}
                                  />
                                  {u.proof && (
                                    <div className="proof-preview" style={{
                                      position: 'absolute', bottom: '35px', left: '50%', transform: 'translateX(-50%)',
                                      width: '120px', height: '120px', background: '#1e293b', border: '2px solid var(--primary)',
                                      borderRadius: '8px', overflow: 'hidden', opacity: 0, pointerEvents: 'none', transition: '0.3s', zIndex: 1000,
                                      boxShadow: '0 10px 20px rgba(0,0,0,0.5)'
                                    }}>
                                      <img src={u.proof} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Proof" />
                                      <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '0.5rem', padding: '2px', textAlign: 'center' }}>Proof of completion</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                            {completedBy.length > 4 && (
                              <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 800, marginLeft: '-10px', border: '2px solid #1e293b' }}>
                                +{completedBy.length - 4}
                              </div>
                            )}
                          </div>
                          {completedBy.length > 0 && (
                            <span style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                              {completedBy.length} {completedBy.length === 1 ? 'student' : 'students'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <div style={{
          padding: isMobile ? '1rem' : '2rem 2.5rem',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: isMobile ? '1rem' : '2rem',
          overflowY: 'auto'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: '1rem'
          }}>
            <h2 style={{ fontSize: isMobile ? '1.5rem' : '2rem', fontWeight: 900 }}>{currentDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}</h2>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="glass" style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff' }}>←</button>
              <button onClick={() => setCurrentDate(new Date())} className="glass" style={{ padding: '0 1.5rem', borderRadius: '1rem', border: 'none', cursor: 'pointer', color: '#fff', fontWeight: 700 }}>Today</button>
              <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="glass" style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff' }}>→</button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'rgba(255,255,255,0.05)', borderRadius: '1.5rem', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 900, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{d}</div>
            ))}
            {getDaysInMonth(currentDate).map((dayObj, i) => {
              const d = new Date(dayObj.year, dayObj.month, dayObj.day);
              const dayHomework = homeworkWithStatus.filter(hw => isSameDay(d, hw.deadline));
              const isToday = isSameDay(new Date(), d.toISOString());

              return (
                <div key={i} style={{ minHeight: '140px', background: dayObj.isCurrentMonth ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.4)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px', border: isToday ? '2px solid var(--primary)' : 'none' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 900, opacity: dayObj.isCurrentMonth ? 1 : 0.2 }}>{dayObj.day}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {dayHomework.map(hw => (
                      <button
                        key={hw.id}
                        onClick={() => setActiveHomework(hw)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: hw.my_status === 'done' ? 'rgba(16, 185, 129, 0.15)' : `${getSubjectColor(hw.subject)}25`,
                          border: `1px solid ${hw.my_status === 'done' ? '#10b98140' : getSubjectColor(hw.subject) + '40'}`,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: hw.my_status === 'done' ? '#10b981' : '#fff',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        {hw.my_status === 'done' ? '✓' : '•'} {hw.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline View */}
      {viewMode === 'timeline' && (
        <div style={{ padding: isMobile ? '1rem' : '2rem 2.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '2rem', overflowY: 'auto' }}>
          <div style={{ maxWidth: '800px', margin: isMobile ? '0' : '0 auto', width: '100%', position: 'relative', paddingLeft: isMobile ? '3rem' : '4rem' }}>
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: isMobile ? '1.5rem' : '2rem', width: '2px', background: 'linear-gradient(to bottom, var(--primary), #f43f5e)', opacity: 0.3 }}></div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
              {[...homeworkWithStatus].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()).map(hw => {
                const isDone = hw.my_status === 'done';
                const deadline = new Date(hw.deadline);
                return (
                  <div key={hw.id} style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute',
                      left: isMobile ? '-2rem' : '-2.5rem',
                      top: '1rem',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: isDone ? '#10b981' : 'var(--primary)',
                      border: '4px solid #0f172a',
                      zIndex: 2,
                      boxShadow: `0 0 20px ${isDone ? '#10b981' : 'var(--primary)'}40`
                    }}></div>

                    <div
                      className="glass"
                      onClick={() => setActiveHomework(hw)}
                      style={{
                        padding: '1.5rem',
                        borderRadius: '1.5rem',
                        cursor: 'pointer',
                        borderLeft: `6px solid ${getSubjectColor(hw.subject)}`,
                        opacity: isDone ? 0.6 : 1,
                        transition: '0.3s cubic-bezier(0.19, 1, 0.22, 1)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                          {deadline.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}
                        </div>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '4px 10px', borderRadius: '8px', background: `${getSubjectColor(hw.subject)}20`, color: getSubjectColor(hw.subject) }}>{hw.subject}</span>
                      </div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', textDecoration: isDone ? 'line-through' : 'none' }}>{hw.title}</h3>
                      <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: '1.5rem' }}>{hw.description}</p>

                      <div style={{ display: 'flex', gap: '1rem' }}>
                        {isDone ? (
                          <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>✓ Completed</span>
                        ) : (
                          <span style={{ color: 'var(--primary)', fontSize: '0.8rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>🕒 Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modern Attachment Preview Modal */}
      {
        previewItem && (
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(15px)', zIndex: 11000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '0.5rem' : '1rem', animation: 'fadeIn 0.3s ease-out' }}
            onClick={() => setPreviewItem(null)}
          >
            <header style={{ width: '100%', maxWidth: '1200px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', padding: isMobile ? '1rem' : '1.5rem', position: 'absolute', top: 0, gap: isMobile ? '1rem' : '0' }}>
              <div style={{ animation: 'slideInRight 0.4s ease-out' }}>
                <h4 style={{ color: '#fff', margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>{previewItem.filename}</h4>
                <p style={{ color: 'rgba(255,255,255,0.5)', margin: 0, fontSize: '0.85rem', letterSpacing: '1px' }}>{previewItem.type.toUpperCase()} PREVIEW</p>
              </div>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                {previewItem.driveId && (
                  <>
                    <a
                      href={`https://drive.google.com/uc?export=download&id=${previewItem.driveId}`}
                      className="glass"
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: '0.7rem 1.5rem', borderRadius: '0.75rem', background: 'var(--primary)', color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '0.9rem', boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)' }}
                    >
                      Download ↓
                    </a>
                    <a
                      href={`https://drive.google.com/file/d/${previewItem.driveId}/view`}
                      target="_blank"
                      rel="noreferrer"
                      className="glass"
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: '0.7rem 1.5rem', borderRadius: '0.75rem', background: 'rgba(255,255,255,0.1)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: '0.9rem' }}
                    >
                      Direct Link ↗
                    </a>
                  </>
                )}
                <button
                  onClick={() => setPreviewItem(null)}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', width: '45px', height: '45px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: '0.2s' }}
                >✕</button>
              </div>
            </header>

            <div
              style={{ width: '100%', maxWidth: '1200px', height: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: '4rem' }}
              onClick={(e) => e.stopPropagation()}
            >
              {previewItem.type === 'image' && (
                <img
                  src={previewItem.url}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '1rem', boxShadow: '0 30px 60px rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                  alt="Preview"
                />
              )}
              {previewItem.type === 'pdf' && (
                <iframe
                  src={previewItem.driveId ? `https://drive.google.com/file/d/${previewItem.driveId}/preview` : previewItem.url}
                  style={{ width: '100%', height: '100%', border: 'none', borderRadius: '1rem', backgroundColor: '#fff', boxShadow: '0 30px 60px rgba(0,0,0,0.8)' }}
                  title="PDF Preview"
                />
              )}
              {previewItem.type === 'other' && (
                <div className="glass" style={{ padding: '5rem', borderRadius: '2rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span style={{ fontSize: '6rem', display: 'block', marginBottom: '1.5rem', animation: 'bounce 2s infinite' }}>📄</span>
                  <h2 style={{ fontSize: '1.8rem', fontWeight: 800 }}>No Preview Available</h2>
                  <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: '1rem auto' }}>We can't preview this file type directly, but you can open it in Google Drive or download it.</p>
                  <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2.5rem' }}>
                    <a href={`https://drive.google.com/file/d/${previewItem.driveId}/view`} target="_blank" rel="noreferrer" style={{ background: 'var(--primary)', padding: '1rem 2.5rem', borderRadius: '1.25rem', color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: '1rem' }}>Open Externally</a>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      {notification && (
        <div style={{ position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 12000, animation: 'slideInRight 0.3s ease-out' }}>
          <div className="glass" style={{ padding: '1rem 2rem', borderRadius: '1rem', background: notification.type === 'success' ? '#10b981' : (notification.type === 'error' ? '#f43f5e' : '#6366f1'), color: '#fff', fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '1.2rem' }}>{notification.type === 'success' ? '✅' : (notification.type === 'error' ? '❌' : 'ℹ️')}</span>
            {notification.message}
          </div>
        </div>
      )}

      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 11500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', animation: 'fadeIn 0.2s ease-out' }}>
          <div className="glass" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', borderRadius: '2.5rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(15, 23, 42, 0.98)', boxShadow: '0 30px 60px rgba(0,0,0,0.5)' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: confirmModal.isDanger ? 'rgba(244, 63, 94, 0.1)' : 'rgba(99, 102, 241, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', fontSize: '1.8rem' }}>
              {confirmModal.isDanger ? '⚠️' : '❓'}
            </div>
            <h3 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: '0.75rem', color: confirmModal.isDanger ? '#f43f5e' : '#fff', letterSpacing: '-0.02em' }}>{confirmModal.title}</h3>
            <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: '2.5rem', lineHeight: 1.6, fontSize: '0.95rem' }}>{confirmModal.message}</p>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{ flex: 1, padding: '1rem', borderRadius: '1.1rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}
              >Cancel</button>
              <button
                onClick={confirmModal.onConfirm}
                style={{ flex: 1, padding: '1rem', borderRadius: '1.1rem', background: confirmModal.isDanger ? '#f43f5e' : 'var(--primary)', border: 'none', color: '#fff', fontWeight: 800, cursor: 'pointer', transition: '0.2s', boxShadow: confirmModal.isDanger ? '0 8px 20px rgba(244, 63, 94, 0.3)' : '0 8px 20px rgba(99, 102, 241, 0.3)' }}
              >Confirm</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
              @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
              @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
              @keyframes slideInRight { 
                from { opacity: 0; transform: translateX(30px) scale(0.9); } 
                to { opacity: 1; transform: translateX(0) scale(1); } 
              }
            `}</style>
    </main>

  );
}
