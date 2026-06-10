import { parseMetadata, EVENT_LABELS, formatEventDetail } from './analytics';
import { formatPageLabel, type AnalyticsEvent } from './analytics-ip';

export type AnalyticsRow = AnalyticsEvent & {
  device_name?: string;
  browser?: string;
  ip_address?: string;
  email?: string;
  fingerprint?: string;
};

export type DateRangeDays = 7 | 30 | 'month';

const SKIP = new Set(['heartbeat', 'session_start']);
const ONLINE_THRESHOLD_MS = 10 * 60 * 1000;

const PAGE_COLORS: Record<string, string> = {
  Kanban: '#2563eb',
  Archive: '#8b5cf6',
  Content: '#10b981',
  Admin: '#f59e0b',
  Other: '#64748b',
};

export function getPageCategory(row: AnalyticsRow): keyof typeof PAGE_COLORS {
  const label = formatPageLabel(row);
  if (label === 'Kanban') return 'Kanban';
  if (label === 'Archive') return 'Archive';
  if (label.startsWith('เนื้อหา')) return 'Content';
  if (label === 'Admin') return 'Admin';
  return 'Other';
}

export function extractContentId(row: AnalyticsRow): string | null {
  if (row.content_id) return row.content_id;
  const match = row.page_visited?.match(/[#?&]id=([^&#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isToday(iso: string): boolean {
  return new Date(iso) >= startOfToday();
}

export function isInRange(iso: string, range: DateRangeDays): boolean {
  const t = new Date(iso).getTime();
  if (range === 'month') {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return t >= start.getTime();
  }
  return t >= Date.now() - range * 24 * 60 * 60 * 1000;
}

export function filterAnalytics(rows: AnalyticsRow[], range: DateRangeDays): AnalyticsRow[] {
  return rows.filter((r) => !SKIP.has(r.event_type) && isInRange(r.created_at, range));
}

export function isLikelyOnline(lastSeen: string): boolean {
  return Date.now() - new Date(lastSeen).getTime() < ONLINE_THRESHOLD_MS;
}

export function getLastPageLabel(events: AnalyticsRow[]): string {
  const sorted = [...events].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const visit = sorted.find((e) => e.event_type === 'visit');
  if (visit) return formatPageLabel(visit);
  if (sorted[0]) return formatPageLabel(sorted[0]);
  return '—';
}

export type TodaySummary = {
  uniqueVisitors: number;
  visits: number;
  avgSessionSec: number;
  scrollReaders: number;
  contentOpens: number;
  homeworkOpens: number;
};

export function buildTodaySummary(rows: AnalyticsRow[]): TodaySummary {
  const today = rows.filter((r) => isToday(r.created_at) && !SKIP.has(r.event_type));
  const ips = new Set<string>();
  const emails = new Set<string>();
  let sessionTotal = 0;
  let sessionCount = 0;

  for (const r of today) {
    if (r.ip_address) ips.add(r.ip_address);
    if (r.email) emails.add(r.email.toLowerCase());
    if (r.event_type === 'session_end') {
      const meta = parseMetadata(r.metadata);
      sessionTotal += Number(meta.duration_sec) || 0;
      sessionCount += 1;
    }
  }

  const scrollReaders = new Set(
    today
      .filter((r) => r.event_type === 'scroll_milestone')
      .map((r) => r.ip_address || r.email)
      .filter(Boolean)
  ).size;

  return {
    uniqueVisitors: Math.max(ips.size, emails.size),
    visits: today.filter((r) => r.event_type === 'visit').length,
    avgSessionSec: sessionCount > 0 ? Math.round(sessionTotal / sessionCount) : 0,
    scrollReaders,
    contentOpens: today.filter((r) => r.event_type === 'check_content').length,
    homeworkOpens: today.filter((r) => r.event_type === 'do_work').length,
  };
}

export type DayCount = { key: string; label: string; count: number };

export function buildVisitsByDay(rows: AnalyticsRow[], range: DateRangeDays): DayCount[] {
  const filtered = filterAnalytics(rows, range).filter((r) => r.event_type === 'visit');
  const map = new Map<string, number>();

  for (const r of filtered) {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    map.set(key, (map.get(key) || 0) + 1);
  }

  const result: DayCount[] = [];
  const now = new Date();

  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({
        key,
        label: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
        count: map.get(key) || 0,
      });
    }
    return result;
  }

  const dayCount = range === 7 ? 7 : 30;
  for (let i = dayCount - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push({
      key,
      label: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
      count: map.get(key) || 0,
    });
  }
  return result;
}

