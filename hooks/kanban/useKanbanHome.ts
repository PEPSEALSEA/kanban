'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { googleLogout } from '@react-oauth/google';
import { useData } from '@/components/DataProvider';
import { API_URL, UPLOAD_SERVICE_URL } from '@/lib/config';
import { clearIdToken, authHeaders } from '@/lib/auth';
import { completeGoogleLogin } from '@/lib/googleLogin';
import { isAdminEmail } from '@/lib/admin';

export type HomeworkItem = {
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

export type UserInfo = {
  email: string;
  name: string;
  picture: string;
};

export function getSubjectColor(subjectName: string, subjects: { name: string; color: string }[]): string {
  if (!subjectName) return '#8a8f98';
  const sub = subjects.find((s) => s.name.trim().toLowerCase() === subjectName.trim().toLowerCase());
  return sub ? sub.color : '#8a8f98';
}

export function useKanbanHome() {
  const {
    allHomework,
    allUsers,
    allProgress,
    user,
    setUser,
    isLoading,
    refreshData,
    subjects,
    logEvent,
  } = useData();

  const [activeHomework, setActiveHomework] = useState<HomeworkItem | null>(null);
  const [shareText, setShareText] = useState('');
  const [previewItem, setPreviewItem] = useState<{ url: string; type: 'image' | 'pdf' | 'other'; filename: string; driveId?: string | null } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void; isDanger?: boolean } | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploadQueue, setUploadQueue] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; id: string }[]>([]);
  const [comments, setComments] = useState<{ email: string; text: string; created_at?: string }[]>([]);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'kanban' | 'calendar' | 'timeline'>('kanban');
  const [focusDate, setFocusDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        setCommandOpen(false);
        if (activeHomework) setActiveHomework(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeHomework]);

  const homeworkWithStatus = useMemo(() => {
    return allHomework.map((hw) => {
      const userProgress = allProgress.find(
        (p) =>
          String(p.email).toLowerCase() === String(user?.email).toLowerCase() &&
          String(p.homework_id) === String(hw.id)
      );
      return {
        ...hw,
        my_status: (userProgress?.status || 'pending') as HomeworkItem['my_status'],
      };
    });
  }, [allHomework, allProgress, user]);

  const filteredHomework = useMemo(() => {
    if (!searchQuery.trim()) return homeworkWithStatus;
    const q = searchQuery.toLowerCase();
    return homeworkWithStatus.filter(
      (hw) =>
        hw.title.toLowerCase().includes(q) ||
        hw.subject.toLowerCase().includes(q) ||
        hw.description?.toLowerCase().includes(q)
    );
  }, [homeworkWithStatus, searchQuery]);

  const openHomework = useCallback(
    (hw: HomeworkItem) => {
      setActiveHomework(hw);
      logEvent('do_work', { content_id: hw.id });
      window.location.hash = `#/view?id=${hw.id}`;
    },
    [logEvent]
  );

  const closeHomework = useCallback(() => {
    setActiveHomework(null);
    if (window.location.hash.startsWith('#/view')) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const handleHashChange = useCallback(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/view')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        const found = allHomework.find((hw) => String(hw.id) === String(id));
        if (found) {
          setActiveHomework({ ...found, my_status: homeworkWithStatus.find((h) => h.id === found.id)?.my_status });
          return;
        }
      }
    }
    if (hash.startsWith('#/view')) setActiveHomework(null);
  }, [allHomework, homeworkWithStatus]);

  useEffect(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

  const columns = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const categorized = { soon: [] as HomeworkItem[], week: [] as HomeworkItem[], backlog: [] as HomeworkItem[] };
    filteredHomework.forEach((hw) => {
      const deadline = new Date(hw.deadline);
      const diffDays = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 1) return;
      if (diffDays <= 3) categorized.soon.push(hw);
      else if (diffDays <= 7) categorized.week.push(hw);
      else categorized.backlog.push(hw);
    });
    const sortFn = (a: HomeworkItem, b: HomeworkItem) => {
      const statusA = a.my_status === 'done' ? 1 : 0;
      const statusB = b.my_status === 'done' ? 1 : 0;
      if (statusA !== statusB) return statusA - statusB;
      const dateA = new Date(a.deadline).getTime();
      const dateB = new Date(b.deadline).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    };
    return {
      soon: categorized.soon.sort(sortFn),
      week: categorized.week.sort(sortFn),
      backlog: categorized.backlog.sort(sortFn),
    };
  }, [filteredHomework]);

  const handleLoginSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return;
    await completeGoogleLogin(credentialResponse.credential, setUser, refreshData);
  };

  const handleLogout = () => {
    googleLogout();
    clearIdToken();
    setUser(null);
    localStorage.removeItem('homework_user');
    refreshData();
  };

  const handleFileUpload = async (file: File, homeworkId: string, status: string, fileId: string): Promise<boolean> => {
    try {
      setUploadQueue((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'uploading' } : f)));
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;
      await fetch(
        `${UPLOAD_SERVICE_URL}?action=uploadProof&email=${encodeURIComponent(user?.email || '')}&homework_id=${encodeURIComponent(String(homeworkId))}&status=${encodeURIComponent(status)}&filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
        { method: 'POST', mode: 'no-cors', body: base64Data }
      );
      setUploadQueue((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'done' } : f)));
      return true;
    } catch {
      setUploadQueue((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: 'error' } : f)));
      return false;
    }
  };

  const toggleComplete = async (e: React.MouseEvent, hwId: string, currentStatus?: string) => {
    e.stopPropagation();
    if (!user) return;
    const newStatus = currentStatus === 'done' ? 'pending' : 'done';
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'updateProgress', homework_id: String(hwId), status: newStatus }),
      });
      await refreshData();
    } catch {
      /* ignore */
    }
  };

  const uploadOrReplaceProof = async (e: React.MouseEvent, hwId: string) => {
    e.stopPropagation();
    if (!user) return;
    const current = allProgress.find((p) => p.email === user.email && String(p.homework_id) === String(hwId));
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    const filePromise = new Promise<File | null>((resolve) => {
      input.onchange = (event: Event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        resolve(file || null);
      };
    });
    input.click();
    const file = await filePromise;
    if (!file) return;
    const ok = await handleFileUpload(file, hwId, current?.status || 'pending', Math.random().toString(36).slice(2, 11));
    if (ok) await refreshData();
  };

  const fetchComments = useCallback(async (hwId: string) => {
    try {
      const res = await fetch(`${API_URL}?action=comments&homework_id=${hwId}`, { headers: authHeaders() });
      const data = (await res.json()) as { success?: boolean; data?: typeof comments };
      if (data.success) setComments(data.data || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (activeHomework) fetchComments(activeHomework.id);
    else setComments([]);
  }, [activeHomework, fetchComments]);

  const handleShareSubmission = async () => {
    if (!shareText || !user || !activeHomework) return;
    try {
      await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          action: 'updateProgress',
          homework_id: String(activeHomework.id),
          status: 'done',
          image_url: shareText,
          append: 'true',
        }),
      });
      setShareText('');
      refreshData();
      setNotification({ message: 'Update shared successfully.', type: 'success' });
    } catch {
      setNotification({ message: 'Failed to share update.', type: 'error' });
    }
  };

  const memoizedHomeworkAttachments = useMemo(() => {
    if (!activeHomework) return [];
    const parseItem = (url: string) => {
      const parts = url.split('#');
      const decodedUrl = parts[0];
      let title = 'Document';
      let fileId: string | undefined;
      if (parts.length >= 2) title = decodeURIComponent(parts[1]);
      if (parts.length >= 3) fileId = decodeURIComponent(parts[2]);
      return {
        url: decodedUrl,
        title,
        fileId,
        type:
          title.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|svg)$/) ||
          decodedUrl.match(/\.(jpg|jpeg|png|gif|webp|svg)($|\?)/)
            ? ('link_image' as const)
            : ('link_work' as const),
      };
    };
    return [
      ...(activeHomework.link_work ? activeHomework.link_work.split(',').filter(Boolean).map(parseItem) : []),
      ...(activeHomework.link_image ? activeHomework.link_image.split(',').filter(Boolean).map(parseItem) : []),
    ];
  }, [activeHomework]);

  const getFinishedUsers = (hwId: string) => {
    return allProgress
      .filter((p) => String(p.homework_id) === String(hwId) && p.status === 'done')
      .map((p) => {
        const u = allUsers.find((usr) => String(usr.email).toLowerCase() === String(p.email).toLowerCase());
        return u ? { ...u, proof: p.image_url } : null;
      })
      .filter(Boolean) as (UserInfo & { proof?: string })[];
  };

  const isAdmin = user && isAdminEmail(user.email);

  return {
    user,
    isLoading,
    subjects,
    viewMode,
    setViewMode,
    focusDate,
    setFocusDate,
    selectedDate,
    setSelectedDate,
    columns,
    homeworkWithStatus: filteredHomework,
    activeHomework,
    openHomework,
    closeHomework,
    toggleComplete,
    uploadOrReplaceProof,
    shareText,
    setShareText,
    handleShareSubmission,
    memoizedHomeworkAttachments,
    getFinishedUsers,
    comments,
    commentText,
    setCommentText,
    confirmModal,
    setConfirmModal,
    notification,
    uploadQueue,
    setUploadQueue,
    commandOpen,
    setCommandOpen,
    searchQuery,
    setSearchQuery,
    previewItem,
    setPreviewItem,
    isAdmin,
    handleLoginSuccess,
    handleLogout,
  };
}
