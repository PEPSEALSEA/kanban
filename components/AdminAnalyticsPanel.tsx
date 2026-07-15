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
  type TimelineEntry,
} from '@/lib/analytics-ip';
import { buildAnalyticsResourceLookups, type AnalyticsResourceLookups } from '@/lib/analytics-links';
import {
  filterAnalytics,
  getLastPageLabel,
  isLikelyOnline,
  type DateRangeDays,
  type AnalyticsRow as DashboardRow,
} from '@/lib/analytics-dashboard';
import AnalyticsOverview from '@/components/AnalyticsOverview';
import { fetchAdminJson } from '@/lib/adminList';
import type { AnalyticsIpNoteRow } from '@/components/DataProvider';
import { IconX, IconCheck, IconFile, IconClock, IconSearch } from '@/components/icons';

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
  visitor_id?: string;
  metadata?: string;
};

type VisitorGroup = {
  visitorId: string;
  displayIp: string;
  isLegacy: boolean;
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

function shortVisitorId(visitorId: string, isLegacy: boolean): string {
  if (isLegacy) return visitorId;
  return `#${visitorId.slice(-8)}`;
}

function visitorColor(visitorId: string): string {
  const palette = ['#0284c7', '#0ea5e9', '#38bdf8', '#06b6d4', '#0891b2', '#22d3ee', '#7dd3fc', '#67e8f9'];
  let h = 0;
  for (const c of visitorId) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

function visitorInitials(group: VisitorGroup, note?: IpNote): string {
  const src = note?.name || group.email;
  if (!src) return '?';
  const parts = src.trim().split(/[\s@.]+/);
  if (parts.length >= 2 && parts[0] && parts[1]) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function buildVisitorGroups(rows: AnalyticsRow[]): VisitorGroup[] {
  const map = new Map<string, VisitorGroup>();

  for (const row of rows) {
    if (row.event_type === 'heartbeat') continue;
    const isLegacy = !row.visitor_id;
    const visitorId = row.visitor_id || row.ip_address || 'unknown';
    const meta = parseMetadata(row.metadata);
    let group = map.get(visitorId);

    if (!group) {
      group = {
        visitorId,
        displayIp: row.ip_address || '',
        isLegacy,
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
      map.set(visitorId, group);
    }

    group.events.push(row);
    group.eventCount += 1;

    if (new Date(row.created_at) > new Date(group.lastSeen)) {
      group.lastSeen = row.created_at;
      if (row.email) group.email = row.email;
      if (row.device_name) group.device = row.device_name;
      if (row.browser) group.browser = row.browser;
      if (row.ip_address) group.displayIp = row.ip_address;
    }
    if (new Date(row.created_at) < new Date(group.firstSeen)) {
      group.firstSeen = row.created_at;
    }
    if (!group.email && row.email) group.email = row.email;

    if (row.event_type === 'session_end' && meta.duration_sec != null) {
      group.totalDurationSec += Number(meta.duration_sec) || 0;
    }
    const scrollPct = Number(meta.max_scroll_percent ?? meta.percent ?? 0);
    if (scrollPct > group.maxScrollPercent) group.maxScrollPercent = scrollPct;
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

function daysSince(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'วันนี้เป็นครั้งแรก';
  if (days === 1) return 'เริ่มใช้เมื่อวาน';
  return `ใช้มา ${days} วัน`;
}

const timelineLinkStyle: React.CSSProperties = {
  color: 'var(--admin-text-main)',
  textDecoration: 'none',
  borderBottom: '1px solid rgba(14,165,233,0.45)',
  transition: 'color 0.15s, border-color 0.15s',
};

function TimelinePageLabel({ entry }: { entry: TimelineEntry }) {
  if (entry.resourceHref) {
    return (
      <div>
        <a
          href={entry.resourceHref}
          target="_blank"
          rel="noopener noreferrer"
          style={timelineLinkStyle}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#0284c7';
            e.currentTarget.style.borderBottomColor = '#0284c7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--admin-text-main)';
            e.currentTarget.style.borderBottomColor = 'rgba(14,165,233,0.45)';
          }}
        >
          {entry.pageLabel}
        </a>
        {entry.contentId && entry.resourceTitle && entry.resourceTitle !== entry.contentId && (
          <div style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem', fontFamily: 'monospace' }}>
            {entry.contentId}
            {entry.resourceType === 'content' ? ' · เนื้อหา' : entry.resourceType === 'homework' ? ' · การบ้าน' : ''}
          </div>
        )}
      </div>
    );
  }

  return <>{entry.pageLabel}</>;
}

// ---- Detail Modal ----

type IpDetailModalProps = {
  group: VisitorGroup;
  ipNotes: Record<string, IpNote>;
  resourceLookups: AnalyticsResourceLookups;
  onClose: () => void;
  onSaveNote: (ip: string, name: string, note: string) => Promise<void>;
};

function IpDetailModal({ group, ipNotes, resourceLookups, onClose, onSaveNote }: IpDetailModalProps) {
  const existing = ipNotes[group.visitorId];
  const [name, setName] = useState(existing?.name || '');
  const [note, setNote] = useState(existing?.note || '');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const color = visitorColor(group.visitorId);

  const sessions = useMemo(
    () => buildIpTimeline(group.events, resourceLookups),
    [group.events, resourceLookups]
  );
  const pageSummary = useMemo(() => buildPageSummary(sessions), [sessions]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await onSaveNote(group.visitorId, name, note);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
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
          maxWidth: '740px',
          maxHeight: '92vh',
          background: 'var(--admin-card-bg)',
          border: '1px solid var(--admin-border)',
          borderRadius: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid var(--admin-border)',
          display: 'flex',
          gap: '1rem',
          alignItems: 'flex-start',
          flexShrink: 0,
          background: `linear-gradient(135deg, ${color}12, transparent)`,
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            background: `${color}28`,
            border: `2px solid ${color}60`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            fontWeight: 800,
            color,
            flexShrink: 0,
          }}>
            {visitorInitials(group, existing)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--admin-text-main)' }}>
                {existing?.name || shortVisitorId(group.visitorId, group.isLegacy)}
              </h2>
              {group.likelyOnline && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '20px', background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  ออนไลน์อยู่
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {!group.isLegacy && <span style={{ fontFamily: 'monospace', opacity: 0.7 }}>{group.visitorId}</span>}
              {group.displayIp && <span>IP: {group.displayIp}</span>}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginTop: '0.4rem' }}>
              {group.email || 'ไม่ได้ล็อกอิน'} · {group.device} · {group.browser}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
              <span style={chip('#10b981')}>ล่าสุด {formatRelativeTime(group.lastSeen)}</span>
              {group.totalDurationSec > 0 && <span style={chip('#0284c7')}>อยู่รวม ~{formatDuration(group.totalDurationSec)}</span>}
              <span style={chip('#94a3b8')}>{group.eventCount} events</span>
              <span style={chip('#64748b')}>{daysSince(group.firstSeen)}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle} aria-label="ปิด"><IconX className="w-4 h-4" /></button>
        </div>

        {/* Note editor */}
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--admin-border)', flexShrink: 0 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.6rem' }}>
            ตั้งชื่อ / บันทึก
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="ชื่อผู้ใช้ เช่น น้องมิ้นท์"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, flex: '1 1 160px' }}
            />
            <input
              type="text"
              placeholder="Note เพิ่มเติม (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              style={{ ...inputStyle, flex: '2 1 200px' }}
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ ...saveBtnStyle, opacity: saving ? 0.7 : 1, flexShrink: 0 }}
            >
              {saving ? 'กำลังบันทึก...' : saved ? (<span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><IconCheck className="w-3.5 h-3.5" /> บันทึกแล้ว</span>) : 'บันทึก'}
            </button>
          </div>
          {saveError && <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: '0.4rem' }}>{saveError}</div>}
          {existing?.updatedAt && (
            <div style={{ fontSize: '0.65rem', color: 'var(--admin-text-muted)', marginTop: '0.3rem' }}>
              อัปเดตล่าสุด: {formatTime(existing.updatedAt)}
            </div>
          )}
        </div>

        {/* Page summary */}
        {pageSummary.length > 0 && (
          <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--admin-border)', flexShrink: 0 }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              เวลาต่อหน้า (ประมาณ)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {pageSummary.map((p) => (
                <span key={p.pageLabel} style={chip('#2563eb')}>
                  {p.resourceHref ? (
                    <a
                      href={p.resourceHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '2px' }}
                    >
                      {p.pageLabel}
                    </a>
                  ) : (
                    p.pageLabel
                  )}
                  : {formatDuration(p.totalSec)} ({p.visits}×)
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Timeline */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem 1.5rem', minHeight: 0 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--admin-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Timeline — ใหม่ → เก่า
          </div>

          {sessions.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--admin-text-muted)', padding: '2rem' }}>ไม่มี activity</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  style={{ border: '1px solid var(--admin-border)', borderRadius: '0.75rem', overflow: 'hidden', background: 'var(--admin-bg-soft)' }}
                >
                  <div style={{
                    padding: '0.6rem 1rem',
                    background: 'rgba(14,165,233,0.08)',
                    borderBottom: '1px solid var(--admin-border)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--admin-text-main)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}>
                    <span>เซสชัน · {formatTime(session.startedAt)}</span>
                    <span style={{ color: '#0284c7' }}>รวม {formatDuration(session.totalDurationSec)}</span>
                  </div>
                  <div style={{ padding: '0.75rem 1rem' }}>
                    {session.entries.map((entry, idx) => {
                      const color = EVENT_COLORS[entry.eventType] || '#64748b';
                      const isLast = idx === session.entries.length - 1;
                      return (
                        <div key={entry.id} style={{ display: 'flex', gap: '0.75rem', minHeight: '44px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px', flexShrink: 0 }}>
                            <div style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, marginTop: '5px', flexShrink: 0 }} />
                            {!isLast && <div style={{ width: '2px', flex: 1, background: 'var(--admin-border)', marginTop: '4px', minHeight: '16px' }} />}
                          </div>
                          <div style={{ flex: 1, paddingBottom: isLast ? 0 : '0.75rem', minWidth: 0 }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: `${color}22`, color }}>
                                {entry.label}
                              </span>
                              {entry.eventType === 'visit' && entry.durationSec != null && (
                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981' }}>
                                  อยู่ {formatDuration(entry.durationSec)}
                                </span>
                              )}
                              <span style={{ fontSize: '0.65rem', color: 'var(--admin-text-muted)', marginLeft: 'auto' }}>
                                {formatTime(entry.at)}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--admin-text-main)', marginTop: '0.2rem' }}>
                              <TimelinePageLabel entry={entry} />
                            </div>
                            {entry.detail && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '0.15rem' }}>{entry.detail}</div>
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

// ---- Visitor Card ----

function VisitorCard({
  g,
  note,
  onClick,
}: {
  g: VisitorGroup;
  note?: IpNote;
  onClick: () => void;
}) {
  const color = visitorColor(g.visitorId);
  const displayName = note?.name || shortVisitorId(g.visitorId, g.isLegacy);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr auto',
        alignItems: 'center',
        gap: '0.9rem',
        padding: '0.9rem 1rem',
        borderRadius: '0.85rem',
        border: `1px solid ${g.likelyOnline ? 'rgba(16,185,129,0.35)' : 'var(--admin-border)'}`,
        background: g.likelyOnline ? 'rgba(16,185,129,0.04)' : 'var(--admin-bg-soft)',
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        color: 'var(--admin-text-main)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          background: `${color}22`,
          border: `2px solid ${color}50`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.9rem',
          fontWeight: 800,
          color,
        }}>
          {visitorInitials(g, note)}
        </div>
        {g.likelyOnline && (
          <span style={{
            position: 'absolute',
            bottom: '0',
            right: '0',
            width: '11px',
            height: '11px',
            borderRadius: '50%',
            background: '#10b981',
            border: '2px solid var(--admin-card-bg)',
          }} />
        )}
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--admin-text-main)' }}>
            {displayName}
          </span>
          {g.isLegacy && (
            <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(100,116,139,0.15)', color: '#64748b' }}>
              legacy
            </span>
          )}
          {note?.note && (
            <span title={note.note} style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
              Note
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.72rem', color: 'var(--admin-text-muted)', marginTop: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {g.email || 'ไม่ได้ล็อกอิน'} · {g.device} · {g.browser}
          {!g.isLegacy && g.displayIp && <> · {g.displayIp}</>}
        </div>

        <div style={{ fontSize: '0.72rem', marginTop: '0.25rem', color: 'var(--admin-text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--admin-text-main)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}><IconFile className="w-3.5 h-3.5" /> {g.lastPage}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
          {g.totalDurationSec > 0 && (
            <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)' }}>
              <IconClock className="w-3 h-3 inline" /> ~{formatDuration(g.totalDurationSec)}
            </span>
          )}
          <span style={{ fontSize: '0.68rem', color: 'var(--admin-text-muted)' }}>{g.eventCount} events</span>
          {g.maxScrollPercent > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--admin-text-muted)' }}>อ่าน {g.maxScrollPercent}%</span>
              <span style={{ display: 'inline-flex', width: '40px', height: '4px', background: 'var(--admin-border)', borderRadius: '2px', overflow: 'hidden' }}>
                <span style={{ height: '100%', width: `${g.maxScrollPercent}%`, background: '#10b981', borderRadius: '2px' }} />
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Right: time */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: g.likelyOnline ? '#10b981' : 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>
          {g.likelyOnline ? '● ออนไลน์' : formatRelativeTime(g.lastSeen)}
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem', whiteSpace: 'nowrap' }}>
          {daysSince(g.firstSeen)}
        </div>
      </div>
    </button>
  );
}

// ---- Shared styles ----

const chip = (color: string): React.CSSProperties => ({
  fontSize: '0.68rem',
  fontWeight: 700,
  padding: '2px 8px',
  borderRadius: '6px',
  background: `${color}18`,
  color,
  border: `1px solid ${color}30`,
});

const closeBtnStyle: React.CSSProperties = {
  background: 'var(--admin-bg-soft)',
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
  padding: '0.5rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--admin-border)',
  background: '#ffffff',
  color: 'var(--admin-text-main)',
  fontSize: '0.82rem',
  outline: 'none',
  minWidth: 0,
};

const saveBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1.1rem',
  borderRadius: '0.5rem',
  border: 'none',
  background: 'var(--admin-primary)',
  color: '#fff',
  fontWeight: 700,
  fontSize: '0.8rem',
  cursor: 'pointer',
};

