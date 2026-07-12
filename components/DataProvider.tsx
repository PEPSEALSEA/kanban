'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

import { API_URL } from '@/lib/config';
import { isAdminEmail } from '@/lib/admin';
import { authHeaders, getIdToken } from '@/lib/auth';
import type { AiChatLog } from '@/lib/geminiChat';

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
  has_audio?: string;
  attachments: string;
  links: string;
  is_private?: string;
};

function isSheetTruthy(v?: string) {
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

function stripCachedAudioFields(content: LearningContent[]): LearningContent[] {
  return content.map((item) => ({ ...item, audio_url: '', audio_file_id: '' }));
}

function stripPrivateContent(content: LearningContent[], userEmail?: string | null): LearningContent[] {
  if (userEmail && isAdminEmail(userEmail)) return content;
  return content.filter((item) => !isSheetTruthy(item.is_private));
}
 
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
  aiChatLogs: AiChatLog[];
  audioPermissions: string[];
  canAccessAudio: boolean;
  user: UserInfo | null;
  setUser: (user: UserInfo | null) => void;
  isLoading: boolean;
  isSyncing: boolean;
  readyForAutoLogin: boolean;
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
  const [aiChatLogs, setAiChatLogs] = useState<AiChatLog[]>([]);
  const [audioPermissions, setAudioPermissions] = useState<string[]>([]);
  const [audioAccessGranted, setAudioAccessGranted] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [readyForAutoLogin, setReadyForAutoLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  // Restore user only when a valid Google ID token exists (localStorage).
  // homework_user alone is not enough — token expires after ~55 minutes.
  useEffect(() => {
    const token = getIdToken();
    const savedUser = localStorage.getItem('homework_user');

    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    } else if (savedUser && !token) {
      localStorage.removeItem('homework_user');
    }

    const cachedData = localStorage.getItem('studyflow_cache');
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        const hasAuth = Boolean(token);
        const cachedUser = savedUser && token ? JSON.parse(savedUser) : null;
        const cachedContent = hasAuth ? (parsed.learningContent || []) : stripCachedAudioFields(parsed.learningContent || []);
        setAllHomework(parsed.homework || []);
        setAllUsers(parsed.users || []);
        setAllProgress(parsed.progress || []);
        setLearningContent(stripPrivateContent(cachedContent, cachedUser?.email));
        setSubjects(parsed.subjects || []);
        setAnalytics([]);
        setAnalyticsIpNotes([]);
        setAiChatLogs(parsed.aiChatLogs || []);
        setAudioPermissions(hasAuth ? (parsed.audioPermissions || []) : []);
        setAudioAccessGranted(hasAuth && Boolean(parsed.audioAccessGranted));
      } catch (e) {
        console.error("Cache parsing failed", e);
      }
    }
    setIsLoading(false);
  }, []);

  const refreshData = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const run = (async () => {
      setIsSyncing(true);
      setError(null);
      try {
        const res = await fetch(`${GAS_WEB_APP_URL}?action=batchData`, { headers: authHeaders() });
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
          setAnalytics([]);
          setAnalyticsIpNotes(payload.analyticsIpNotes || []);
          setAiChatLogs(payload.aiChatLogs || []);
          setAudioPermissions(payload.audioPermissions || []);
          setAudioAccessGranted(Boolean(payload.audioAccessGranted));

          const cachePayload = {
            ...payload,
            analytics: [],
            analyticsIpNotes: payload.analyticsIpNotes || [],
          };
          localStorage.setItem('studyflow_cache', JSON.stringify(cachePayload));
        } else {
          throw new Error(data.error || "Failed to load data");
        }
      } catch (e: any) {
        console.error(e);
        setError(e.message);
      } finally {
        setIsLoading(false);
        setIsSyncing(false);
        setReadyForAutoLogin(true);
        refreshInFlightRef.current = null;
      }
    })();

    refreshInFlightRef.current = run;
    return run;
  }, []);

  const saveAnalyticsIpNote = useCallback(async (ip: string, name: string, note: string) => {
    const res = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({
        action: 'saveAnalyticsIpNote',
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
          updated_by: saved.updated_by || '',
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
            updated_by: saved.updated_by || '',
          });
        }
        parsed.analyticsIpNotes = rows;
        localStorage.setItem('studyflow_cache', JSON.stringify(parsed));
      } catch {
        // ignore cache update errors
      }
    }
  }, []);

  const logEvent = useCallback((eventType: string, extraData?: {
    page_visited?: string;
    content_id?: string;
    session_id?: string;
    metadata?: Record<string, string | number | boolean | null | undefined>;
  }) => {
    try {
      const VISITOR_KEY = 'analytics_visitor_id';
      let visitorId = localStorage.getItem(VISITOR_KEY);
      if (!visitorId) {
        visitorId = `vis_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem(VISITOR_KEY, visitorId);
      }
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
          visitor_id: visitorId,
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
      aiChatLogs,
      audioPermissions,
      canAccessAudio: userCanAccessAudio,
      user,
      setUser,
      isLoading,
      isSyncing,
      readyForAutoLogin,
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
