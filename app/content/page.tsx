'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/components/DataProvider';
import AttachmentList from '@/components/AttachmentList';
import AudioPlayer from '@/components/AudioPlayer';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

import { API_URL } from '@/lib/config';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = API_URL;
const SUBJECT_COLORS: Record<string, string> = {
  'Math': '#6366f1',
  'Science': '#10b981',
  'History': '#f59e0b',
  'English': '#f43f5e',
  'Arts': '#ec4899',
  'Computer': '#8b5cf6',
  'Other': '#94a3b8'
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

export default function LearningContentPage() {
  const { 
    learningContent, 
    subjects,
    isLoading, 
    error, 
    refreshData 
  } = useData();

  const [view, setView] = useState<'calendar' | 'detail'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<LearningContent | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [mounted, setMounted] = useState(false);
  const { isMobile, isTablet } = useDeviceDetection();

  // --- HASH ROUTING ---
  const handleHashChange = useCallback(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/view')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      const id = params.get('id');
      if (id) {
        const found = learningContent.find((c: LearningContent) => c.id === id);
        if (found) {
          setActiveContent(found);
          setView('detail');
          return;
        }
      }
    }
    setView('calendar');
    setActiveContent(null);
  }, [learningContent]);

  useEffect(() => {
    setMounted(true);
  }, []); 

  useEffect(() => {
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

  // --- CALENDAR LOGIC ---
  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ day: prevMonthDays - i, month: month - 1, year, isCurrent: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      days.push({ day: i, month, year, isCurrent: true });
    }
    const remain = 42 - days.length;
    for (let i = 1; i <= remain; i++) {
      days.push({ day: i, month: month + 1, year, isCurrent: false });
    }
    return days;
  }, [currentMonth]);

  const getContentsForDate = (day: number, month: number, year: number) => {
    const d = new Date(year, month, day);
    return learningContent.filter((c: LearningContent) => {
      const itemDate = new Date(c.date);
      return itemDate.getFullYear() === d.getFullYear() &&
             itemDate.getMonth() === d.getMonth() &&
             itemDate.getDate() === d.getDate();
    });
  };
  const dynamicSubjectColors = useMemo(() => {
    const map: Record<string, string> = { ...SUBJECT_COLORS };
    subjects.forEach(s => {
      if (s.name && s.color) map[s.name] = s.color;
    });
    return map;
  }, [subjects]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim() && selectedSubject === 'All') return [];
    
    const term = searchTerm.toLowerCase().trim();
    return learningContent.filter((c: LearningContent) => {
      const matchesSearch = !term || 
        c.title.toLowerCase().includes(term) || 
        c.subject.toLowerCase().includes(term) || 
        c.id.toLowerCase().includes(term) ||
        c.description.toLowerCase().includes(term);
        
      const matchesSubject = selectedSubject === 'All' || c.subject.trim() === selectedSubject.trim();
      
      return matchesSearch && matchesSubject;
    }).sort((a, b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateB - dateA; // Newest first

      const subA = (a.subject || '').toLowerCase();
      const subB = (b.subject || '').toLowerCase();
      if (subA !== subB) return subA.localeCompare(subB, 'th');

      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }, [learningContent, searchTerm, selectedSubject]);

  // --- PARSER LOGIC ---
  const parseDescription = (desc: string) => {
    const regex = /\[Card\s*(\d+):\s*([\s\S]*?)\]/g;
    const cards: { num: string; text: string }[] = [];
    let match;
    let intro = desc;

    // Extract all {N Text} patterns
    const matches = Array.from(desc.matchAll(regex));
    if (matches.length > 0) {
      // Find the first index of a match to get the intro
      const firstMatchIndex = desc.indexOf(matches[0][0]);
      intro = desc.substring(0, firstMatchIndex).trim();
      
      matches.forEach(m => {
        cards.push({ num: m[1], text: m[2].trim() });
      });
    }

    return { intro, cards };
  };

  const memoizedAttachments = useMemo(() => {
    if (!activeContent) return [];

    const parseItem = (url: string) => {
      const parts = url.split('#');
      const decodedUrl = parts[0];
      let title = 'Attachment';
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

    const items = [
      ...(activeContent.links ? activeContent.links.split(',').filter(Boolean).map((link, idx) => ({
        type: 'link_work' as const,
        url: link.trim(),
        title: `External Link ${idx + 1}`
      })) : []),
      ...(activeContent.attachments ? activeContent.attachments.split(',').filter(Boolean).map(parseItem) : [])
    ];
    return items;
  }, [activeContent?.id, activeContent?.links, activeContent?.attachments]);

  const memoizedAudioProps = useMemo(() => {
    if (!activeContent) return null;
    return {
      url: activeContent.audio_url?.replace(/[{}]/g, '').split('#')[0].trim(),
      fileId: activeContent.audio_file_id?.replace(/[{}]/g, '').split('#')[0].trim(),
      title: activeContent.title
    };
  }, [activeContent?.id, activeContent?.audio_url, activeContent?.audio_file_id, activeContent?.title]);

  if (view === 'detail' && activeContent) {
    const { intro, cards } = parseDescription(activeContent.description);
    return (
      <div className="p-4 md:p-10 max-w-4xl mx-auto">
        <button 
          onClick={() => window.location.hash = ''} 
          className="neo-button px-6 py-2 mb-10 flex items-center gap-2"
        >
          ← BACK
        </button>

        <div className="neo-card p-6 md:p-12">
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <span 
              className="text-xs font-black uppercase px-3 py-1 border-2 border-black shadow-[2px_2px_0px_0px_#000]" 
              style={{ backgroundColor: dynamicSubjectColors[activeContent.subject] || dynamicSubjectColors['Other'] }}
            >
              {activeContent.subject}
            </span>
            <span className="text-sm font-black uppercase text-gray-400">
              {mounted && new Date(activeContent.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black mb-10 uppercase tracking-tighter leading-none border-b-8 border-black pb-4">
            {activeContent.title}
          </h1>

          {/* Audio Player */}
          {memoizedAudioProps && (memoizedAudioProps.url || memoizedAudioProps.fileId) && (
            <div className="mb-10">
              <AudioPlayer 
                contentId={activeContent.id}
                contentType="learning_content"
                audioUrl={memoizedAudioProps.url}
                driveId={memoizedAudioProps.fileId}
                title={memoizedAudioProps.title}
              />
            </div>
          )}

          {/* Attachments via AttachmentList */}
          {(activeContent.links || activeContent.attachments) && (
            <div className="mb-8">
              <AttachmentList 
                contentId={activeContent.id}
                contentType="learning_content"
                attachments={memoizedAttachments} 
              />
            </div>
          )}

          {/* Intro Text */}
          {intro && (
            <div className="bg-sky-50 border-3 border-black p-6 md:p-10 shadow-[6px_6px_0px_0px_#000] leading-relaxed mb-12">
              <MarkdownRenderer content={intro} />
            </div>
          )}

          {/* Cards Section */}
          {cards.length > 0 && (
            <div className="flex flex-col gap-8">
              {cards.map((card, idx) => (
                <div key={idx} className="split-card">
                  <div className="split-number">{card.num}</div>
                  <div className="text-lg font-black leading-relaxed">
                    <MarkdownRenderer content={card.text} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-10 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic border-b-8 border-black inline-block mb-2">
            คลังเนื้อหาการเรียน
          </h1>
          <p className="text-sm font-black uppercase text-gray-500">Learning Content Archive</p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-4 mb-10">
        <div className="flex-1 bg-white border-4 border-black p-4 shadow-[6px_6px_0px_0px_#000] flex items-center gap-4">
          <span className="text-2xl">🔍</span>
          <input 
            type="text" 
            placeholder="ค้นหาด้วย ID, วิชา หรือชื่อเรื่อง..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-black font-black placeholder:text-gray-400 text-lg"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="neo-button w-8 h-8 flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>

        <div className="bg-white border-4 border-black p-4 shadow-[6px_6px_0px_0px_#000] flex items-center gap-4 min-w-[240px]">
          <span className="text-2xl">📚</span>
          <select 
            value={selectedSubject} 
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-black font-black text-lg cursor-pointer"
          >
            <option value="All">ทุกวิชา (ALL)</option>
            {subjects.map(s => (
              <option key={s.id} value={s.name}>{s.name.toUpperCase()}</option>
            ))}
          </select>
        </div>
      </div>

      {searchTerm.trim() || selectedSubject !== 'All' ? (
        <div className="animate-slide-up">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black uppercase">ผลการค้นหา ({searchResults.length})</h2>
            <button onClick={() => { setSearchTerm(''); setSelectedSubject('All'); }} className="text-black font-black border-b-4 border-black hover:bg-yellow-300">CLEAR ALL</button>
          </div>
          
          <div className="flex flex-col gap-4">
            {searchResults.length > 0 ? (
              searchResults.map((c: LearningContent) => (
                <button 
                  key={c.id} 
                  onClick={() => { window.location.hash = `#/view?id=${c.id}`; setSearchTerm(''); setSelectedSubject('All'); }}
                  className="neo-card w-full p-6 text-left flex items-center gap-6"
                >
                  <div 
                    className="w-16 h-16 border-4 border-black flex items-center justify-center font-black text-xl shadow-[2px_2px_0px_0px_#000]"
                    style={{ backgroundColor: dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'] }}
                  >
                    {c.subject.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-2 items-center mb-1">
                      <span className="text-xs font-black bg-black text-white px-2 py-0.5">{c.id}</span>
                      <span className="text-xs font-black uppercase" style={{ color: dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'] }}>{c.subject}</span>
                    </div>
                    <div className="text-xl font-black uppercase leading-tight">{c.title}</div>
                    <div className="text-xs font-bold text-gray-500 mt-1">{new Date(c.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <span className="text-3xl font-black">→</span>
                </button>
              ))
            ) : (
              <div className="neo-card p-20 text-center">
                <div className="text-6xl mb-4">🔍</div>
                <div className="text-xl font-black uppercase">ไม่พบข้อมูลที่ตรงกับการค้นหา</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="neo-card p-6 md:p-10">
        {/* Calendar Nav */}
        <div className="flex justify-between items-center mb-10">
          <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">
            {mounted && currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="neo-button w-12 h-12 flex items-center justify-center text-xl">←</button>
            <button onClick={() => setCurrentMonth(new Date())} className="neo-button px-6 font-black uppercase">Today</button>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="neo-button w-12 h-12 flex items-center justify-center text-xl">→</button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="calendar-grid">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
            <div key={d} className="p-4 text-center text-xs font-black bg-sky-100 border-b-2 border-black">{d}</div>
          ))}
          {daysInMonth.map((d, i) => {
            const dateContents = getContentsForDate(d.day, d.month, d.year);
            const isToday = mounted && new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
            
            return (
              <div 
                key={i} 
                className={`calendar-day ${d.isCurrent ? '' : 'not-current'} ${isToday ? 'today' : ''}`}
                onClick={() => dateContents.length > 0 && setSelectedDate(new Date(d.year, d.month, d.day).toISOString())}
              >
                <div className="text-sm font-black">{d.day}</div>
                <div className="flex flex-wrap gap-1">
                  {dateContents.map((c: LearningContent, ci: number) => (
                  <span 
                    key={ci}
                    className="w-4 h-4 border-2 border-black shadow-[1px_1px_0px_0px_#000]" 
                    style={{ background: dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'] }} 
                    title={c.title} 
                  />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

      {/* Date Overview Modal */}
      {selectedDate && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSelectedDate(null)}
        >
          <div 
            className="glass animate-scale-in" 
            style={{ width: '90%', maxWidth: '400px', padding: isMobile ? '1.5rem' : '2rem', borderRadius: isMobile ? '1.5rem' : '2rem' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: '1.5rem', fontWeight: 800 }}>
              {mounted && new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {getContentsForDate(new Date(selectedDate).getDate(), new Date(selectedDate).getMonth(), new Date(selectedDate).getFullYear()).map((c: LearningContent) => (
                <button 
                  key={c.id} 
                  onClick={() => { window.location.hash = `#/view?id=${c.id}`; setSelectedDate(null); }}
                  style={{ 
                    width: '100%', 
                    padding: '1rem', 
                    background: 'rgba(255,255,255,0.05)', 
                    border: '1px solid rgba(255,255,255,0.1)', 
                    borderRadius: '1rem', 
                    color: '#fff', 
                    textAlign: 'left', 
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'] }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{c.title}</div>
                    <div style={{ fontSize: '0.7rem', opacity: 0.5 }}>{c.subject}</div>
                  </div>
                  <span>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '2rem', marginTop: '2rem', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--accent)', borderRadius: '1.5rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent)', fontWeight: 700, marginBottom: '1rem' }}>⚠️ {error}</p>
          <button onClick={refreshData} className="glass" style={{ padding: '0.5rem 1rem', borderRadius: '0.75rem', border: 'none', color: '#fff', cursor: 'pointer' }}>
            Retry Loading
          </button>
        </div>
      )}

      {isLoading && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(10px)' }}>
          <div className="loader" style={{ marginBottom: '1rem' }}></div>
          <p style={{ fontWeight: 600 }}>Loading Archive...</p>
        </div>
      )}
    </div>
  );
}