export type RankItem = { label: string; count: number; color: string };

export function buildTopPages(rows: AnalyticsRow[]): RankItem[] {
  const map = new Map<string, number>();
  for (const r of filterAnalytics(rows, 30)) {
    if (r.event_type !== 'visit') continue;
    const cat = getPageCategory(r);
    map.set(cat, (map.get(cat) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count, color: PAGE_COLORS[label] || PAGE_COLORS.Other }))
    .sort((a, b) => b.count - a.count);
}

export type HourCount = { hour: number; label: string; count: number };

export function buildPeakHours(rows: AnalyticsRow[]): HourCount[] {
  const map = new Map<number, number>();
  for (const r of rows) {
    if (r.event_type !== 'visit' || SKIP.has(r.event_type)) continue;
    const h = new Date(r.created_at).getHours();
    map.set(h, (map.get(h) || 0) + 1);
  }
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, '0')}:00`,
    count: map.get(hour) || 0,
  }));
}

export function buildTopContent(
  rows: AnalyticsRow[],
  titles: Record<string, string>
): { id: string; title: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== 'check_content') continue;
    const id = extractContentId(r);
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([id, count]) => ({ id, title: titles[id] || id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function buildTopHomework(
  rows: AnalyticsRow[],
  titles: Record<string, string>
): { id: string; title: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.event_type !== 'do_work') continue;
    const id = extractContentId(r);
    if (!id) continue;
    map.set(id, (map.get(id) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([id, count]) => ({ id, title: titles[id] || `#${id}`, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export type FunnelStep = { step: string; count: number; color: string };

export function buildFunnel(rows: AnalyticsRow[]): FunnelStep[] {
  const filtered = rows.filter((r) => !SKIP.has(r.event_type));
  const visits = filtered.filter((r) => r.event_type === 'visit').length;
  const scrolled = filtered.filter((r) => {
    if (r.event_type !== 'scroll_milestone') return false;
    const meta = parseMetadata(r.metadata);
    return Number(meta.percent) >= 50;
  }).length;
  const engaged = filtered.filter(
    (r) => r.event_type === 'check_content' || r.event_type === 'do_work'
  ).length;
  const sessions = filtered.filter((r) => r.event_type === 'session_end').length;

  return [
    { step: 'เข้าหน้าเว็บ', count: visits, color: '#2563eb' },
    { step: 'เลื่อนอ่าน 50%+', count: scrolled, color: '#0d9488' },
    { step: 'เปิดเนื้อหา/การบ้าน', count: engaged, color: '#10b981' },
    { step: 'ปิดเซสชัน', count: sessions, color: '#8b5cf6' },
  ];
}

export type FeedItem = {
  id: string;
  at: string;
  eventType: string;
  label: string;
  detail: string;
  pageLabel: string;
  who: string;
};

export function buildLiveFeed(rows: AnalyticsRow[], limit = 15): FeedItem[] {
  return rows
    .filter((r) => !SKIP.has(r.event_type))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map((r) => {
      const meta = parseMetadata(r.metadata);
      return {
        id: r.id,
        at: r.created_at,
        eventType: r.event_type,
        label: EVENT_LABELS[r.event_type] || r.event_type,
        detail: formatEventDetail(r.event_type, meta),
        pageLabel: formatPageLabel(r),
        who: r.email || r.ip_address || 'Guest',
      };
    });
}

export function buildDeviceBreakdown(rows: AnalyticsRow[]): RankItem[] {
  const map = new Map<string, number>();
  const colors: Record<string, string> = { Desktop: '#6366f1', Mobile: '#10b981', Tablet: '#f59e0b' };
  for (const r of rows) {
    if (!r.device_name) continue;
    map.set(r.device_name, (map.get(r.device_name) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count, color: colors[label] || '#64748b' }))
    .sort((a, b) => b.count - a.count);
}

export { PAGE_COLORS };
