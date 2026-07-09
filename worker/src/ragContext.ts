import {
  getHomeworkList,
  getLearningContent,
  isSheetTruthy,
  type SheetBindings,
} from './sheets';

const APP_BASE_URL = 'https://pepsealsea.github.io/kanban';

const ADMIN_EMAILS = new Set([
  'pepsealsea@gmail.com',
  'iampep2009@gmail.com',
  'sealseapep@gmail.com',
]);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

export type ClassContextRow = {
  date: string;
  subject: string;
  homework: string;
  homeworkDeadline: string;
  createdDate: string;
  deadlineDate: string;
  content: string;
  emphasis: string;
  sourceLinks: string[];
  rowType: 'homework' | 'content';
};

export type RagContextSummary = {
  totalRows: number;
  totalSubjects: number;
  totalDates: number;
};

export const ALLOWED_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash',
] as const;

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

function normalizeText(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function sanitizeForPrompt(value: unknown): string {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`~\-]{1,}/g, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortText(value: unknown, maxLen: number): string {
  const text = sanitizeForPrompt(value);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function parseUrlList(raw: unknown): string[] {
  return String(raw || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split('#')[0].trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function parseDateValue(raw: string): Date | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  const iso = new Date(value);
  if (!Number.isNaN(iso.getTime())) return iso;

  const m = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  if (year > 2400) year -= 543;
  const parsed = new Date(year, month, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(rawDate: Date | null): string {
  if (!rawDate) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(rawDate);
}

function extractEmphasis(text: string): string {
  const matches = [...String(text || '').matchAll(/\*\*(.+?)\*\*/g)];
  if (matches.length === 0) return '';
  return matches.map((item) => item[1].trim()).filter(Boolean).join(' | ');
}

function getMidnightGMT7(date?: Date) {
  const d = date || new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const gmt7 = new Date(utc + 3600000 * 7);
  gmt7.setHours(0, 0, 0, 0);
  return gmt7;
}

export function buildClassContextRows(homeworkList: Record<string, string>[], learningContentList: Record<string, string>[]): ClassContextRow[] {
  const rows: ClassContextRow[] = [];

  for (const item of learningContentList) {
    if (isSheetTruthy(item.is_private)) continue;
    const itemDate = parseDateValue(String(item.date || ''));
    const description = String(item.description || '');
    const sourceLinks = Array.from(
      new Set([
        `${APP_BASE_URL}/content#/view?id=${encodeURIComponent(String(item.id || ''))}`,
        ...parseUrlList(item.links),
        ...parseUrlList(item.attachments),
      ])
    ).filter(Boolean);
    rows.push({
      date: formatDateOnly(itemDate),
      subject: String(item.subject || ''),
      homework: '',
      homeworkDeadline: '',
      createdDate: formatDateOnly(itemDate),
      deadlineDate: '',
      content: `${String(item.title || '')} ${description}`.trim(),
      emphasis: extractEmphasis(description),
      sourceLinks,
      rowType: 'content',
    });
  }

  for (const item of homeworkList) {
    const createdDate = parseDateValue(String(item.created_at || ''));
    const deadlineDate = parseDateValue(String(item.deadline || ''));
    const srcDate = createdDate || deadlineDate;
    const description = String(item.description || '');
    const note = String(item.note || '');
    const sourceLinks = Array.from(
      new Set([
        `${APP_BASE_URL}/#/view?id=${encodeURIComponent(String(item.id || ''))}`,
        ...parseUrlList(item.link_work),
        ...parseUrlList(item.link_image),
      ])
    ).filter(Boolean);
    rows.push({
      date: formatDateOnly(srcDate),
      subject: String(item.subject || ''),
      homework: `${String(item.title || '')} ${description} ${note}`.trim(),
      homeworkDeadline: formatDateOnly(deadlineDate),
      createdDate: formatDateOnly(createdDate),
      deadlineDate: formatDateOnly(deadlineDate),
      content: '',
      emphasis: `${extractEmphasis(description)} ${extractEmphasis(note)}`.trim(),
      sourceLinks,
      rowType: 'homework',
    });
  }

  return rows
    .filter((row) => row.date || row.homework || row.content)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function buildFullSheetDataChunk(rows: ClassContextRow[]): string {
  const payload = rows.map((row) => ({
    date: row.date || '-',
    subject: row.subject || '-',
    rowType: row.rowType,
    homework: row.homework || '',
    homeworkDeadline: row.homeworkDeadline || row.deadlineDate || '',
    createdDate: row.createdDate || '',
    deadlineDate: row.deadlineDate || '',
    content: row.content || '',
    emphasis: row.emphasis || '',
    sourceLinks: Array.from(new Set(row.sourceLinks || [])),
  }));

  return JSON.stringify(payload, null, 2);
}

