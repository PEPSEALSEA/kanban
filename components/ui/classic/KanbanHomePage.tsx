'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/components/DataProvider';
import AttachmentList from '@/components/AttachmentList';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { API_URL, UPLOAD_SERVICE_URL } from '@/lib/config';
import { authHeaders } from '@/lib/auth';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = API_URL;
const UPLOAD_WEB_APP_URL = UPLOAD_SERVICE_URL;
import { isAdminEmail } from '@/lib/admin';
import { formatThaiRelativeDayLabel } from '@/lib/thaiDate';
import { subjectBadgeStyle } from '@/lib/colors';
import {
  IconCalendar,
  IconCheck,
  IconGraduation,
  IconHourglass,
  IconImage,
  IconKanban,
  IconTimeline,
  IconX,
} from '@/components/icons';

function getSubjectColor(subjectName: string, subjects: any[]): string {
  if (!subjectName) return '#94a3b8';
  const sub = subjects.find(s => s.name.trim().toLowerCase() === subjectName.trim().toLowerCase());
  return sub ? sub.color : '#94a3b8';
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
    refreshData,
    subjects,
    logEvent
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  const openHomework = useCallback((hw: Homework) => {
    setActiveHomework(hw);
    logEvent('do_work', { content_id: hw.id });
    window.location.hash = `#/view?id=${hw.id}`;
  }, [logEvent]);

  const closeHomework = useCallback(() => {
    setActiveHomework(null);
    if (window.location.hash.startsWith('#/view')) {
      const path = window.location.pathname + window.location.search;
      window.history.replaceState(null, '', path);
    }
  }, []);

  const handleHashChange = useCallback(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/view')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        const found = allHomework.find(hw => String(hw.id) === String(id));
        if (found) {
          setActiveHomework(found);
          return;
        }
      }
    }
    if (hash.startsWith('#/view')) {
      setActiveHomework(null);
    }
  }, [allHomework]);

  useEffect(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'updateProgress',
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
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ action: 'deleteHomework', id })
          });

          refreshData();
          closeHomework();
          setNotification({ message: "Assignment deleted successfully.", type: 'success' });
        } catch (e) {
          setNotification({ message: "Failed to delete assignment.", type: 'error' });
        }
      }
    });
  };

  const fetchComments = useCallback(async (hwId: string) => {
    try {
      const res = await fetch(`${GAS_WEB_APP_URL}?action=comments&homework_id=${hwId}`, { headers: authHeaders() });
      const data = (await res.json()) as any;
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'addComment',
          homework_id: String(activeHomework.id),
          owner_email: ownerEmail,
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'updateProgress',
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
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({
              action: 'editHomework',
              id: activeHomework.id,
              ...editForm
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
      const result = (await res.json()) as any;
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
      
      if (diffDays < 0) return;

      if (diffDays <= 3) categorized.soon.push(hw);
      else if (diffDays <= 7) categorized.week.push(hw);
      else categorized.backlog.push(hw);
    });
    const sortFn = (a: Homework, b: Homework) => {
      // 1. Status (Done at bottom)
      const statusA = a.my_status === 'done' ? 1 : 0;
      const statusB = b.my_status === 'done' ? 1 : 0;
      if (statusA !== statusB) return statusA - statusB;

      // 2. Deadline
      const dateA = new Date(a.deadline).getTime();
      const dateB = new Date(b.deadline).getTime();
      if (dateA !== dateB) return dateA - dateB;

      // 3. Subject
      const subA = (a.subject || '').toLowerCase();
      const subB = (b.subject || '').toLowerCase();
      if (subA !== subB) return subA.localeCompare(subB, 'th');

      // 4. ID
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    };
    return { soon: categorized.soon.sort(sortFn), week: categorized.week.sort(sortFn), backlog: categorized.backlog.sort(sortFn) };
  }, [homeworkWithStatus]);

  const getFinishedUsers = (hwId: string) => {
    return allProgress.filter(p => String(p.homework_id) === String(hwId) && p.status === 'done').map(p => {
      const u = allUsers.find(user => String(user.email).toLowerCase() === String(p.email).toLowerCase());
      return u ? { ...u, proof: p.image_url } : null;
    }).filter(u => u !== null) as (UserInfo & { proof?: string })[];
  };

  const isAdmin = user && isAdminEmail(user.email);

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Global Upload Overlay */}
      {uploadQueue.length > 0 && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[20000] flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-sm p-8 text-center bg-white">
            <h3 className="text-xl font-black uppercase mb-6 tracking-tighter">Uploading Proof...</h3>
            <div className="flex flex-col gap-3">
              {uploadQueue.map(f => (
                <div key={f.id} className="flex justify-between items-center bg-gray-100 border-2 border-black p-3 font-bold">
                  <span className="truncate mr-2 uppercase text-xs">{f.name}</span>
                  <span className="text-xl">
                    {f.status === 'uploading' ? <IconHourglass className="w-5 h-5" /> : (f.status === 'done' ? <IconCheck className="w-5 h-5 text-emerald-500" /> : <IconX className="w-5 h-5 text-rose-500" />)}
                  </span>
                </div>
              ))}
            </div>
            {uploadQueue.every(f => f.status !== 'uploading') && (
              <button onClick={() => setUploadQueue([])} className="neo-button w-full mt-8 py-3 bg-green-400 font-black">
                CLOSE
              </button>
            )}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-[100] px-4 md:px-8 py-4 md:py-5 flex justify-between items-center bg-white/80 backdrop-blur-md border-b border-slate-200/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sky-100 rounded-xl flex items-center justify-center text-xl"><IconGraduation className="w-5 h-5" /></div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Kanban603BPK</h1>
        </div>
      </header>

      {/* View Switcher Controls */}
      <div className="flex justify-center mt-10 mb-6 px-4">
        <div className="bg-white/50 backdrop-blur-sm border border-slate-200/60 p-1.5 flex gap-1 rounded-2xl shadow-sm relative">
          {(['kanban', 'calendar', 'timeline'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative px-5 py-2.5 rounded-xl font-semibold text-xs uppercase tracking-wider transition-colors flex items-center gap-2 z-10 active:scale-95 duration-200 ${
                viewMode === mode 
                ? 'text-sky-600' 
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/40'
              }`}
            >
              {viewMode === mode && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 bg-white rounded-xl shadow-sm border border-slate-200 -z-10"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              {mode === 'kanban' && <IconKanban className="w-4 h-4" />}
              {mode === 'calendar' && <IconCalendar className="w-4 h-4" />}
              {mode === 'timeline' && <IconTimeline className="w-4 h-4" />}
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline Navigation Controls */}
      {viewMode === 'timeline' && (
        <div className="flex items-center justify-center gap-2 sm:gap-3 mb-6 sm:mb-8 px-3 sm:px-4 w-full max-w-full box-border">
          <button 
            onClick={() => {
              const d = new Date(focusDate);
              d.setDate(d.getDate() - 7);
              setFocusDate(d);
            }}
            className="neo-button w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center text-lg sm:text-xl"
          >←</button>
          <h2 className="text-sm sm:text-lg font-bold min-w-0 max-w-[12rem] sm:max-w-none text-center text-slate-700 truncate px-1">
            {`Week of ${new Date(focusDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`}
          </h2>
          <button 
            onClick={() => {
              const d = new Date(focusDate);
              d.setDate(d.getDate() + 7);
              setFocusDate(d);
            }}
            className="neo-button w-9 h-9 sm:w-11 sm:h-11 shrink-0 flex items-center justify-center text-lg sm:text-xl"
          >→</button>
          <button 
            onClick={() => setFocusDate(new Date())}
            className="text-[10px] sm:text-xs font-bold text-sky-600 hover:text-sky-700 px-2 sm:px-3 py-2 shrink-0 whitespace-nowrap"
          >TODAY</button>
        </div>
      )}

      {/* Board Views Content */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <AnimatePresence mode="wait">
        {viewMode === 'kanban' && (
          <motion.div 
            key="kanban"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="kanban-container flex flex-col md:flex-row gap-6 md:gap-8 px-4 md:px-6 py-6 md:py-8 overflow-x-auto" 
          >
            {[
              { key: 'soon', title: 'Due Soon', subtitle: 'Next 3 days', items: columns.soon, color: '#fee2e2', textColor: '#b91c1c' },
              { key: 'week', title: 'This Week', subtitle: 'Next 7 days', items: columns.week, color: '#fef3c7', textColor: '#b45309' },
              { key: 'backlog', title: 'Upcoming', subtitle: 'Later on', items: columns.backlog, color: '#e0f2fe', textColor: '#0369a1' }
            ].map(col => (
              <div key={col.key} className="column min-w-full md:min-w-[360px]" style={{ backgroundColor: 'rgba(255,255,255,0.4)' }}>
                <div className="flex justify-between items-end mb-6 px-1">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{col.title}</h3>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{col.subtitle}</p>
                  </div>
                  <span className="badge">{col.items.length}</span>
                </div>
                <div className="flex flex-col gap-4">
                  {col.items.map(hw => {
                    const isDone = hw.my_status === 'done';
                    const subColor = getSubjectColor(hw.subject, subjects);
                    return (
                      <motion.div 
                        key={hw.id} 
                        className={`card group cursor-pointer border border-slate-100 ${isDone ? 'opacity-50' : ''}`} 
                        onClick={() => openHomework(hw)}
                        whileHover={{ y: -2, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)', borderColor: '#e2e8f0' }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span 
                                className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md" 
                                style={subjectBadgeStyle(subColor)}
                              >
                                {hw.subject}
                              </span>
                            </div>
                            <h4 className={`text-md font-semibold text-slate-800 leading-snug mb-3 ${isDone ? 'line-through text-slate-400' : ''}`}>
                              {hw.title}
                            </h4>
                            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 uppercase tracking-wide">
                              <span className="opacity-70">Deadline</span>
                              <span className={isDone ? '' : 'text-slate-600'}>
                                {new Date(hw.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                              </span>
                            </div>
                          </div>
                          {user && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); toggleComplete(e, hw.id, hw.my_status); }} 
                              className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all shrink-0 mt-1 ${isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50'}`}
                            >
                              {isDone && <IconCheck className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {viewMode === 'calendar' && (
          <motion.div 
            key="calendar"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="px-2 md:px-6 pb-8 w-full max-w-5xl mx-auto"
          >
            <div className="neo-card p-3 md:p-10">
              <div className="flex justify-between items-center mb-4 md:mb-8">
                <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-700">
                  {focusDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                </h2>
                <div className="flex gap-2 bg-white/50 p-1 rounded-xl border border-slate-200/60 shadow-sm">
                  <button
                    onClick={() => setFocusDate(new Date(focusDate.getFullYear(), focusDate.getMonth() - 1, 1))}
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors text-lg"
                  >←</button>
                  <button
                    onClick={() => setFocusDate(new Date())}
                    className="px-4 text-[10px] font-bold uppercase tracking-widest text-sky-600 hover:text-sky-700"
                  >Today</button>
                  <button
                    onClick={() => setFocusDate(new Date(focusDate.getFullYear(), focusDate.getMonth() + 1, 1))}
                    className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors text-lg"
                  >→</button>
                </div>
              </div>

              <div className="calendar-grid">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                  <div key={d} className="calendar-weekday p-3 md:p-4 text-center text-xs font-black bg-sky-100 border-b-2 border-black">{d}</div>
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
                    }).sort((a, b) => {
                      const statusA = a.my_status === 'done' ? 1 : 0;
                      const statusB = b.my_status === 'done' ? 1 : 0;
                      if (statusA !== statusB) return statusA - statusB;
                      return 0;
                    });
                    const hasTasks = dayTasks.length > 0;
                    
                    return (
                      <motion.div 
                        key={i} 
                        className={`calendar-day ${!d.current ? 'not-current' : ''} ${isToday ? 'today' : ''} ${hasTasks ? 'cursor-pointer' : ''}`}
                        onClick={() => hasTasks && setSelectedDate(new Date(d.year, d.month, d.day).toISOString())}
                        whileHover={hasTasks ? { scale: 1.03, backgroundColor: 'var(--bg-yellow-300)' } : undefined}
                        whileTap={hasTasks ? { scale: 0.97 } : undefined}
                        transition={{ duration: 0.15 }}
                      >
                        <div className="text-sm font-black">{d.day}</div>
                        <div className="flex flex-wrap gap-1 items-center">
                          {dayTasks.length > 3 ? (
                            <span className="text-[10px] font-black text-slate-600 tabular-nums leading-none">
                              {dayTasks.length}
                            </span>
                          ) : (
                            dayTasks.map(task => (
                              <span 
                                key={task.id}
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ 
                                  background: getSubjectColor(task.subject, subjects),
                                  opacity: task.my_status === 'done' ? 0.3 : 1
                                }} 
                                title={task.title} 
                              />
                            ))
                          )}
                        </div>
                      </motion.div>
                    );
                  });
                })()}
              </div>
            </div>
          </motion.div>
        )}

        {viewMode === 'timeline' && (
          <motion.div 
            key="timeline"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="px-4 md:px-6 pb-12 w-full"
          >
            <div>
              <div className="timeline-v-container">
              {Array.from({ length: 30 }).map((_, i) => {
                const d = new Date(focusDate);
                d.setDate(d.getDate() + i); 
                const isToday = new Date().toDateString() === d.toDateString();
                
                const dayTasks = homeworkWithStatus
                  .filter(hw => {
                    const hwDate = new Date(hw.deadline);
                    return hwDate.getDate() === d.getDate() && 
                           hwDate.getMonth() === d.getMonth() && 
                           hwDate.getFullYear() === d.getFullYear();
                  })
                  .sort((a, b) => {
                    const statusA = a.my_status === 'done' ? 1 : 0;
                    const statusB = b.my_status === 'done' ? 1 : 0;
                    if (statusA !== statusB) return statusA - statusB;
                    return 0;
                  });

                return (
                  <div key={i} className="timeline-v-item">
                    <div className="timeline-v-left">
                      <div className="timeline-v-date">
                        <div className={`text-2xl font-black leading-none ${isToday ? 'text-black' : 'text-gray-500'}`}>
                          {d.getDate()}
                        </div>
                        <div className="text-[10px] font-black uppercase text-gray-400">
                          {d.toLocaleDateString('th-TH', { month: 'short' })}
                        </div>
                        <div className={`text-[10px] font-bold mt-1 leading-tight ${isToday ? 'text-sky-600' : 'text-slate-500'}`}>
                          {formatThaiRelativeDayLabel(d)}
                        </div>
                      </div>
                      <div className="timeline-v-path">
                        <div className={`timeline-v-dot ${isToday ? 'bg-sky-400' : 'bg-white'}`} style={{ border: '2px solid #e2e8f0' }} />
                      </div>
                    </div>

                    <div className="timeline-v-right">
                      {dayTasks.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {dayTasks.map(task => {
                            const isDone = task.my_status === 'done';
                            const subColor = getSubjectColor(task.subject, subjects);
                            return (
                              <motion.div 
                                key={task.id} 
                                onClick={() => openHomework(task)}
                                className={`card p-4 cursor-pointer relative overflow-hidden ${isDone ? 'opacity-60' : ''}`}
                                style={{ 
                                  borderLeft: `8px solid ${subColor}`,
                                }}
                                whileHover={{ x: 4, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)' }}
                                whileTap={{ scale: 0.98 }}
                                transition={{ duration: 0.2 }}
                              >
                                <div className="text-[10px] font-bold uppercase mb-1" style={{ color: subColor }}>
                                  {task.subject}
                                </div>
                                <div className={`text-sm font-bold leading-tight ${isDone ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                  {task.title}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="py-4 text-xs font-bold text-gray-400 italic">
                          No tasks due
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Date Overview Modal */}
      <AnimatePresence>
      {selectedDate && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9000] flex items-center justify-center p-4"
          onClick={() => setSelectedDate(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="neo-card w-full max-w-sm p-6 md:p-8 shadow-2xl border-none rounded-3xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-xl font-bold uppercase tracking-tight text-slate-800">
                {new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}
              </h3>
              <button onClick={() => setSelectedDate(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"><IconX className="w-4 h-4" /></button>
            </div>
            <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-2">
              {homeworkWithStatus
                .filter(hw => {
                  const hwDate = new Date(hw.deadline);
                  const sDate = new Date(selectedDate);
                  return hwDate.getDate() === sDate.getDate() && 
                         hwDate.getMonth() === sDate.getMonth() && 
                         hwDate.getFullYear() === sDate.getFullYear();
                })
                .sort((a, b) => {
                  const statusA = a.my_status === 'done' ? 1 : 0;
                  const statusB = b.my_status === 'done' ? 1 : 0;
                  if (statusA !== statusB) return statusA - statusB;
                  return 0;
                })
                .map((task: Homework) => {
                  const isDone = task.my_status === 'done';
                  return (
                    <button 
                      key={task.id} 
                      onClick={() => { openHomework(task); setSelectedDate(null); }}
                      className={`w-full p-4 bg-slate-50 hover:bg-slate-100 transition-all rounded-2xl flex items-center gap-4 text-left group ${isDone ? 'opacity-50' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0" style={subjectBadgeStyle(getSubjectColor(task.subject, subjects))}>
                        {task.subject.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="text-[10px] font-bold uppercase text-slate-400 mb-0.5 tracking-wider">{task.subject}</div>
                        <div className={`font-semibold text-sm text-slate-800 leading-tight ${isDone ? 'line-through text-slate-400' : ''}`}>{task.title}</div>
                      </div>
                      <span className="text-slate-300 group-hover:text-sky-500">→</span>
                    </button>
                  );
                })}
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* Homework Detail Modal */}
      <AnimatePresence>
      {activeHomework && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-slate-900/30 backdrop-blur-md z-[10000] flex items-center justify-center p-4 md:p-8" 
          onClick={() => closeHomework()}
          >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="neo-card w-full max-w-5xl max-h-[92vh] overflow-y-auto p-5 md:p-12 relative shadow-2xl border-none rounded-3xl" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => closeHomework()}
              className="absolute top-4 right-4 md:top-8 md:right-8 w-10 h-10 flex items-center justify-center rounded-full bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all"
            ><IconX className="w-4 h-4" /></button>

            <div className="mb-12">
              <span 
                className="text-[10px] font-bold uppercase px-3 py-1 rounded-full mb-6 inline-block" 
                style={subjectBadgeStyle(getSubjectColor(activeHomework.subject, subjects), '15')}
              >
                {activeHomework.subject}
              </span>
              <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight text-slate-800 leading-tight">{activeHomework.title}</h2>
              <div className="flex gap-6 text-xs font-semibold text-slate-400 uppercase tracking-widest">
                <span className="flex items-center gap-2"><IconCalendar className="w-4 h-4" /> {new Date(activeHomework.deadline).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-sm font-bold mb-6 uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="w-8 h-[1px] bg-slate-200"></span> Instructions
                  </h3>
                  <div className="mb-8">
                    <AttachmentList 
                      contentId={activeHomework.id}
                      contentType="homework"
                      attachments={memoizedHomeworkAttachments} 
                    />
                  </div>
                  <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-8 leading-relaxed text-slate-700 font-medium break-words">
                    <MarkdownRenderer content={activeHomework.description || ''} />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-8">
                <div>
                  <h3 className="text-sm font-bold mb-6 uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    <span className="w-8 h-[1px] bg-slate-200"></span> Submissions
                  </h3>
                  <div className="flex flex-col gap-6">
                     {user && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                        <textarea 
                          placeholder="What did you learn today?..." 
                          value={shareText} 
                          onChange={e => setShareText(e.target.value)} 
                          className="w-full bg-transparent border-none focus:ring-0 text-slate-800 font-medium resize-none outline-none min-h-[100px] text-lg placeholder:text-slate-300"
                        />
                        <div className="flex justify-between items-center mt-6">
                          <button onClick={(e) => uploadOrReplaceProof(e, activeHomework.id)} className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors">
                            <span className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-sm"><IconImage className="w-4 h-4" /></span> PHOTO
                          </button>
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={(e) => toggleComplete(e, activeHomework.id, homeworkWithStatus.find(h => h.id === activeHomework.id)?.my_status)} 
                              className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all shadow-sm whitespace-nowrap ${homeworkWithStatus.find(h => h.id === activeHomework.id)?.my_status === 'done' ? 'bg-slate-100 text-slate-500 hover:bg-slate-200' : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200'}`}
                            >
                              {homeworkWithStatus.find(h => h.id === activeHomework.id)?.my_status === 'done' ? 'MARK PENDING' : 'MARK FINISHED'}
                            </button>
                            <button onClick={() => handleShareSubmission()} className="px-5 py-2 rounded-xl text-xs font-bold bg-sky-500 text-white hover:bg-sky-600 transition-all shadow-md shadow-sky-200">
                              POST
                            </button>
                          </div>
                        </div>
                      </div>
                     )}
                     <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2">
                       {getFinishedUsers(activeHomework.id).map((student, i) => (
                        <div key={i} className="flex gap-5 bg-white border-2 border-black p-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                          <img src={student.picture} className="w-12 h-12 border-2 border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" alt="" />
                          <div className="flex-1">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-black text-sm uppercase tracking-tight">{student.name}</span>
                              <span className="text-[10px] font-black bg-green-300 border-2 border-black px-2 py-0.5 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">DONE</span>
                            </div>
                            {student.proof && (
                              <div className="mt-3 flex flex-col gap-3">
                                {student.proof.split(',').map((url, idx) => (
                                  url.startsWith('http') 
                                  ? <img key={idx} src={url} className="w-full border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:scale-[1.02] transition-transform" alt="" /> 
                                  : <p key={idx} className="text-sm font-bold border-l-4 border-black pl-3 py-1 italic bg-gray-50">{url}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                       ))}
                       {getFinishedUsers(activeHomework.id).length === 0 && (
                         <div className="py-12 text-center border-2 border-dashed border-gray-300 text-gray-400 font-bold uppercase tracking-widest text-xs">
                           No submissions yet
                         </div>
                       )}
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {notification && (
        <div className="fixed bottom-8 right-8 z-[20000] animate-bounce-in">
          <div className="neo-card px-8 py-4 bg-green-400 font-black uppercase text-sm tracking-widest">
            {notification.message}
          </div>
        </div>
      )}
      
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[12000] flex items-center justify-center p-4">
          <div className="neo-card w-full max-w-md p-8 text-center bg-white">
            <h3 className="text-2xl font-black uppercase mb-4 tracking-tighter">{confirmModal.title}</h3>
            <p className="font-bold text-gray-500 mb-8 leading-relaxed">{confirmModal.message}</p>
            <div className="flex gap-4">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="neo-button flex-1 py-3 bg-white hover:bg-gray-100"
              >
                CANCEL
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className={`neo-button flex-1 py-3 text-white ${confirmModal.isDanger ? 'bg-rose-500' : 'bg-sky-400'}`}
              >
                CONFIRM
              </button>
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