// ---- Main Panel ----

export default function AdminAnalyticsPanel() {
  const { saveAnalyticsIpNote, learningContent, allHomework } = useData();
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [analyticsIpNotes, setAnalyticsIpNotes] = useState<AnalyticsIpNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'visitors'>('overview');
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRangeDays>(7);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAdminJson<{ analytics: AnalyticsRow[]; analyticsIpNotes: AnalyticsIpNoteRow[] }>('adminAnalytics');
        if (cancelled) return;
        setAnalytics(data.analytics || []);
        setAnalyticsIpNotes(data.analyticsIpNotes || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load analytics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSaveNote = async (ip: string, name: string, note: string) => {
    await saveAnalyticsIpNote(ip, name, note);
    const data = await fetchAdminJson<{ analyticsIpNotes: AnalyticsIpNoteRow[] }>('adminAnalytics');
    setAnalyticsIpNotes(data.analyticsIpNotes || []);
  };

  const ipNotes = useMemo(() => ipNotesToMap(analyticsIpNotes), [analyticsIpNotes]);
  const filtered = useMemo(() => filterAnalytics(analytics as DashboardRow[], range), [analytics, range]);

  const resourceLookups = useMemo(
    () => buildAnalyticsResourceLookups(learningContent, allHomework),
    [learningContent, allHomework]
  );

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

  const visitorGroups = useMemo(() => buildVisitorGroups(analytics), [analytics]);
  const selected = visitorGroups.find((g) => g.visitorId === selectedVisitorId);
  const onlineCount = useMemo(() => visitorGroups.filter((g) => g.likelyOnline).length, [visitorGroups]);

  const filteredVisitors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return visitorGroups;
    return visitorGroups.filter((g) => {
      const note = ipNotes[g.visitorId];
      return (
        (note?.name || '').toLowerCase().includes(q) ||
        g.email.toLowerCase().includes(q) ||
        g.visitorId.toLowerCase().includes(q) ||
        g.displayIp.includes(q)
      );
    });
  }, [visitorGroups, search, ipNotes]);

  const rangeOptions: { value: DateRangeDays; label: string }[] = [
    { value: 'today', label: 'วันนี้' },
    { value: 7, label: '7 วัน' },
    { value: 30, label: '30 วัน' },
    { value: 'month', label: 'เดือนนี้' },
  ];

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--admin-text-muted)' }}>
        Loading analytics…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', color: '#f87171' }}>{error}</div>
    );
  }

  return (
    <div>
      {/* Header + Tabs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--admin-bg-soft)', padding: '0.2rem', borderRadius: '0.65rem', border: '1px solid var(--admin-border)' }}>
          {(
            [
              { id: 'overview', label: 'ภาพรวม' },
              { id: 'visitors', label: `Visitors${visitorGroups.length ? ` (${visitorGroups.length})` : ''}${onlineCount > 0 ? ` · ${onlineCount} ออนไลน์` : ''}` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                background: activeTab === tab.id ? 'var(--admin-primary)' : 'transparent',
                color: activeTab === tab.id ? '#fff' : 'var(--admin-text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Range picker (overview only) */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--admin-bg-soft)', padding: '0.2rem', borderRadius: '0.65rem', border: '1px solid var(--admin-border)' }}>
            {rangeOptions.map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setRange(opt.value)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '0.45rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: range === opt.value ? 'rgba(14,165,233,0.18)' : 'transparent',
                  color: range === opt.value ? '#0284c7' : 'var(--admin-text-muted)',
                  transition: 'background 0.15s',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <AnalyticsOverview
          analytics={analytics as DashboardRow[]}
          filtered={filtered}
          range={range}
          contentTitles={contentTitles}
          homeworkTitles={homeworkTitles}
        />
      )}

      {/* Tab: Visitors */}
      {activeTab === 'visitors' && (
        <div>
          {/* Search */}
          <div style={{ marginBottom: '1rem', position: 'relative' }}>
            <span style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: 0.4, display: 'flex' }}>
              <IconSearch className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="ค้นหาด้วย ชื่อ, email, visitor id, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem 0.65rem 2.25rem',
                borderRadius: '0.65rem',
                border: '1px solid var(--admin-border)',
                background: 'var(--admin-bg-soft)',
                color: 'var(--admin-text-main)',
                fontSize: '0.85rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Stats bar */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span style={chip('#0284c7')}>{visitorGroups.length} visitors ทั้งหมด</span>
            {onlineCount > 0 && <span style={chip('#10b981')}>{onlineCount} ออนไลน์อยู่</span>}
            {search && <span style={chip('#f59e0b')}>พบ {filteredVisitors.length} รายการ</span>}
          </div>

          {/* Visitor list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredVisitors.map((g) => (
              <VisitorCard
                key={g.visitorId}
                g={g}
                note={ipNotes[g.visitorId]}
                onClick={() => setSelectedVisitorId(g.visitorId)}
              />
            ))}
            {filteredVisitors.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--admin-text-muted)', fontSize: '0.9rem' }}>
                {search ? `ไม่พบ "${search}"` : 'ยังไม่มีข้อมูล analytics'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selected && (
        <IpDetailModal
          group={selected}
          ipNotes={ipNotes}
          resourceLookups={resourceLookups}
          onClose={() => setSelectedVisitorId(null)}
          onSaveNote={handleSaveNote}
        />
      )}
    </div>
  );
}
