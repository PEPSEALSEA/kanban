'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useData } from '@/components/DataProvider';

// --- CONFIGURATION ---
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwcxlw11xxkbmWFiVZUX4jRgA0Xugbwl7lnSdMi9gO0BhXY4TAgfIjqqTX_xyvwwbfwsA/exec";
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
    isLoading, 
    error, 
    refreshData 
  } = useData();

  const [view, setView] = useState<'calendar' | 'detail'>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<LearningContent | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [mounted, setMounted] = useState(false);

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

  // --- PARSER LOGIC ---
  const parseDescription = (desc: string) => {
    const regex = /\{(\d+)\s*([\s\S]*?)\}/g;
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

  if (view === 'detail' && activeContent) {
    const { intro, cards } = parseDescription(activeContent.description);
    return (
      <div className="animate-slide-in" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
        <button onClick={() => window.location.hash = ''} className="glass" style={{ padding: '0.75rem 1.5rem', borderRadius: '1rem', border: 'none', color: '#fff', cursor: 'pointer', marginBottom: '2rem' }}>
          ← Back to Calendar
        </button>

        <div className="glass" style={{ padding: '3rem', borderRadius: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            <span style={{ padding: '4px 12px', borderRadius: '8px', background: `${SUBJECT_COLORS[activeContent.subject] || SUBJECT_COLORS['Other']}25`, color: SUBJECT_COLORS[activeContent.subject] || SUBJECT_COLORS['Other'], fontSize: '0.7rem', fontWeight: 800, border: '1px solid rgba(255,255,255,0.1)' }}>
              {activeContent.subject}
            </span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              {mounted && new Date(activeContent.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
          </div>

          <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: '2rem', background: 'linear-gradient(to right, #fff, #94a3b8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {activeContent.title}
          </h1>

          {/* Audio Player */}
          {activeContent.audio_file_id && (
            <div className="audio-player-container">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div className="animate-float" style={{ fontSize: '2rem' }}>🎵</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', opacity: 0.6 }}>AUDIO RECORDING</div>
                  <audio controls style={{ width: '100%', height: '40px', borderRadius: '10px' }}>
                    <source src={`https://drive.google.com/uc?export=download&id=${activeContent.audio_file_id}`} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              </div>
            </div>
          )}

          {/* Intro Text */}
          {intro && (
            <div style={{ fontSize: '1.1rem', lineHeight: 1.6, color: '#f8fafc', marginBottom: '2.5rem', opacity: 0.9 }}>
              {intro}
            </div>
          )}

          {/* Cards Section */}
          {cards.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {cards.map((card, idx) => (
                <div key={idx} className="split-card animate-scale-in" style={{ animationDelay: `${idx * 0.1}s` }}>
                  <div className="split-number">{card.num}</div>
                  <div style={{ fontSize: '1rem', lineHeight: 1.7, color: '#cbd5e1' }}>
                    {card.text}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attachments & Links - Reusing logic design */}
          {(activeContent.links || activeContent.attachments) && (
            <div style={{ marginTop: '4rem', paddingTop: '2rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.5rem' }}>Resources & Links</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                {activeContent.links && activeContent.links.split(',').map((link, idx) => (
                  <a key={idx} href={link.trim()} target="_blank" rel="noreferrer" className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', fontSize: '0.8rem', textDecoration: 'none', color: '#fff', border: '1px solid rgba(255,255,255,0.05)', transition: '0.2s' }}>
                    🔗 External Link {idx + 1}
                  </a>
                ))}
                {activeContent.attachments && activeContent.attachments.split(',').map((att, idx) => (
                  <a key={idx} href={att.trim()} target="_blank" rel="noreferrer" className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', fontSize: '0.8rem', textDecoration: 'none', color: '#fff', border: '1px solid rgba(255,255,255,0.05)', transition: '0.2s' }}>
                    📎 Attachment {idx + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 900, background: 'linear-gradient(to right, #818cf8, #f43f5e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            คลังเนื้อหาการเรียน
          </h1>
          <p style={{ color: 'var(--text-muted)' }}>Learning Content Archive</p>
        </div>
      </header>

      <div className="glass" style={{ padding: '2rem', borderRadius: '2rem' }}>
        {/* Calendar Nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>
            {mounted && currentMonth.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))} className="glass" style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', color: '#fff', cursor: 'pointer' }}>←</button>
            <button onClick={() => setCurrentMonth(new Date())} className="glass" style={{ padding: '0 1rem', borderRadius: '10px', border: 'none', color: '#fff', cursor: 'pointer' }}>Today</button>
            <button onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))} className="glass" style={{ width: '40px', height: '40px', borderRadius: '10px', border: 'none', color: '#fff', cursor: 'pointer' }}>→</button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', fontWeight: 900, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)' }}>{d}</div>
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
                <div style={{ fontSize: '0.85rem', fontWeight: d.isCurrent ? 700 : 400 }}>{d.day}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {dateContents.map((c: LearningContent, ci: number) => (
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: SUBJECT_COLORS[c.subject] || SUBJECT_COLORS['Other'] }} title={c.title} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Date Overview Modal */}
      {selectedDate && (
        <div 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setSelectedDate(null)}
        >
          <div 
            className="glass animate-scale-in" 
            style={{ width: '90%', maxWidth: '400px', padding: '2rem', borderRadius: '2rem' }}
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
                  <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: SUBJECT_COLORS[c.subject] || SUBJECT_COLORS['Other'] }} />
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
