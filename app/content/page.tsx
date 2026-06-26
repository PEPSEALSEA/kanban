'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useData } from '@/components/DataProvider';
import AttachmentList from '@/components/AttachmentList';
import AudioPlayer from '@/components/AudioPlayer';
import ContentExportImageModal from '@/components/ContentExportImageModal';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import ResizableContentPanel from '@/components/ResizableContentPanel';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

import { parseAudioItems } from '@/lib/audioItems';
import { getContentTxtUrl } from '@/lib/contentJsonUrl';
import { parseContentDescription } from '@/lib/parseContentDescription';
import { subjectBadgeStyle } from '@/lib/colors';

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
    refreshData,
    logEvent
  } = useData();

  const [view, setView] = useState<'calendar' | 'detail'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<LearningContent | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [mounted, setMounted] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [copiedAiLink, setCopiedAiLink] = useState(false);
  const { isMobile } = useDeviceDetection();

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
          logEvent('check_content', { content_id: id });
          setView('detail');
          return;
        }
      }
    }
    setView('calendar');
    setActiveContent(null);
    setIsExportOpen(false);
  }, [learningContent, logEvent]);

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

  const memoizedAudioList = useMemo(() => {
    if (!activeContent) return [];
    return parseAudioItems(activeContent.audio_url, activeContent.audio_file_id);
  }, [activeContent?.id, activeContent?.audio_url, activeContent?.audio_file_id]);

  const selectedDateContents = useMemo(() => {
    if (!selectedDate) return [];
    const d = new Date(selectedDate);
    return getContentsForDate(d.getDate(), d.getMonth(), d.getFullYear());
  }, [selectedDate, learningContent]);

  const detailParsed = useMemo(() => {
    if (!activeContent) return { intro: '', cards: [] as { num: string; text: string }[] };
    return parseContentDescription(activeContent.description);
  }, [activeContent?.description]);

  const isSearching = searchTerm.trim() || selectedSubject !== 'All';
  const getContentHref = useCallback((id: string) => `#/view?id=${encodeURIComponent(id)}`, []);

  const copyAiLink = useCallback(async (id: string) => {
    const url = getContentTxtUrl(id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAiLink(true);
      window.setTimeout(() => setCopiedAiLink(false), 2000);
    } catch {
      window.prompt('Copy this link for AI:', url);
    }
  }, []);

  const handleContentLinkClick = useCallback((
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
    options?: { closeDateModal?: boolean; clearFilters?: boolean }
  ) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    window.location.hash = getContentHref(id);
    if (options?.clearFilters) {
      setSearchTerm('');
      setSelectedSubject('All');
    }
    if (options?.closeDateModal) {
      setSelectedDate(null);
    }
  }, [getContentHref]);

  return (
    <ResizableContentPanel
      storageKey={view === 'detail' ? 'content_detail_width' : 'content_archive_width'}
      defaultWidth={view === 'detail' ? 896 : 1280}
      minWidth={view === 'detail' ? 400 : 480}
      maxWidth={view === 'detail' ? 1200 : 1600}
      enabled={!isMobile}
      className="p-4 md:p-10"
    >
      <AnimatePresence mode="wait">
        {view === 'detail' && activeContent ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <div className="mb-10 flex items-center justify-between gap-3 flex-wrap">
              <motion.button
                onClick={() => { window.location.hash = ''; }}
                className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors flex items-center gap-2"
                whileHover={{ x: -4 }}
                transition={{ duration: 0.15 }}
              >
                ← BACK TO ARCHIVE
              </motion.button>
              <div className="flex items-center gap-2 flex-wrap">
                <motion.button
                  type="button"
                  onClick={() => copyAiLink(activeContent.id)}
                  className="neo-button px-4 py-2 text-xs"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {copiedAiLink ? 'Copied AI Link' : 'Copy AI Link'}
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setIsExportOpen(true)}
                  className="neo-button px-4 py-2 text-xs"
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Export as PNG
                </motion.button>
              </div>
            </div>

            <motion.div
              className="neo-card p-8 md:p-14 shadow-2xl border-none rounded-3xl relative max-h-[calc(100vh-6rem)] overflow-y-auto"
              initial={{ opacity: 0, scale: 0.98, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            >
              <div className="flex flex-wrap items-center gap-4 mb-8">
                <span
                  className="text-[10px] font-bold uppercase px-3 py-1 rounded-full"
                  style={subjectBadgeStyle(dynamicSubjectColors[activeContent.subject] || dynamicSubjectColors['Other'], '15')}
                >
                  {activeContent.subject}
                </span>
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {mounted && new Date(activeContent.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>

              <h1 className="text-3xl md:text-4xl font-bold mb-12 tracking-tight text-slate-800 leading-tight">
                {activeContent.title}
              </h1>

              {memoizedAudioList.length > 0 && (
                <motion.div
                  className="mb-10 flex flex-col gap-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                >
                  {memoizedAudioList.map((audio, idx) => (
                    <AudioPlayer
                      key={audio.fileId || idx}
                      contentId={`${activeContent.id}_${audio.fileId || idx}`}
                      contentType="learning_content"
                      audioUrl={audio.url}
                      driveId={audio.fileId}
                      title={memoizedAudioList.length > 1 ? audio.filename : activeContent.title}
                    />
                  ))}
                </motion.div>
              )}

              {(activeContent.links || activeContent.attachments) && (
                <motion.div
                  className="mb-8"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                >
                  <AttachmentList
                    contentId={activeContent.id}
                    contentType="learning_content"
                    attachments={memoizedAttachments}
                  />
                </motion.div>
              )}

              {detailParsed.intro && (
                <motion.div
                  className="bg-slate-50/50 rounded-2xl border border-slate-100 p-8 md:p-10 leading-relaxed mb-12 text-slate-700"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <MarkdownRenderer content={detailParsed.intro} />
                </motion.div>
              )}

              {detailParsed.cards.length > 0 && (
                <div className="flex flex-col gap-8">
                  {detailParsed.cards.map((card, idx) => (
                    <motion.div
                      key={idx}
                      className="split-card"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + idx * 0.06, duration: 0.35 }}
                      whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)' }}
                    >
                      <div className="split-number">{card.num}</div>
                      <div className="text-lg font-black leading-relaxed">
                        <MarkdownRenderer content={card.text} />
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : (
          <motion.div
            key="archive"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
          >
            <motion.header
              className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-800 mb-2">
                  Learning Archive
                </h1>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">คลังเนื้อหาการเรียน</p>
              </div>
            </motion.header>

            <motion.div
              className="flex flex-col md:flex-row gap-4 mb-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05, duration: 0.3 }}
            >
              <div className="flex-1 bg-white/60 backdrop-blur-md border border-slate-200/80 p-4 rounded-2xl shadow-sm flex items-center gap-4">
                <span className="text-xl">🔍</span>
                <input
                  type="text"
                  placeholder="Search by ID, subject, or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-slate-700 font-medium placeholder:text-slate-300 text-lg"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="text-slate-300 hover:text-slate-500 transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="bg-white/60 backdrop-blur-md border border-slate-200/80 p-4 rounded-2xl shadow-sm flex items-center gap-4 min-w-[240px]">
                <span className="text-xl">📚</span>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="flex-1 bg-transparent border-none outline-none text-slate-700 font-bold text-md cursor-pointer"
                >
                  <option value="All">All Subjects</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.name}>{s.name.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {isSearching ? (
                <motion.div
                  key="search"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="neo-card p-6 md:p-8">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider">Search Results ({searchResults.length})</h2>
                      <button onClick={() => { setSearchTerm(''); setSelectedSubject('All'); }} className="text-xs font-bold text-sky-600 hover:text-sky-700">CLEAR FILTERS</button>
                    </div>

                    <div className="space-y-3 max-h-[calc(100vh-22rem)] overflow-y-auto pr-1 -mr-1">
                    {searchResults.length > 0 ? (
                      searchResults.map((c: LearningContent, idx) => (
                        <motion.a
                          key={c.id}
                          href={getContentHref(c.id)}
                          onClick={(e) => handleContentLinkClick(e, c.id, { clearFilters: true })}
                          className="card w-full p-5 md:p-6 text-left flex items-center gap-4 md:gap-6 group shrink-0"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.04, duration: 0.25 }}
                          whileHover={{ y: -2, boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.01)', borderColor: '#e2e8f0' }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg"
                            style={subjectBadgeStyle(dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'], '15')}
                          >
                            {c.subject.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap gap-2 items-center mb-1.5">
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md shrink-0">{c.id}</span>
                              <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'] }}>{c.subject}</span>
                            </div>
                            <div className="text-base md:text-lg font-semibold text-slate-800 leading-snug">{c.title}</div>
                            <div className="text-[11px] font-medium text-slate-400 mt-1.5">{new Date(c.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                          </div>
                          <span className="text-slate-300 group-hover:text-sky-500 transition-colors">→</span>
                        </motion.a>
                      ))
                    ) : (
                      <motion.div
                        className="neo-card p-20 text-center"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                      >
                        <div className="text-6xl mb-4">🔍</div>
                        <div className="text-xl font-black uppercase">ไม่พบข้อมูลที่ตรงกับการค้นหา</div>
                      </motion.div>
                    )}
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="calendar"
                  className="neo-card p-6 md:p-10"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex justify-between items-center mb-10">
                    <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-700">
                      {mounted && currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="flex gap-2 bg-white/50 p-1 rounded-xl border border-slate-200/60 shadow-sm">
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors text-lg">←</button>
                      <button onClick={() => setCurrentMonth(new Date())} className="px-4 text-[10px] font-bold uppercase tracking-widest text-sky-600 hover:text-sky-700">Today</button>
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors text-lg">→</button>
                    </div>
                  </div>

                  <div className="calendar-grid">
                    {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                      <div key={d} className="p-4 text-center text-xs font-black bg-sky-100 border-b-2 border-black">{d}</div>
                    ))}
                    {daysInMonth.map((d, i) => {
                      const dateContents = getContentsForDate(d.day, d.month, d.year);
                      const isToday = mounted && new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
                      const hasContent = dateContents.length > 0;

                      return (
                        <motion.div
                          key={i}
                          className={`calendar-day ${d.isCurrent ? '' : 'not-current'} ${isToday ? 'today' : ''} ${hasContent ? 'cursor-pointer' : ''}`}
                          onClick={() => hasContent && setSelectedDate(new Date(d.year, d.month, d.day).toISOString())}
                          whileHover={hasContent ? { scale: 1.03, backgroundColor: 'var(--bg-yellow-300)' } : undefined}
                          whileTap={hasContent ? { scale: 0.97 } : undefined}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="text-sm font-black">{d.day}</div>
                          <div className="flex flex-wrap gap-1">
                            {dateContents.map((c: LearningContent, ci: number) => (
                              <motion.span
                                key={ci}
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ background: dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'] }}
                                title={c.title}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: ci * 0.05, type: 'spring', stiffness: 400, damping: 15 }}
                              />
                            ))}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
            onClick={() => setSelectedDate(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="neo-card w-full max-w-md p-6 md:p-8 shadow-2xl border-none rounded-3xl flex flex-col max-h-[85vh]"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4 shrink-0">
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-tight text-slate-800">
                    {mounted && new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}
                  </h3>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                    {selectedDateContents.length} เนื้อหา
                  </p>
                </div>
                <button
                  onClick={() => setSelectedDate(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto pr-2 min-h-0 flex-1">
                {selectedDateContents.map((c: LearningContent, idx) => (
                  <motion.a
                    key={c.id}
                    href={getContentHref(c.id)}
                    onClick={(e) => handleContentLinkClick(e, c.id, { closeDateModal: true })}
                    className="w-full p-4 bg-slate-50 hover:bg-slate-100 transition-all rounded-2xl flex items-center gap-4 text-left group shrink-0"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04, duration: 0.2 }}
                    whileHover={{ x: 4, backgroundColor: '#f1f5f9' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0" style={subjectBadgeStyle(dynamicSubjectColors[c.subject] || dynamicSubjectColors['Other'])}>
                      {c.subject.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-0.5 tracking-wider">{c.subject}</div>
                      <div className="font-semibold text-sm text-slate-800 leading-tight truncate">{c.title}</div>
                    </div>
                    <span className="text-slate-300 group-hover:text-sky-500 shrink-0">→</span>
                  </motion.a>
                ))}
              </div>

              {selectedDateContents.length > 5 && (
                <p className="text-[10px] font-medium text-slate-400 text-center mt-3 shrink-0">เลื่อนลงเพื่อดูทั้งหมด</p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <motion.div
          className="p-10 mt-10 neo-card bg-rose-50 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className="text-rose-500 font-black uppercase mb-6 tracking-widest">⚠️ {error}</p>
          <button onClick={refreshData} className="neo-button px-8 py-3">
            RETRY LOADING
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[2000] flex flex-col items-center justify-center"
          >
            <div className="loader mb-4" />
            <p className="font-black uppercase tracking-widest text-white text-xs">Loading Archive...</p>
          </motion.div>
        )}
      </AnimatePresence>

      {activeContent && (
        <ContentExportImageModal
          isOpen={isExportOpen}
          onClose={() => setIsExportOpen(false)}
          content={activeContent}
          parsed={detailParsed}
          subjectColors={dynamicSubjectColors}
          mounted={mounted}
        />
      )}
    </ResizableContentPanel>
  );
}
