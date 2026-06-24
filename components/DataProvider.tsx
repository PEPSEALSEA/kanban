'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import { API_URL } from '@/lib/config';
import { isAdminEmail } from '@/lib/admin';

export const GAS_WEB_APP_URL = API_URL;

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
  updated_at?: string;
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

type LearningContent = {
  id: string;
  date: string;
  subject: string;
  title: string;
  description: string;
  audio_file_id: string;
  audio_url: string;
  attachments: string;
  links: string;
};
 
type Subject = {
  id: string;
  name: string;
  color: string;
};

export type AnalyticsIpNoteRow = {
  ip_address: string;
  name: string;
  note: string;
  updated_at: string;
  updated_by: string;
};

type DataContextType = {
  allHomework: Homework[];
  allUsers: UserInfo[];
  allProgress: ProgressItem[];
  learningContent: LearningContent[];
  subjects: Subject[];
  analytics: any[];
  analyticsIpNotes: AnalyticsIpNoteRow[];
  audioPermissions: string[];
  canAccessAudio: boolean;
  user: UserInfo | null;
  setUser: (user: UserInfo | null) => void;
  isLoading: boolean;
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  saveAnalyticsIpNote: (ip: string, name: string, note: string) => Promise<void>;
  logEvent: (eventType: string, extraData?: {
    page_visited?: string;
    content_id?: string;
    session_id?: string;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }) => void;
  error: string | null;
};

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [allHomework, setAllHomework] = useState<Homework[]>([]);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [allProgress, setAllProgress] = useState<ProgressItem[]>([]);
  const [learningContent, setLearningContent] = useState<LearningContent[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [analytics, setAnalytics] = useState<any[]>([]);
  const [analyticsIpNotes, setAnalyticsIpNotes] = useState<AnalyticsIpNoteRow[]>([]);
  const [audioPermissions, setAudioPermissions] = useState<string[]>([]);
  const [audioAccessGranted, setAudioAccessGranted] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize user from localStorage
  useEffect(() => {
    const savedUser = localStorage.getItem('homework_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
    
    // Load cached data for instant UI
    const cachedData = localStorage.getItem('studyflow_cache');
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        setAllHomework(parsed.homework || []);
        setAllUsers(parsed.users || []);
        setAllProgress(parsed.progress || []);
        setLearningContent(parsed.learningContent || []);
        setSubjects(parsed.subjects || []);
        setAnalytics((parsed.analytics || []).filter((a: { email?: string }) => !isAdminEmail(a.email)));
        setAnalyticsIpNotes(parsed.analyticsIpNotes || []);
        setAudioPermissions(parsed.audioPermissions || []);
        setAudioAccessGranted(Boolean(parsed.audioAccessGranted));
        setIsLoading(false); // We have cached data, so we can hide initial loader early
      } catch (e) {
        console.error("Cache parsing failed", e);
      }
    }
  }, []);

  const refreshData = useCallback(async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const email =
        user?.email ||
        (typeof window !== 'undefined' && localStorage.getItem('homework_user')
          ? JSON.parse(localStorage.getItem('homework_user')!).email
          : '');
      const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';
      const res = await fetch(`${GAS_WEB_APP_URL}?action=batchData${emailParam}`);
      if (!res.ok) throw new Error("Cloud synchronization failed");
      const data = (await res.json()) as any;
      
      if (data.success) {
        const payload = data.data;
        if (!payload) throw new Error("API returned success but no data payload");
        
        setAllHomework(payload.homework || []);
        setAllUsers(payload.users || []);
        setAllProgress(payload.progress || []);
        setLearningContent(payload.learningContent || []);
        setSubjects(payload.subjects || []);
        setAnalytics((payload.analytics || []).filter((a: { email?: string }) => !isAdminEmail(a.email)));
        setAnalyticsIpNotes(payload.analyticsIpNotes || []);
        setAudioPermissions(payload.audioPermissions || []);
        setAudioAccessGranted(Boolean(payload.audioAccessGranted));
        
        // Update cache
        localStorage.setItem('studyflow_cache', JSON.stringify(payload));
      } else {
        throw new Error(data.error || "Failed to load data");
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message);
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [user?.email]);

  const saveAnalyticsIpNote = useCallback(async (ip: string, name: string, note: string) => {
    const adminEmail =
      user?.email ||
      (typeof window !== 'undefined' && localStorage.getItem('homework_user')
        ? JSON.parse(localStorage.getItem('homework_user')!).email
        : '');
    if (!isAdminEmail(adminEmail)) {
      throw new Error('Admin access required');
    }

    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveAnalyticsIpNote',
        admin_email: adminEmail,
        ip_address: ip,
        name,
        note,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to save IP note');

    const saved = data.data as AnalyticsIpNoteRow & { deleted?: boolean };
    setAnalyticsIpNotes((prev) => {
      const next = prev.filter((row) => row.ip_address !== ip);
      if (!saved?.deleted && saved?.ip_address) {
        next.push({
          ip_address: saved.ip_address,
          name: saved.name || '',
          note: saved.note || '',
          updated_at: saved.updated_at || new Date().toISOString(),
          updated_by: saved.updated_by || adminEmail,
        });
      }
      return next;
    });

    const cached = localStorage.getItem('studyflow_cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        const rows = (parsed.analyticsIpNotes || []).filter((row: AnalyticsIpNoteRow) => row.ip_address !== ip);
        if (!saved?.deleted && saved?.ip_address) {
          rows.push({
            ip_address: saved.ip_address,
            name: saved.name || '',
            note: saved.note || '',
            updated_at: saved.updated_at || new Date().toISOString(),
            updated_by: saved.updated_by || adminEmail,
          });
        }
        parsed.analyticsIpNotes = rows;
        localStorage.setItem('studyflow_cache', JSON.stringify(parsed));
      } catch {
        // ignore cache update errors
      }
    }
  }, [user]);

  const logEvent = useCallback((eventType: string, extraData?: {
    page_visited?: string;
    content_id?: string;
    session_id?: string;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }) => {
    try {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const isTablet = /Tablet|iPad/i.test(navigator.userAgent);
      let device_name = "Desktop";
      if (isMobile) device_name = "Mobile";
      if (isTablet) device_name = "Tablet";

      let browser = "Unknown";
      const ua = navigator.userAgent;
      if (ua.includes("Chrome")) browser = "Chrome";
      else if (ua.includes("Firefox")) browser = "Firefox";
      else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
      else if (ua.includes("Edge")) browser = "Edge";

      const email = localStorage.getItem('homework_user') ? JSON.parse(localStorage.getItem('homework_user')!).email : "";
      if (isAdminEmail(email)) return;

      // Browser fingerprinting
      const screenRes = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
      const os = navigator.platform;
      const language = navigator.language;
      const cpu = navigator.hardwareConcurrency || "unknown";
      
      let webgl = "unknown";
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) webgl = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        }
      } catch (e) {}

      const fingerprint = JSON.stringify({
        screenRes,
        os,
        language,
        cpu,
        webgl,
        userAgent: navigator.userAgent
      });

      fetch(GAS_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "logAnalytics",
          event_type: eventType,
          device_name,
          browser,
          email,
          page_visited: extraData?.page_visited || window.location.href,
          content_id: extraData?.content_id || "",
          fingerprint,
          session_id: extraData?.session_id || "",
          metadata: extraData?.metadata ? JSON.stringify(extraData.metadata) : "",
        })
      }).catch(e => console.error("Analytics error", e));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshData]);

  const userCanAccessAudio = audioAccessGranted;

  return (
    <DataContext.Provider value={{
      allHomework,
      allUsers,
      allProgress,
      learningContent,
      subjects,
      analytics,
      analyticsIpNotes,
      audioPermissions,
      canAccessAudio: userCanAccessAudio,
      user,
      setUser,
      isLoading,
      isSyncing,
      refreshData,
      saveAnalyticsIpNote,
      logEvent,
      error
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
