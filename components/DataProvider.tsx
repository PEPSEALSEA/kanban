'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

import { API_URL } from '@/lib/config';

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

type DataContextType = {
  allHomework: Homework[];
  allUsers: UserInfo[];
  allProgress: ProgressItem[];
  learningContent: LearningContent[];
  subjects: Subject[];
  analytics: any[];
  user: UserInfo | null;
  setUser: (user: UserInfo | null) => void;
  isLoading: boolean;
  isSyncing: boolean;
  refreshData: () => Promise<void>;
  logEvent: (eventType: string) => void;
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
        setAnalytics(parsed.analytics || []);
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
      const res = await fetch(`${GAS_WEB_APP_URL}?action=batchData`);
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
        setAnalytics(payload.analytics || []);
        
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
  }, []);

  const logEvent = useCallback((eventType: string) => {
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

      fetch(GAS_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "logAnalytics",
          event_type: eventType,
          device_name,
          browser,
          email
        })
      }).catch(e => console.error("Analytics error", e));
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refreshData();
    // Auto-refresh every 5 minutes in background
    const interval = setInterval(refreshData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshData]);

  return (
    <DataContext.Provider value={{
      allHomework,
      allUsers,
      allProgress,
      learningContent,
      subjects,
      analytics,
      user,
      setUser,
      isLoading,
      isSyncing,
      refreshData,
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
