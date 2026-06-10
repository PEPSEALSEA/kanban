'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '@/components/DataProvider';
import { parseMetadata } from '@/lib/analytics';
import {
  buildIpTimeline,
  buildPageSummary,
  formatDuration,
  ipNotesToMap,
  EVENT_COLORS,
  type IpNote,
} from '@/lib/analytics-ip';
import {
  filterAnalytics,
  getLastPageLabel,
  isLikelyOnline,
  type DateRangeDays,
  type AnalyticsRow as DashboardRow,
} from '@/lib/analytics-dashboard';
import AnalyticsOverview from '@/components/AnalyticsOverview';

export type AnalyticsRow = {
  id: string;
  event_type: string;
  device_name: string;
  browser: string;
  ip_address: string;
  email: string;
  created_at: string;
  page_visited: string;
  content_id: string;
  fingerprint: string;
  session_id?: string;
  metadata?: string;
};

type IpGroup = {
  ip: string;
  email: string;
  device: string;
  browser: string;
  lastSeen: string;
  firstSeen: string;
  lastPage: string;
  likelyOnline: boolean;
  eventCount: number;
  totalDurationSec: number;
  maxScrollPercent: number;
  events: AnalyticsRow[];
};

function buildIpGroups(rows: AnalyticsRow[]): IpGroup[] {
  const map = new Map<string, IpGroup>();

  for (const row of rows) {
    if (row.event_type === 'heartbeat') continue;
    const ip = row.ip_address || 'unknown';
    const meta = parseMetadata(row.metadata);
    let group = map.get(ip);

    if (!group) {
      group = {
        ip,
        email: row.email || '',
        device: row.device_name || '',
        browser: row.browser || '',
        lastSeen: row.created_at,
        firstSeen: row.created_at,
        lastPage: '—',
        likelyOnline: false,
        eventCount: 0,
        totalDurationSec: 0,
        maxScrollPercent: 0,
        events: [],
      };
      map.set(ip, group);
    }

    group.events.push(row);
    group.eventCount += 1;

    if (new Date(row.created_at) > new Date(group.lastSeen)) {
      group.lastSeen = row.created_at;
      if (row.email) group.email = row.email;
      if (row.device_name) group.device = row.device_name;
      if (row.browser) group.browser = row.browser;
    }
    if (new Date(row.created_at) < new Date(group.firstSeen)) {
      group.firstSeen = row.created_at;
    }
    if (!group.email && row.email) group.email = row.email;

    if (row.event_type === 'session_end' && meta.duration_sec != null) {
      group.totalDurationSec += Number(meta.duration_sec) || 0;
    }
    const scrollPct = Number(meta.max_scroll_percent ?? meta.percent ?? 0);
    if (scrollPct > group.maxScrollPercent) {
      group.maxScrollPercent = scrollPct;
    }
  }

  for (const g of map.values()) {
    g.events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    g.lastPage = getLastPageLabel(g.events);
    g.likelyOnline = isLikelyOnline(g.lastSeen);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  );
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชม. ที่แล้ว`;
  const days = Math.floor(hours / 24);
  return `${days} วันที่แล้ว`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

type IpDetailModalProps = {
  group: IpGroup;
  ipNotes: Record<string, IpNote>;
  onClose: () => void;
  onSaveNote: (ip: string, name: string, note: string) => Promise<void>;
};

function IpDetailModal({ group, ipNotes, onClose, onSaveNote }: IpDetailModalProps) {
  const existing = ipNotes[group.ip];
  const [name, setName] = useState(existing?.name || '');
  const [note, setNote] = useState(existing?.note || '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const sessions = useMemo(() => buildIpTimeline(group.events), [group.events]);
  const pageSummary = useMemo(() => buildPageSummary(sessions), [sessions]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSaveNote(group.ip, name, note);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Activity ${group.ip}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(6px)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '1rem',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--admin-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem',
            flexShrink: 0,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--admin-text-main)' }}>
              {existing?.name || group.ip}
            </h2>
            {existing?.name && (
              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem' }}>{group.ip}</div>
            )}
            <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginTop: '0.5rem' }}>
              {group.email || 'ไม่ได้ล็อกอิน'} · {group.device} · {group.browser}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
              <span style={chipStyle('#10b981')}>ออนไลน์ล่าสุด {formatRelativeTime(group.lastSeen)}</span>
              <span style={chipStyle('#6366f1')}>อยู่รวม ~{formatDuration(group.totalDurationSec)}</span>
              <span style={chipStyle('#94a3b8')}>{group.eventCount} events</span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="ปิด">
            ✕
          </button>
        </div>

        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--admin-border)', flexShrink: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
            บันทึกชื่อ / Note
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="ชื่อผู้ใช้ เช่น น้องมิ้นท์"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
            <textarea
              placeholder="Note เพิ่มเติม (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '52px' }}
            />
            <button type="button" onClick={handleSave} disabled={saving} style={{ ...saveBtnStyle, opacity: saving ? 0.7 : 1 }}>
              {saving ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว ✓' : 'บันทึก Note'}
            </button>
            {saveError && (
              <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.25rem' }}>{saveError}</div>
            )}
            {existing?.updatedAt && (
              <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)' }}>
                อัปเดตล่าสุด: {formatTime(existing.updatedAt)}
              </div>
            )}
          </div>
        </div>

        {pageSummary.length > 0 && (
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--admin-border)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>
              เวลาต่อหน้า (ประมาณ)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {pageSummary.map((p) => (
                <span key={p.pageLabel} style={chipStyle('#2563eb')}>
                  {p.pageLabel}: {formatDuration(p.totalSec)} ({p.visits} ครั้ง)
                </span>
              ))}
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem 1.5rem', minHeight: 0 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', marginBottom: '1rem' }}>
            Timeline (ใหม่ → เก่า · เลื่อนดูย้อนหลังได้)
          </div>

          {sessions.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: '2rem' }}>ไม่มี activity</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  style={{
                    border: '1px solid var(--admin-border)',
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    background: 'var(--admin-bg-soft)',
                  }}
                >
                  <div
                    style={{
                      padding: '0.65rem 1rem',
                      background: 'rgba(99, 102, 241, 0.1)',
                      borderBottom: '1px solid var(--admin-border)',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: 'var(--admin-text-main)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <span>เซสชัน · {formatTime(session.startedAt)}</span>
                    <span style={{ color: '#a5b4fc' }}>รวม {formatDuration(session.totalDurationSec)}</span>
                  </div>

                  <div style={{ padding: '0.75rem 1rem' }}>
                    {session.entries.map((entry, idx) => {
                      const color = EVENT_COLORS[entry.eventType] || '#64748b';
                      const isLast = idx === session.entries.length - 1;
                      return (
                        <div key={entry.id} style={{ display: 'flex', gap: '0.75rem', minHeight: '48px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
                            <div
                              style={{
                                width: '10px',
                                height: '10px',
                                borderRadius: '50%',
                                background: color,
                                marginTop: '5px',
                                flexShrink: 0,
                              }}
                            />
                            {!isLast && (
                              <div style={{ width: '2px', flex: 1, background: 'var(--admin-border)', marginTop: '4px', minHeight: '20px' }} />
                            )}
                          </div>
                          <div style={{ flex: 1, paddingBottom: isLast ? 0 : '0.85rem', minWidth: 0 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  background: `${color}22`,
                                  color,
                                }}
                              >
                                {entry.label}
                              </span>
                              {entry.eventType === 'visit' && entry.durationSec != null && (
                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>
                                  อยู่ {formatDuration(entry.durationSec)}
                                </span>
                              )}
                              <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', marginLeft: 'auto' }}>
                                {formatTime(entry.at)}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-main)', marginTop: '0.25rem' }}>
                              {entry.pageLabel}
                            </div>
                            {entry.detail && (
                              <div style={{ fontSize: '0.78rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem' }}>
                                {entry.detail}
                              </div>
                            )}
                            {entry.contentId && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.15rem' }}>
                                ID: {entry.contentId}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const chipStyle = (color: string): React.CSSProperties => ({
  fontSize: '0.7rem',
  fontWeight: 700,
  padding: '3px 8px',
  borderRadius: '6px',
  background: `${color}18`,
  color,
  border: `1px solid ${color}33`,
});

const closeBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-text-muted)',
  width: '32px',
  height: '32px',
  borderRadius: '0.5rem',
  cursor: 'pointer',
  flexShrink: 0,
  fontSize: '0.9rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.55rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--admin-border)',
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--admin-text-main)',
  fontSize: '0.85rem',
  outline: 'none',
};

const saveBtnStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '0.45rem 1rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: 'var(--admin-primary)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

export default function AdminAnalyticsPanel({ analytics }: { analytics: AnalyticsRow[] }) {
  const { analyticsIpNotes, saveAnalyticsIpNote, learningContent, allHomework } = useData();
  const [selectedIp, setSelectedIp] = useState<string | null>(null);
  const [range, setRange] = useState<DateRangeDays>(7);

  const ipNotes = useMemo(() => ipNotesToMap(analyticsIpNotes), [analyticsIpNotes]);
  const filtered = useMemo(() => filterAnalytics(analytics as DashboardRow[], range), [analytics, range]);

  const contentTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of learningContent) map[c.id] = c.title;
    return map;
  }, [learningContent]);

  const homeworkTitles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const h of allHomework) map[h.id] = h.title;
    return map;
  }, [allHomework]);

  const ipGroups = useMemo(() => buildIpGroups(analytics), [analytics]);
  const selected = ipGroups.find((g) => g.ip === selectedIp);

  const rangeOptions: { value: DateRangeDays; label: string }[] = [
    { value: 'today', label: 'วันนี้' },
    { value: 7, label: '7 วัน' },
    { value: 30, label: '30 วัน' },
    { value: 'month', label: 'เดือนนี้' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--admin-text-main)', margin: 0 }}>Analytics Overview</h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
            สรุปการใช้งาน · กราฟ · live feed
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--admin-bg-soft)', padding: '0.25rem', borderRadius: '0.6rem', border: '1px solid var(--admin-border)' }}>
          {rangeOptions.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => setRange(opt.value)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '0.45rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: 700,
                background: range === opt.value ? 'var(--admin-primary)' : 'transparent',
                color: range === opt.value ? '#fff' : 'var(--admin-text-muted)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <AnalyticsOverview
        analytics={analytics as DashboardRow[]}
        filtered={filtered}
        range={range}
        contentTitles={contentTitles}
        homeworkTitles={homeworkTitles}
      />

      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--admin-text-main)' }}>
          Last online (เรียงตาม IP)
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginBottom: '1.25rem' }}>
          คลิก IP เพื่อเปิด Popup ดู timeline · ชื่อ/Note sync ผ่าน Google Sheet (AnalyticsIpNotes)
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ipGroups.map((g) => {
            const note = ipNotes[g.ip];
            return (
              <button
                key={g.ip}
                type="button"
                onClick={() => setSelectedIp(g.ip)}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '0.75rem',
                  border: '1px solid var(--admin-border)',
                  background: 'var(--admin-bg-soft)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  color: 'var(--admin-text-main)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {note?.name ? (
                      <>
                        <span>{note.name}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--admin-text-muted)' }}>{g.ip}</span>
                      </>
                    ) : (
                      g.ip
                    )}
                    {note?.note && (
                      <span title={note.note} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                        Note
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem' }}>
                    {g.email || 'ไม่ได้ล็อกอิน'} · {g.device} · {g.browser}
                  </div>
                  <div style={{ fontSize: '0.72rem', marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--admin-text-main)', fontWeight: 600 }}>Last page: {g.lastPage}</span>
                    {g.likelyOnline && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                        อาจยังออนไลน์
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>{formatRelativeTime(g.lastSeen)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>
                    {g.eventCount} events
                    {g.totalDurationSec > 0 ? ` · ~${formatDuration(g.totalDurationSec)}` : ''}
                    {g.maxScrollPercent > 0 ? ` · อ่าน ~${g.maxScrollPercent}%` : ''}
                  </div>
                </div>
              </button>
            );
          })}
          {ipGroups.length === 0 && (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--admin-text-muted)' }}>ยังไม่มีข้อมูล analytics</p>
          )}
        </div>
      </div>

      {selected && (
        <IpDetailModal
          group={selected}
          ipNotes={ipNotes}
          onClose={() => setSelectedIp(null)}
          onSaveNote={saveAnalyticsIpNote}
        />
      )}
    </div>
  );
}
