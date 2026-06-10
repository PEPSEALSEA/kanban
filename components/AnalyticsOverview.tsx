'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { formatDuration } from '@/lib/analytics-ip';
import {
  buildTodaySummary,
  buildVisitsByDay,
  buildVisitsByHourToday,
  buildTopPages,
  buildPeakHours,
  buildTopContent,
  buildTopHomework,
  buildFunnel,
  buildLiveFeed,
  buildDeviceBreakdown,
  getRangeLabel,
  type AnalyticsRow,
  type DateRangeDays,
} from '@/lib/analytics-dashboard';

function formatShortTime(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--admin-text-main)', margin: '0 0 1rem' }}>
      {children}
    </h3>
  );
}

function BarChart({ data, color = 'var(--admin-primary)' }: { data: { key?: string; label: string; count: number }[]; color?: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '140px', paddingTop: '0.5rem' }}>
      {data.map((d) => (
        <div
          key={d.key ?? d.label}
          title={`${d.label}: ${d.count}`}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: 0 }}
        >
          <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--admin-text-muted)' }}>{d.count || ''}</span>
          <div
            style={{
              width: '100%',
              maxWidth: '32px',
              background: color,
              borderRadius: '4px 4px 0 0',
              height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%`,
              minHeight: d.count > 0 ? '4px' : 0,
              opacity: 0.9,
              transition: 'height 0.3s',
            }}
          />
          <span
            style={{
              fontSize: '0.55rem',
              color: 'var(--admin-text-muted)',
              textAlign: 'center',
              lineHeight: 1.2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              width: '100%',
            }}
          >
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function HBarList({ items }: { items: { label: string; count: number; color: string }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  if (items.length === 0) {
    return <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', margin: 0 }}>ยังไม่มีข้อมูล</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
            <span style={{ fontWeight: 600, color: 'var(--admin-text-main)' }}>{item.label}</span>
            <span style={{ color: 'var(--admin-text-muted)', fontWeight: 700 }}>{item.count}</span>
          </div>
          <div style={{ height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(item.count / max) * 100}%`,
                background: item.color,
                borderRadius: '4px',
                minWidth: item.count > 0 ? '4px' : 0,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopContentList({ items }: { items: { id: string; title: string; count: number }[] }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  if (items.length === 0) {
    return <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', margin: 0 }}>ยังไม่มีข้อมูล</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
      {items.map((item) => {
        const displayTitle = item.title.length > 48 ? `${item.title.slice(0, 48)}…` : item.title;
        return (
          <div key={item.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.25rem', fontSize: '0.78rem' }}>
              <Link
                href={`/content#/view?id=${encodeURIComponent(item.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                title={item.title}
                style={{
                  fontWeight: 600,
                  color: '#6ee7b7',
                  textDecoration: 'none',
                  flex: 1,
                  minWidth: 0,
                  lineHeight: 1.35,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
                onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
              >
                {displayTitle}
              </Link>
              <span style={{ color: 'var(--admin-text-muted)', fontWeight: 700, flexShrink: 0 }}>{item.count}</span>
            </div>
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(item.count / max) * 100}%`,
                  background: '#10b981',
                  borderRadius: '4px',
                  minWidth: item.count > 0 ? '4px' : 0,
                }}
              />
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--admin-text-muted)', marginTop: '0.2rem' }}>{item.id}</div>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ items }: { items: { label: string; count: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.count, 0);
  if (total === 0) {
    return <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', margin: 0 }}>ยังไม่มีข้อมูล</p>;
  }

  let offset = 0;
  const segments = items.map((item) => {
    const pct = (item.count / total) * 100;
    const seg = { ...item, pct, offset };
    offset += pct;
    return seg;
  });

  const gradient = segments
    .map((s) => `${s.color} ${s.offset}% ${s.offset + s.pct}%`)
    .join(', ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
      <div
        style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: `conic-gradient(${gradient})`,
          position: 'relative',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '22%',
            borderRadius: '50%',
            background: 'var(--admin-card-bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 800,
            color: 'var(--admin-text-main)',
          }}
        >
          {total}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: '120px' }}>
        {segments.map((s) => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--admin-text-main)', flex: 1 }}>{s.label}</span>
            <span style={{ color: 'var(--admin-text-muted)', fontWeight: 700 }}>{Math.round(s.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelChart({ steps }: { steps: { step: string; count: number; color: string }[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {steps.map((s) => (
        <div key={s.step}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.2rem' }}>
            <span style={{ color: 'var(--admin-text-main)', fontWeight: 600 }}>{s.step}</span>
            <span style={{ color: 'var(--admin-text-muted)', fontWeight: 700 }}>{s.count}</span>
          </div>
          <div style={{ height: '10px', background: 'rgba(255,255,255,0.06)', borderRadius: '5px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${(s.count / max) * 100}%`,
                background: s.color,
                borderRadius: '5px',
                minWidth: s.count > 0 ? '6px' : 0,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type AnalyticsOverviewProps = {
  analytics: AnalyticsRow[];
  filtered: AnalyticsRow[];
  range: DateRangeDays;
  contentTitles: Record<string, string>;
  homeworkTitles: Record<string, string>;
};

export default function AnalyticsOverview({
  analytics,
  filtered,
  range,
  contentTitles,
  homeworkTitles,
}: AnalyticsOverviewProps) {
  const today = useMemo(() => buildTodaySummary(analytics), [analytics]);
  const visitsByDay = useMemo(() => buildVisitsByDay(analytics, range), [analytics, range]);
  const visitsByHourToday = useMemo(() => buildVisitsByHourToday(analytics), [analytics]);
  const topPages = useMemo(() => buildTopPages(filtered), [filtered]);
  const peakHours = useMemo(() => buildPeakHours(filtered), [filtered]);
  const topContent = useMemo(() => buildTopContent(filtered, contentTitles), [filtered, contentTitles]);
  const topHomework = useMemo(() => buildTopHomework(filtered, homeworkTitles), [filtered, homeworkTitles]);
  const funnel = useMemo(() => buildFunnel(filtered), [filtered]);
  const liveFeed = useMemo(() => buildLiveFeed(analytics, 15), [analytics]);
  const devices = useMemo(() => buildDeviceBreakdown(filtered), [filtered]);

  const rangeLabel = getRangeLabel(range);
  const visitChartData = range === 'today'
    ? visitsByHourToday.filter((h) => h.hour % 2 === 0)
    : visitsByDay;

  return (
    <div style={{ marginBottom: '2rem' }}>
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="admin-card" style={{ borderLeft: '4px solid #06b6d4' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.35rem' }}>ผู้เข้าวันนี้</p>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--admin-text-main)', margin: 0 }}>{today.uniqueVisitors}</h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>{today.visits} page views</p>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #8b5cf6' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.35rem' }}>เซสชันเฉลี่ยวันนี้</p>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--admin-text-main)', margin: 0 }}>
            {today.avgSessionSec > 0 ? formatDuration(today.avgSessionSec) : '—'}
          </h2>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #0d9488' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.35rem' }}>เลื่อนอ่าน 50%+ วันนี้</p>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--admin-text-main)', margin: 0 }}>{today.scrollReaders}</h2>
        </div>
        <div className="admin-card" style={{ borderLeft: '4px solid #10b981' }}>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--admin-text-muted)', marginBottom: '0.35rem' }}>เปิดเนื้อหา/การบ้าน วันนี้</p>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--admin-text-main)', margin: 0 }}>
            {today.contentOpens + today.homeworkOpens}
          </h2>
          <p style={{ fontSize: '0.7rem', color: 'var(--admin-text-muted)', marginTop: '0.35rem' }}>
            เนื้อหา {today.contentOpens} · การบ้าน {today.homeworkOpens}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="admin-card">
          <SectionTitle>{range === 'today' ? 'เข้าเว็บรายชั่วโมง (วันนี้)' : `เข้าเว็บรายวัน (${rangeLabel})`}</SectionTitle>
          <BarChart data={visitChartData} />
        </div>
        <div className="admin-card">
          <SectionTitle>Top Pages ({rangeLabel})</SectionTitle>
          <DonutChart items={topPages} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="admin-card">
          <SectionTitle>Peak Hours ({rangeLabel})</SectionTitle>
          <BarChart
            data={peakHours.filter((h) => h.hour % 2 === 0)}
            color="#6366f1"
          />
        </div>
        <div className="admin-card">
          <SectionTitle>Device ({rangeLabel})</SectionTitle>
          <HBarList items={devices} />
        </div>
        <div className="admin-card">
          <SectionTitle>Funnel ({rangeLabel})</SectionTitle>
          <FunnelChart steps={funnel} />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.25rem',
        }}
      >
        <div className="admin-card">
          <SectionTitle>Top เนื้อหา ({rangeLabel})</SectionTitle>
          <TopContentList items={topContent} />
        </div>
        <div className="admin-card">
          <SectionTitle>Top การบ้าน ({rangeLabel})</SectionTitle>
          <HBarList
            items={topHomework.map((h) => ({
              label: h.title.length > 40 ? `${h.title.slice(0, 40)}…` : h.title,
              count: h.count,
              color: '#f59e0b',
            }))}
          />
        </div>
      </div>

      <div className="admin-card">
        <SectionTitle>Live Feed — กิจกรรมล่าสุด</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {liveFeed.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--admin-text-muted)', margin: 0 }}>ยังไม่มี activity</p>
          ) : (
            liveFeed.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.5rem 1rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '0.5rem',
                  background: 'var(--admin-bg-soft)',
                  border: '1px solid var(--admin-border)',
                  fontSize: '0.78rem',
                }}
              >
                <span style={{ color: 'var(--admin-text-muted)', whiteSpace: 'nowrap', minWidth: '110px' }}>
                  {formatShortTime(item.at)}
                </span>
                <span
                  style={{
                    padding: '2px 7px',
                    borderRadius: '4px',
                    fontWeight: 700,
                    fontSize: '0.68rem',
                    background: 'rgba(99,102,241,0.15)',
                    color: '#a5b4fc',
                  }}
                >
                  {item.label}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--admin-text-main)' }}>{item.pageLabel}</span>
                {item.detail && (
                  <span style={{ color: 'var(--admin-text-muted)' }}>{item.detail}</span>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--admin-text-muted)', fontSize: '0.72rem' }}>{item.who}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
