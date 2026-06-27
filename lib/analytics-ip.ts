import { parseMetadata, EVENT_LABELS, formatEventDetail, type AnalyticsMetadata } from './analytics';
import {
  formatResourceLabel,
  resolveResourceRef,
  type AnalyticsResourceLookups,
} from './analytics-links';

export type { AnalyticsResourceLookups } from './analytics-links';

export type AnalyticsEvent = {
  id: string;
  event_type: string;
  created_at: string;
  page_visited: string;
  content_id: string;
  session_id?: string;
  visitor_id?: string;
  metadata?: string;
};

const SKIP_EVENTS = new Set(['heartbeat']);

export type TimelineEntry = {
  id: string;
  at: string;
  eventType: string;
  label: string;
  detail: string;
  pageLabel: string;
  durationSec?: number;
  contentId?: string;
  resourceType?: 'content' | 'homework';
  resourceTitle?: string;
  resourceSubject?: string;
  resourceHref?: string;
};

export type TimelineSession = {
  sessionId: string;
  startedAt: string;
  endedAt: string;
  totalDurationSec: number;
  entries: TimelineEntry[];
};

export type PageSummary = {
  pageLabel: string;
  totalSec: number;
  visits: number;
  resourceHref?: string;
  contentId?: string;
};

export type IpNote = {
  name: string;
  note: string;
  updatedAt: string;
};

export type AnalyticsIpNoteRow = {
  ip_address: string;
  name: string;
  note: string;
  updated_at: string;
  updated_by: string;
};

function pageKey(row: AnalyticsEvent, meta: AnalyticsMetadata): string {
  if (meta.page) return String(meta.page);
  try {
    const u = new URL(row.page_visited);
    return u.pathname + u.hash;
  } catch {
    return row.page_visited || '';
  }
}

export function formatPageLabel(row: AnalyticsEvent, meta?: AnalyticsMetadata): string {
  const m = meta ?? parseMetadata(row.metadata);
  const key = pageKey(row, m);
  const path = key || row.page_visited.replace(/^https?:\/\/[^/]+/, '');

  if (path === '/' || path === '/kanban/' || path.endsWith('/kanban')) return 'Kanban';
  if (path === '/content' || (path.includes('/content') && !path.includes('#/view'))) return 'Archive';
  if (path.includes('#/view') || row.content_id) return `เนื้อหา · ${row.content_id || '...'}`;
  if (path.includes('/admin')) return 'Admin';
  return path || 'ไม่ทราบหน้า';
}

export function formatDuration(sec: number): string {
  if (sec <= 0) return '< 1 วิ';
  if (sec < 60) return `${sec} วินาที`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0 && s > 0) return `${m} นาที ${s} วิ`;
  return `${m} นาที`;
}

export function buildIpTimeline(
  events: AnalyticsEvent[],
  lookups?: AnalyticsResourceLookups
): TimelineSession[] {
  const filtered = events
    .filter((e) => !SKIP_EVENTS.has(e.event_type))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const bySession = new Map<string, AnalyticsEvent[]>();
  for (const e of filtered) {
    const sid = e.session_id || `legacy_${e.created_at.slice(0, 10)}`;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid)!.push(e);
  }

  const sessions: TimelineSession[] = [];

  for (const [sessionId, sessionEvents] of bySession) {
    const entries: TimelineEntry[] = [];
    let lastVisitTime: number | null = null;
    let lastVisitPage = '';
    let lastVisitEntryIdx: number | null = null;
    let totalDurationSec = 0;

    for (const e of sessionEvents) {
      const meta = parseMetadata(e.metadata);
      const t = new Date(e.created_at).getTime();
      const pageLabel = formatPageLabel(e, meta);

      if (e.event_type === 'visit') {
        if (lastVisitTime != null && lastVisitEntryIdx != null) {
          entries[lastVisitEntryIdx].durationSec = Math.max(1, Math.round((t - lastVisitTime) / 1000));
        }
        lastVisitTime = t;
        const visitEntry = applyResourceToEntry(
          {
            id: e.id,
            at: e.created_at,
            eventType: 'visit',
            label: EVENT_LABELS.visit,
            detail: '',
            pageLabel,
            contentId: e.content_id || undefined,
          },
          e,
          lookups
        );
        lastVisitPage = visitEntry.pageLabel;
        entries.push(visitEntry);
        lastVisitEntryIdx = entries.length - 1;
        continue;
      }

      if (e.event_type === 'session_end') {
        if (lastVisitTime != null && lastVisitEntryIdx != null) {
          entries[lastVisitEntryIdx].durationSec = Math.max(1, Math.round((t - lastVisitTime) / 1000));
        }
        totalDurationSec = Number(meta.duration_sec) || totalDurationSec;
        entries.push({
          id: e.id,
          at: e.created_at,
          eventType: 'session_end',
          label: EVENT_LABELS.session_end,
          detail: formatEventDetail('session_end', meta),
          pageLabel: lastVisitPage || pageLabel,
        });
        lastVisitTime = null;
        lastVisitEntryIdx = null;
        continue;
      }

      if (e.event_type === 'session_start') continue;

      entries.push(
        applyResourceToEntry(
          {
            id: e.id,
            at: e.created_at,
            eventType: e.event_type,
            label: EVENT_LABELS[e.event_type] || e.event_type,
            detail: formatEventDetail(e.event_type, meta),
            pageLabel,
            contentId: e.content_id || undefined,
          },
          e,
          lookups
        )
      );
    }

    const startedAt = sessionEvents[0].created_at;
    const endedAt = sessionEvents[sessionEvents.length - 1].created_at;
    sessions.push({
      sessionId,
      startedAt,
      endedAt,
      totalDurationSec:
        totalDurationSec ||
        Math.max(1, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)),
      entries: entries.reverse(),
    });
  }

  return sessions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function applyResourceToEntry(
  entry: TimelineEntry,
  event: AnalyticsEvent,
  lookups?: AnalyticsResourceLookups
): TimelineEntry {
  const ref = resolveResourceRef(entry.contentId || event.content_id, event.event_type, lookups);
  if (!ref) return entry;
  return {
    ...entry,
    contentId: ref.id,
    resourceType: ref.type,
    resourceTitle: ref.title,
    resourceSubject: ref.subject,
    resourceHref: ref.href,
    pageLabel: formatResourceLabel(ref),
  };
}

export function buildPageSummary(sessions: TimelineSession[]): PageSummary[] {
  const map = new Map<string, PageSummary>();

  for (const session of sessions) {
    for (const entry of session.entries) {
      if (entry.eventType !== 'visit') continue;
      const key = entry.pageLabel;
      const existing = map.get(key) || { pageLabel: key, totalSec: 0, visits: 0 };
      existing.visits += 1;
      existing.totalSec += entry.durationSec || 0;
      if (entry.resourceHref && !existing.resourceHref) {
        existing.resourceHref = entry.resourceHref;
        existing.contentId = entry.contentId;
      }
      map.set(key, existing);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalSec - a.totalSec);
}

export function ipNotesToMap(rows: AnalyticsIpNoteRow[]): Record<string, IpNote> {
  const map: Record<string, IpNote> = {};
  for (const row of rows) {
    if (!row.ip_address) continue;
    map[row.ip_address] = {
      name: row.name || '',
      note: row.note || '',
      updatedAt: row.updated_at || '',
    };
  }
  return map;
}

export const EVENT_COLORS: Record<string, string> = {
  visit: '#2563eb',
  session_end: '#8b5cf6',
  scroll_milestone: '#0d9488',
  check_content: '#10b981',
  do_work: '#f59e0b',
  view_image: '#ec4899',
};
