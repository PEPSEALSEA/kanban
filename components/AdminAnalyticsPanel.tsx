'use client';

import React, { useMemo, useState } from 'react';
import { parseMetadata, EVENT_LABELS, formatEventDetail } from '@/lib/analytics';

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
  eventCount: number;
  totalDurationSec: number;
  maxScrollPercent: number;
  events: AnalyticsRow[];
};

function buildIpGroups(rows: AnalyticsRow[]): IpGroup[] {
  const map = new Map<string, IpGroup>();

  for (const row of rows) {
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

export default function AdminAnalyticsPanel({ analytics }: { analytics: AnalyticsRow[] }) {
  const [selectedIp, setSelectedIp] = useState<string | null>(null);

  const ipGroups = useMemo(() => buildIpGroups(analytics), [analytics]);
  const selected = ipGroups.find((g) => g.ip === selectedIp);

  const totals = useMemo(() => ({
    visits: analytics.filter((a) => a.event_type === 'visit').length,
    content: analytics.filter((a) => a.event_type === 'check_content').length,
    images: analytics.filter((a) => a.event_type === 'view_image').length,
    sessions: analytics.filter((a) => a.event_type === 'session_end').length,
  }), [analytics]);

  return (
    <div>
      <div className="metric-grid" style={{ marginBottom: '2rem' }}>
        <div className="admin-card" style={{ borderLeft: '4px solid #2563eb' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>เข้าหน้าเว็บ</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>{totals.visits}</h2>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #10b981' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>เปิดเนื้อหา</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>{totals.content}</h2>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>เปิดดูรูป</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>{totals.images}</h2>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.5rem' }}>เซสชันจบ (มีเวลาอยู่)</p>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--admin-text-main)' }}>{totals.sessions}</h2>
        </div>
      </div>

      <div className="admin-card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--admin-text-main)' }}>
          Last online (เรียงตาม IP)
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginBottom: '1.25rem' }}>
          คลิก IP เพื่อดู activity ทั้งหมดของผู้ใช้คนนั้น
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ipGroups.map((g) => (
            <button
              key={g.ip}
              type="button"
              onClick={() => setSelectedIp(g.ip === selectedIp ? null : g.ip)}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                borderRadius: '0.75rem',
                border: `1px solid ${g.ip === selectedIp ? 'var(--admin-primary)' : 'var(--admin-border)'}`,
                background: g.ip === selectedIp ? 'rgba(99, 102, 241, 0.12)' : 'var(--admin-bg-soft)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                color: 'var(--admin-text-main)',
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{g.ip}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem' }}>
                  {g.email || 'ไม่ได้ล็อกอิน'} · {g.device} · {g.browser}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>
                  {formatRelativeTime(g.lastSeen)}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)' }}>
                  {g.eventCount} events
                  {g.maxScrollPercent > 0 ? ` · อ่าน ~${g.maxScrollPercent}%` : ''}
                </div>
              </div>
            </button>
          ))}
          {ipGroups.length === 0 && (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--admin-text-muted)' }}>ยังไม่มีข้อมูล analytics</p>
          )}
        </div>
      </div>

      {selected && (
        <div className="admin-card" style={{ overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--admin-text-main)', margin: 0 }}>
                Activity · {selected.ip}
              </h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
                {selected.email || 'Guest'} · อยู่รวม ~{Math.round(selected.totalDurationSec / 60)} นาที (จาก session ที่จบ)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedIp(null)}
              style={{
                background: 'none',
                border: '1px solid var(--admin-border)',
                color: 'var(--admin-text-muted)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              ปิด
            </button>
          </div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>เวลา</th>
                <th>กิจกรรม</th>
                <th>รายละเอียด</th>
                <th>หน้า / เนื้อหา</th>
              </tr>
            </thead>
            <tbody>
              {selected.events.map((e) => {
                const meta = parseMetadata(e.metadata);
                const detail = formatEventDetail(e.event_type, meta);
                return (
                  <tr key={e.id}>
                    <td style={{ color: 'var(--admin-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(e.created_at).toLocaleString('th-TH')}
                    </td>
                    <td>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: 'rgba(37, 99, 235, 0.1)',
                          color: '#2563eb',
                        }}
                      >
                        {EVENT_LABELS[e.event_type] || e.event_type}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.85rem', maxWidth: '280px' }}>{detail || '—'}</td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--admin-text-muted)' }}>
                      {e.content_id ? `ID: ${e.content_id}` : ''}
                      {e.page_visited ? (
                        <div style={{ marginTop: '0.25rem', wordBreak: 'break-all' }}>
                          {e.page_visited.replace(/^https?:\/\/[^/]+/, '')}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