export function buildRagSystemInstruction(fullSheetDataChunk: string): string {
  const chunk = fullSheetDataChunk && fullSheetDataChunk.trim() ? fullSheetDataChunk : '[]';
  const today = formatDateOnly(getMidnightGMT7(new Date()));
  return `คุณคือผู้เชี่ยวชาญวิเคราะห์เนื้อหาการเรียนทุกวิชา ของ StudyFlow (Kanban)
Take your time to analyze — ใช้เวลาไตร่ตรองอย่างละเอียดก่อนตอบทุกครั้ง

วันนี้ตามเวลาไทย (GMT+7): ${today}

[ข้อมูลทั้งหมดจาก Google Sheet]
${chunk}

[กระบวนการวิเคราะห์]
1. อ่านและทำความเข้าใจข้อมูลทุกแถว ทุกวิชา ทุกคาบเรียน ก่อนตอบคำถาม
2. เมื่อผู้ใช้ถาม "วันนี้" ให้กรองข้อมูลที่ date หรือ createdDate ตรงกับวันที่ ${today}
3. เมื่อผู้ใช้ถามสรุป kanban ให้สรุปการบ้านและเนื้อหาเรียนจากข้อมูลในชีต
4. เชื่อมโยงเนื้อหาที่เกี่ยวข้องกัน แม้มาจากวิชาหรือเวลาที่ต่างกัน
5. ห้ามใช้จินตนาการหรือข้อมูลนอกชีต หากไม่พบข้อมูลที่เกี่ยวข้อง ให้ระบุชัดเจน

[รูปแบบคำตอบ]
- เปิดด้วยบทสรุปภาพรวมที่ครอบคลุมและเชื่อมโยงกัน
- แยกตามหัวข้อ/วิชา/ช่วงเวลาที่เกี่ยวข้องกับคำถาม
- ระบุจุดเน้นจากครูและการบ้านที่เกี่ยวข้อง (ถ้ามี)
- ใช้ markdown เพื่อความอ่านง่าย (หัวข้อ, รายการ)
- ห้ามใส่รูปแบบอ้างอิงแบบ [1], [2], (ref), หรือ citation ใดๆ ในเนื้อหา`;
}

export function buildContextSummary(rows: ClassContextRow[]): RagContextSummary {
  const subjects = new Set(rows.map((row) => row.subject).filter(Boolean));
  const dates = new Set(rows.map((row) => row.date).filter(Boolean));
  return {
    totalRows: rows.length,
    totalSubjects: subjects.size,
    totalDates: dates.size,
  };
}

export function resolveGeminiModel(requested: unknown, env: { GEMINI_MODEL?: string }): string {
  const candidate = String(requested || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  if ((ALLOWED_GEMINI_MODELS as readonly string[]).includes(candidate)) {
    return candidate;
  }
  return DEFAULT_GEMINI_MODEL;
}

export function isGeminiLocationRestrictionError(err: unknown): boolean {
  const msg = normalizeText((err as Error | undefined)?.message || err || '');
  return (
    msg.includes('user location is not supported') ||
    msg.includes('unsupported country') ||
    msg.includes('location is not supported')
  );
}

export function buildFallbackAnswerFromRows(rows: ClassContextRow[], message: string): string {
  if (!rows.length) {
    return 'ขออภัยครับ ไม่พบข้อมูลในระบบตามช่วงเวลา/วิชาที่ระบุ';
  }

  const today = formatDateOnly(getMidnightGMT7(new Date()));
  const text = normalizeText(message);
  const wantsToday =
    text.includes('วันนี้') || text.includes('today') || text.includes('kanban');

  const filtered = wantsToday ? rows.filter((row) => row.date === today) : rows;
  const targetRows = (filtered.length > 0 ? filtered : rows).slice(0, 20);

  const grouped = new Map<
    string,
    { date: string; subject: string; content: string[]; emphasis: string[]; homework: string[]; deadlines: string[] }
  >();
  for (const row of targetRows) {
    const key = `${row.date || '-'}__${row.subject || '-'}`;
    const curr = grouped.get(key) || {
      date: row.date || '-',
      subject: row.subject || '-',
      content: [],
      emphasis: [],
      homework: [],
      deadlines: [],
    };
    if (row.content) curr.content.push(row.content);
    if (row.emphasis) curr.emphasis.push(row.emphasis);
    if (row.homework) curr.homework.push(row.homework);
    if (row.homeworkDeadline || row.deadlineDate) curr.deadlines.push(row.homeworkDeadline || row.deadlineDate);
    grouped.set(key, curr);
  }

  const lines: string[] = [];
  lines.push(`สรุปจากข้อมูลในระบบ (โหมดสำรอง): ${shortText(message, 100)}`);
  for (const item of Array.from(grouped.values()).slice(0, 6)) {
    const content = shortText(Array.from(new Set(item.content)).join(' | '), 420) || 'ไม่มี';
    const emphasis = shortText(Array.from(new Set(item.emphasis)).join(' | '), 220) || 'ไม่มี';
    const homework = shortText(Array.from(new Set(item.homework)).join(' | '), 260) || 'ไม่มี';
    const deadlines = shortText(Array.from(new Set(item.deadlines)).join(' | '), 120) || 'ไม่มี';
    lines.push(`\n📅 วันที่: ${item.date}`);
    lines.push(`📘 วิชา: ${item.subject}`);
    lines.push(`📝 สรุปเนื้อหาสำคัญ: ${content}`);
    lines.push(`จุดที่คุณครูเน้นย้ำ: ${emphasis}`);
    lines.push(`📌 การบ้านและกำหนดส่ง: ${homework} | กำหนดส่ง: ${deadlines}`);
  }
  lines.push('\nหมายเหตุ: ระบบสรุปด้วยข้อมูลในชีตโดยตรง เนื่องจาก Gemini API ของ key ปัจจุบันถูกจำกัดพื้นที่ใช้งาน');
  return lines.join('\n');
}

export async function loadRagContext(env: SheetBindings, userEmail: string) {
  const [homeworkList, learningContentList] = await Promise.all([
    getHomeworkList(env),
    getLearningContent(env),
  ]);

  const visibleLearningContent = isAdminEmail(userEmail)
    ? learningContentList
    : learningContentList.filter((item) => !isSheetTruthy(item.is_private));

  const contextRows = buildClassContextRows(homeworkList, visibleLearningContent);
  const fullSheetDataChunk = buildFullSheetDataChunk(contextRows);
  const systemInstruction = buildRagSystemInstruction(fullSheetDataChunk);
  const contextSummary = buildContextSummary(contextRows);

  return {
    contextRows,
    systemInstruction,
    contextSummary,
  };
}
