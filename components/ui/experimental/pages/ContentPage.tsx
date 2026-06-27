'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AppShell from '@/components/ui/experimental/layout/AppShell';
import AttachmentList from '@/components/AttachmentList';
import AudioPlayer from '@/components/AudioPlayer';
import ContentExportImageModal from '@/components/ContentExportImageModal';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import { useData } from '@/components/DataProvider';
import { Badge, Button, Dialog, EmptyState, Input, Skeleton } from '@/components/ui/experimental/primitives';
import { parseAudioItems } from '@/lib/audioItems';
import { getContentTxtUrl } from '@/lib/contentJsonUrl';
import { parseContentDescription } from '@/lib/parseContentDescription';
import { getSubjectColor } from '@/hooks/kanban/useKanbanHome';

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

export default function ExperimentalContentPage() {
  const { learningContent, subjects, isLoading, logEvent } = useData();
  const [view, setView] = useState<'calendar' | 'detail'>('calendar');
  const [activeContent, setActiveContent] = useState<LearningContent | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [copiedAiLink, setCopiedAiLink] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const dynamicSubjectColors = useMemo(() => {
    const map: Record<string, string> = {};
    subjects.forEach((s) => {
      if (s.name && s.color) map[s.name] = s.color;
    });
    return map;
  }, [subjects]);

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
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [handleHashChange]);

  const daysInMonth = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const days: { day: number; month: number; year: number; isCurrent: boolean }[] = [];
    const prevMonthDays = new Date(year, month, 0).getDate();
    for (let i = firstDay - 1; i >= 0; i--) days.push({ day: prevMonthDays - i, month: month - 1, year, isCurrent: false });
    for (let i = 1; i <= totalDays; i++) days.push({ day: i, month, year, isCurrent: true });
    while (days.length < 42) days.push({ day: days.length - totalDays - firstDay + 1, month: month + 1, year, isCurrent: false });
    return days;
  }, [currentMonth]);

  const getContentsForDate = (day: number, month: number, year: number) =>
    learningContent.filter((c: LearningContent) => {
      const itemDate = new Date(c.date);
      const d = new Date(year, month, day);
      return itemDate.toDateString() === d.toDateString();
    });

  const searchResults = useMemo(() => {
    if (!searchTerm.trim() && selectedSubject === 'All') return [];
    const term = searchTerm.toLowerCase().trim();
    return learningContent
      .filter((c: LearningContent) => {
        const matchesSearch =
          !term ||
          c.title.toLowerCase().includes(term) ||
          c.subject.toLowerCase().includes(term) ||
          c.description.toLowerCase().includes(term);
        const matchesSubject = selectedSubject === 'All' || c.subject.trim() === selectedSubject.trim();
        return matchesSearch && matchesSubject;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [learningContent, searchTerm, selectedSubject]);

  const memoizedAttachments = useMemo(() => {
    if (!activeContent) return [];
    const parseItem = (url: string) => {
      const parts = url.split('#');
      const decodedUrl = parts[0];
      let title = 'Attachment';
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
      ...(activeContent.links
        ? activeContent.links.split(',').filter(Boolean).map((link, idx) => ({
            type: 'link_work' as const,
            url: link.trim(),
            title: `External Link ${idx + 1}`,
          }))
        : []),
      ...(activeContent.attachments ? activeContent.attachments.split(',').filter(Boolean).map(parseItem) : []),
    ];
  }, [activeContent]);

  const memoizedAudioList = useMemo(() => {
    if (!activeContent) return [];
    return parseAudioItems(activeContent.audio_url, activeContent.audio_file_id);
  }, [activeContent]);

  const detailParsed = useMemo(() => {
    if (!activeContent) return { intro: '', cards: [] as { num: string; text: string }[] };
    return parseContentDescription(activeContent.description);
  }, [activeContent?.description]);

  const copyAiLink = async (id: string) => {
    const url = getContentTxtUrl(id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAiLink(true);
      setTimeout(() => setCopiedAiLink(false), 2000);
    } catch {
      window.prompt('Copy this link for AI:', url);
    }
  };

  const openContent = (c: LearningContent) => {
    window.location.hash = `#/view?id=${encodeURIComponent(c.id)}`;
  };

  const subjectOptions = ['All', ...subjects.map((s) => s.name)];

  return (
    <AppShell breadcrumb={['StudyFlow', view === 'detail' ? 'Content' : 'Archive']}>
      <div className="exp-content-page">
      <AnimatePresence mode="wait">
        {view === 'detail' && activeContent ? (
          <motion.div key="detail" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => { window.location.hash = ''; }}>
                ← Back to archive
              </Button>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => copyAiLink(activeContent.id)}>
                  {copiedAiLink ? 'Copied' : 'Copy AI link'}
                </Button>
                <Button variant="primary" size="sm" onClick={() => setIsExportOpen(true)}>
                  Export PNG
                </Button>
              </div>
            </div>

            <div className="exp-card exp-content-detail">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <Badge color={getSubjectColor(activeContent.subject, subjects)}>{activeContent.subject}</Badge>
                <span style={{ fontSize: 12, color: 'var(--exp-ink-subtle)', fontFamily: 'var(--exp-mono)' }}>
                  {new Date(activeContent.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 20 }}>
                {activeContent.title}
              </h1>

              {memoizedAudioList.length > 0 && (
                <div style={{ marginBottom: 20 }}>
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
                </div>
              )}

              <AttachmentList contentId={activeContent.id} contentType="learning_content" attachments={memoizedAttachments} />

              {detailParsed.intro && (
                <div style={{ marginTop: 20, fontSize: 15, lineHeight: 1.6, color: 'var(--exp-ink-muted)' }}>
                  <MarkdownRenderer content={detailParsed.intro} />
                </div>
              )}

              {detailParsed.cards.length > 0 && (
                <div style={{ display: 'grid', gap: 12, marginTop: 20 }}>
                  {detailParsed.cards.map((card) => (
                    <div
                      key={card.num}
                      style={{
                        padding: 16,
                        background: 'var(--exp-surface-2)',
                        borderRadius: 12,
                        border: '1px solid var(--exp-hairline)',
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--exp-primary)', fontFamily: 'var(--exp-mono)' }}>
                        {card.num}
                      </span>
                      <div style={{ marginTop: 8, fontSize: 14, color: 'var(--exp-ink-muted)' }}>
                        <MarkdownRenderer content={card.text} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isExportOpen && activeContent && (
              <ContentExportImageModal
                isOpen={isExportOpen}
                onClose={() => setIsExportOpen(false)}
                content={activeContent}
                parsed={detailParsed}
                subjectColors={dynamicSubjectColors}
                mounted={mounted}
              />
            )}
          </motion.div>
        ) : (
          <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ marginBottom: 24 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.03em', marginBottom: 4 }}>
                Learning Archive
              </h1>
              <p style={{ fontSize: 13, color: 'var(--exp-ink-subtle)' }}>
                Browse materials by date, subject, or search
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
              <Input
                placeholder="Search content…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ maxWidth: 320, flex: 1 }}
              />
              <select
                className="exp-input"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={{ width: 'auto', minWidth: 140 }}
              >
                {subjectOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {isLoading ? (
              <Skeleton style={{ height: 400 }} />
            ) : searchTerm.trim() || selectedSubject !== 'All' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {searchResults.length === 0 ? (
                  <EmptyState title="No results" description="Try a different search or subject filter" />
                ) : (
                  searchResults.map((c: LearningContent) => (
                    <button
                      key={c.id}
                      type="button"
                      className="exp-task-card"
                      style={{ textAlign: 'left', width: '100%' }}
                      onClick={() => openContent(c)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <Badge color={getSubjectColor(c.subject, subjects)}>{c.subject}</Badge>
                          <div className="exp-task-card__title">{c.title}</div>
                        </div>
                        <span className="exp-task-card__date">
                          {new Date(c.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                    {currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
                  </h2>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>←</Button>
                    <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())}>Today</Button>
                    <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>→</Button>
                  </div>
                </div>
                <div className="exp-calendar">
                  <div className="exp-calendar__head">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                      <div key={d} className="exp-calendar__head-cell">{d}</div>
                    ))}
                  </div>
                  <div className="exp-calendar__grid">
                    {daysInMonth.map((d, i) => {
                      const contents = getContentsForDate(d.day, d.month, d.year);
                      const hasContent = contents.length > 0;
                      const isToday = new Date().toDateString() === new Date(d.year, d.month, d.day).toDateString();
                      return (
                        <div
                          key={i}
                          className={`exp-calendar__day ${!d.isCurrent ? 'exp-calendar__day--muted' : ''} ${isToday ? 'exp-calendar__day--today' : ''} ${hasContent ? 'exp-calendar__day--clickable' : ''}`}
                          onClick={() => hasContent && setSelectedDate(new Date(d.year, d.month, d.day).toISOString())}
                        >
                          <div className="exp-calendar__day-num">{d.day}</div>
                          <div className="exp-calendar__dots">
                            {contents.slice(0, 4).map((c: LearningContent) => (
                              <span
                                key={c.id}
                                className="exp-calendar__dot"
                                style={{ background: getSubjectColor(c.subject, subjects) }}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <Dialog
              open={!!selectedDate}
              onClose={() => setSelectedDate(null)}
              title={
                selectedDate
                  ? new Date(selectedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })
                  : ''
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedDate &&
                  getContentsForDate(
                    new Date(selectedDate).getDate(),
                    new Date(selectedDate).getMonth(),
                    new Date(selectedDate).getFullYear()
                  ).map((c: LearningContent) => (
                    <button
                      key={c.id}
                      type="button"
                      className="exp-task-card"
                      style={{ textAlign: 'left', width: '100%' }}
                      onClick={() => {
                        openContent(c);
                        setSelectedDate(null);
                      }}
                    >
                      <Badge color={getSubjectColor(c.subject, subjects)}>{c.subject}</Badge>
                      <div className="exp-task-card__title">{c.title}</div>
                    </button>
                  ))}
              </div>
            </Dialog>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </AppShell>
  );
}
