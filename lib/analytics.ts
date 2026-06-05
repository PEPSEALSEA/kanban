export const ANALYTICS_SESSION_KEY = 'analytics_session_id';
export const ANALYTICS_SESSION_START_KEY = 'analytics_session_start';

export type AnalyticsMetadata = Record<string, string | number | boolean | null | undefined>;

export function getOrCreateSessionId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(ANALYTICS_SESSION_KEY, id);
    sessionStorage.setItem(ANALYTICS_SESSION_START_KEY, String(Date.now()));
  }
  return id;
}

export function getSessionDurationSec(): number {
  if (typeof window === 'undefined') return 0;
  const start = sessionStorage.getItem(ANALYTICS_SESSION_START_KEY);
  if (!start) return 0;
  return Math.round((Date.now() - parseInt(start, 10)) / 1000);
}

export function parseMetadata(raw: string | undefined): AnalyticsMetadata {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AnalyticsMetadata;
  } catch {
    return { raw };
  }
}

export const EVENT_LABELS: Record<string, string> = {
  visit: 'เข้าหน้าเว็บ',
  session_start: 'เริ่มเซสชัน',
  session_end: 'ออกจากเว็บ',
  heartbeat: 'ยังออนไลน์',
  scroll_milestone: 'เลื่อนอ่าน',
  scroll_depth: 'ความลึกการเลื่อน',
  view_image: 'เปิดดูรูป/ไฟล์',
  check_content: 'เปิดเนื้อหา',
  do_work: 'เปิดการบ้าน',
};

export function formatEventDetail(eventType: string, metadata: AnalyticsMetadata): string {
  if (eventType === 'session_end' && metadata.duration_sec != null) {
    const sec = Number(metadata.duration_sec);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    let line = `อยู่บนเว็บ ${m > 0 ? `${m} นาที ` : ''}${s} วินาที`;
    if (metadata.max_scroll_percent != null) {
      line += ` · อ่านถึง ~${metadata.max_scroll_percent}%`;
    }
    if (metadata.estimated_line != null) {
      line += ` (~บรรทัดที่ ${metadata.estimated_line})`;
    }
    return line;
  }
  if (eventType === 'scroll_milestone' && metadata.percent != null) {
    return `เลื่อนอ่านถึง ${metadata.percent}% ของหน้า`;
  }
  if (eventType === 'scroll_depth' && metadata.percent != null) {
    return `เลื่อนลง ${metadata.percent}%`;
  }
  if (eventType === 'view_image' && metadata.title) {
    return String(metadata.title);
  }
  if (metadata.page) return String(metadata.page);
  return '';
}
