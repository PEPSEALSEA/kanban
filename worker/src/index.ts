import { Hono, Context } from 'hono';
import { cors } from 'hono/cors';
import { JWT } from 'google-auth-library';
import { buildContentExport, formatContentAsText } from './contentExport';
import {
  resolveAudioAccessLevel,
  sanitizeLearningContentList,
} from './audioSecurity';
import { handleAiChatRequest } from './aiChat';

type Bindings = {
  SPREADSHEET_ID: string;
  DISCORD_WEBHOOK_URL: string;
  SUMMARY_WEBHOOK_URL: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  GOOGLE_CLIENT_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', cors());

const ADMIN_EMAILS = new Set([
  'pepsealsea@gmail.com',
  'iampep2009@gmail.com',
  'sealseapep@gmail.com',
]);

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.trim().toLowerCase());
}

function isSheetTruthy(v?: string) {
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

function filterPrivateLearningContent(items: any[], email: string | null | undefined) {
  if (isAdminEmail(email)) return items;
  return items.filter((item) => !isSheetTruthy(item.is_private));
}

// --- GOOGLE ID TOKEN VERIFICATION ---

const jwksCache: { keys: any[]; exp: number } = { keys: [], exp: 0 };

async function getGooglePublicKeys(): Promise<any[]> {
  if (Date.now() < jwksCache.exp && jwksCache.keys.length > 0) return jwksCache.keys;
  const res = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  const { keys } = await res.json() as { keys: any[] };
  jwksCache.keys = keys;
  jwksCache.exp = Date.now() + 5 * 60 * 60 * 1000;
  return keys;
}

function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function verifyGoogleIdToken(
  token: string,
  clientId: string
): Promise<{ email: string; name?: string; picture?: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');
  if (payload.aud !== clientId) throw new Error('Invalid audience');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)) {
    throw new Error('Invalid issuer');
  }

  const keys = await getGooglePublicKeys();
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) throw new Error('Signing key not found');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const sig = b64urlDecode(parts[2]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, sig, data);
  if (!valid) throw new Error('Invalid token signature');
  if (!payload.email) throw new Error('Token missing email claim');

  return { email: payload.email as string, name: payload.name, picture: payload.picture };
}

type AppContext = Context<{ Bindings: Bindings }>;

async function requireAuth(c: AppContext): Promise<{ email: string }> {
  const authHeader = c.req.header('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) throw new Error('Authentication required');
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID not configured');
  return verifyGoogleIdToken(token, clientId);
}

async function requireAdmin(c: AppContext): Promise<{ email: string }> {
  const user = await requireAuth(c);
  if (!isAdminEmail(user.email)) throw new Error('Admin access required');
  return user;
}

async function optionalAuth(c: AppContext): Promise<string> {
  try {
    const user = await requireAuth(c);
    return user.email;
  } catch {
    return '';
  }
}

async function resolveAudioAccess(env: Bindings, email?: string) {
  const permitted = await getAudioPermissions(env);
  return resolveAudioAccessLevel(email, permitted, isAdminEmail);
}

async function assertAudioAccess(env: Bindings, email?: string) {
  const level = await resolveAudioAccess(env, email);
  if (level === 'none') {
    throw new Error('Audio access denied');
  }
  return level;
}

const SHEETS = {
  HOMEWORK: "Homework",
  USERS: "Users",
  PROGRESS: "Progress",
  URLS: "URLs",
  COMMENTS: "Comments",
  LEARNING_CONTENT: "LearningContent",
  SUBJECTS: "Subjects",
  ANALYTICS: "Analytics",
  ANALYTICS_IP_NOTES: "AnalyticsIpNotes",
  AUDIO_PERMISSIONS: "AudioPermissions",
  AI_CHAT_LOGS: "AiChatLogs",
};

const EXPECTED_HEADERS = {
  [SHEETS.HOMEWORK]: ["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"],
  [SHEETS.USERS]: ["email", "name", "picture", "created_at"],
  [SHEETS.PROGRESS]: ["email", "homework_id", "status", "image_url", "updated_at"],
  [SHEETS.LEARNING_CONTENT]: ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "is_private", "created_at"],
  [SHEETS.SUBJECTS]: ["id", "name", "color", "created_at"],
  [SHEETS.COMMENTS]: ["homework_id", "owner_email", "commenter_email", "text", "created_at"],
  [SHEETS.URLS]: ["id", "filename", "contentType", "url", "created_at", "uploader", "fileId"],
  [SHEETS.ANALYTICS]: ["id", "event_type", "device_name", "browser", "ip_address", "email", "created_at", "page_visited", "content_id", "fingerprint", "session_id", "metadata", "visitor_id"],
  [SHEETS.ANALYTICS_IP_NOTES]: ["ip_address", "name", "note", "updated_at", "updated_by"],
  [SHEETS.AUDIO_PERMISSIONS]: ["email", "note", "created_at"],
  [SHEETS.AI_CHAT_LOGS]: [
    "id", "email", "user_name", "user_message", "ai_answer", "model", "attachment_name",
    "status", "context_total_rows", "context_subjects", "context_dates",
    "references_json", "source_links_json", "error_message", "created_at",
  ],
};

const ANALYTICS_COLUMNS = EXPECTED_HEADERS[SHEETS.ANALYTICS];
const ANALYTICS_IP_NOTES_COLUMNS = EXPECTED_HEADERS[SHEETS.ANALYTICS_IP_NOTES];
const AI_CHAT_LOGS_COLUMNS = EXPECTED_HEADERS[SHEETS.AI_CHAT_LOGS];
const APP_BASE_URL = "https://pepsealsea.github.io/kanban";


// --- AUTH & API HELPERS ---

let cachedAuthToken: { value: string; expiresAt: number } | null = null;
let authTokenPromise: Promise<string> | null = null;

async function getAuthToken(env: Bindings): Promise<string> {
  const now = Date.now();
  if (cachedAuthToken && now < cachedAuthToken.expiresAt - 60_000) {
    return cachedAuthToken.value;
  }
  if (!authTokenPromise) {
    authTokenPromise = (async () => {
      const client = new JWT({
        email: env.GOOGLE_CLIENT_EMAIL,
        key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const credentials = await client.authorize();
      const token = credentials.access_token as string;
      cachedAuthToken = { value: token, expiresAt: now + 3_500_000 };
      authTokenPromise = null;
      return token;
    })();
  }
  return authTokenPromise;
}

async function getSheetValues(env: Bindings, range: string) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  const data = await res.json() as any;
  return data.values || [];
}

async function appendSheetRow(env: Bindings, range: string, values: any[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  return await res.json();
}

async function updateSheetRow(env: Bindings, range: string, values: any[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  return await res.json();
}

async function batchUpdateSheet(env: Bindings, requests: any[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`Sheets API error: ${res.statusText}`);
  return await res.json();
}

// --- UTILITIES ---

function toObjects(rows: any[][], headers: string[]) {
  if (!rows || rows.length === 0) return [];
  return rows.map(row => {
    const obj: any = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ""; });
    return obj;
  });
}

async function findRowIndexById(env: Bindings, sheetName: string, id: string) {
  const rows = await getSheetValues(env, `${sheetName}!A:A`);
  return rows.findIndex((r: any) => String(r[0]) === String(id));
}

function getMidnightGMT7(date?: Date) {
  const d = date || new Date();
  // Simple GMT+7 shift for comparison
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const gmt7 = new Date(utc + (3600000 * 7));
  gmt7.setHours(0, 0, 0, 0);
  return gmt7;
}

type ClassContextRow = {
  date: string;
  subject: string;
  homework: string;
  homeworkDeadline: string;
  createdDate: string;
  deadlineDate: string;
  content: string;
  emphasis: string;
  sourceLinks: string[];
  rowType: "homework" | "content";
};

function normalizeText(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function sanitizeForPrompt(value: unknown): string {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`~\-]{1,}/g, " ")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortText(value: unknown, maxLen: number): string {
  const text = sanitizeForPrompt(value);
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

function stripCitationMarkers(text: string): string {
  return String(text || "")
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, "")
    .replace(/\((?:ref|reference|citation)[^)]*\)/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isGeminiLocationRestrictionError(err: unknown): boolean {
  const msg = normalizeText((err as Error | undefined)?.message || err || "");
  return (
    msg.includes("user location is not supported") ||
    msg.includes("unsupported country") ||
    msg.includes("location is not supported")
  );
}

function buildFallbackAnswerFromRows(rows: ClassContextRow[], message: string): string {
  if (!rows.length) {
    return "ขออภัยครับ ไม่พบข้อมูลในระบบตามช่วงเวลา/วิชาที่ระบุ";
  }

  const grouped = new Map<string, { date: string; subject: string; content: string[]; emphasis: string[]; homework: string[]; deadlines: string[] }>();
  for (const row of rows.slice(0, 20)) {
    const key = `${row.date || "-"}__${row.subject || "-"}`;
    const curr = grouped.get(key) || {
      date: row.date || "-",
      subject: row.subject || "-",
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
    const content = shortText(Array.from(new Set(item.content)).join(" | "), 420) || "ไม่มี";
    const emphasis = shortText(Array.from(new Set(item.emphasis)).join(" | "), 220) || "ไม่มี";
    const homework = shortText(Array.from(new Set(item.homework)).join(" | "), 260) || "ไม่มี";
    const deadlines = shortText(Array.from(new Set(item.deadlines)).join(" | "), 120) || "ไม่มี";
    lines.push(`\n📅 วันที่: ${item.date}`);
    lines.push(`📘 วิชา: ${item.subject}`);
    lines.push(`📝 สรุปเนื้อหาสำคัญ: ${content}`);
    lines.push(`จุดที่คุณครูเน้นย้ำ: ${emphasis}`);
    lines.push(`📌 การบ้านและกำหนดส่ง: ${homework} | กำหนดส่ง: ${deadlines}`);
  }
  lines.push("\nหมายเหตุ: ระบบสรุปด้วยข้อมูลในชีตโดยตรง เนื่องจาก Gemini API ของ key ปัจจุบันถูกจำกัดพื้นที่ใช้งาน");
  return lines.join("\n");
}

function parseUrlList(raw: unknown): string[] {
  return String(raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.split("#")[0].trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

function parseDateValue(raw: string): Date | null {
  const value = String(raw || "").trim();
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
  if (!rawDate) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(rawDate);
}

function extractEmphasis(text: string): string {
  const matches = [...String(text || "").matchAll(/\*\*(.+?)\*\*/g)];
  if (matches.length === 0) return "";
  return matches.map((item) => item[1].trim()).filter(Boolean).join(" | ");
}

function parseDateRangeFromMessage(message: string): { start: string; end: string } | null {
  const dateMatches = message.match(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/g);
  if (!dateMatches || dateMatches.length < 2) return null;
  const d1 = parseDateValue(dateMatches[0]);
  const d2 = parseDateValue(dateMatches[1]);
  if (!d1 || !d2) return null;
  const start = d1 <= d2 ? d1 : d2;
  const end = d1 <= d2 ? d2 : d1;
  return { start: formatDateOnly(start), end: formatDateOnly(end) };
}

function inferTodayHomeworkIntent(message: string): boolean {
  const text = normalizeText(message);
  return (
    (text.includes("การบ้าน") || text.includes("homework")) &&
    (text.includes("วันนี้") || text.includes("today"))
  );
}

function inferEmphasisIntent(message: string): boolean {
  const text = normalizeText(message);
  return (
    text.includes("เน้น") ||
    text.includes("จุดสำคัญ") ||
    text.includes("สำคัญ") ||
    text.includes("highlight") ||
    text.includes("emphasis")
  );
}

type DateTarget = "today" | "tomorrow" | null;

type QueryIntent = {
  subjectKeywords: string[];
  dateRange: { start: string; end: string } | null;
  dateTarget: DateTarget;
  dueDateTarget: DateTarget;
  wantsEmphasis: boolean;
  todayHomework: boolean;
  wantsExamSummary: boolean;
  explicitWebSearch: boolean;
};

type FilterSummary = {
  subjectKeywords: string[];
  dateRange: { start: string; end: string } | null;
  dateTarget: DateTarget;
  dueDateTarget: DateTarget;
  wantsEmphasis: boolean;
  explicitWebSearch: boolean;
  matchedRowsCount: number;
  sourceDates: string[];
  sourceSubjects: string[];
};

type ContextSummary = {
  totalRows: number;
  totalSubjects: number;
  totalDates: number;
  modelUsed: string;
  contextWarning?: string;
};

const ALLOWED_GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
] as const;

const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const CONTEXT_SIZE_WARNING_CHARS = 900_000;

function inferDateTarget(message: string): DateTarget {
  const text = normalizeText(message);
  if (text.includes("พรุ่งนี้") || text.includes("พน") || text.includes("tomorrow")) return "tomorrow";
  if (text.includes("วันนี้") || text.includes("today")) return "today";
  return null;
}

function inferDueDateTarget(message: string): DateTarget {
  const text = normalizeText(message);
  const asksDueDate =
    text.includes("ต้องส่ง") ||
    text.includes("กำหนดส่ง") ||
    text.includes("ครบกำหนด") ||
    text.includes("deadline") ||
    text.includes("due");
  if (!asksDueDate) return null;
  return inferDateTarget(message);
}

function inferExamSummaryIntent(message: string): boolean {
  const text = normalizeText(message);
  return (
    text.includes("สอบ") ||
    text.includes("exam") ||
    text.includes("midterm") ||
    text.includes("final") ||
    text.includes("prelim")
  );
}

function shouldUseGrounding(message: string): boolean {
  const text = normalizeText(message);
  return (
    text.includes("ค้นเว็บ") ||
    text.includes("ค้นหาเว็บ") ||
    text.includes("google search") ||
    text.includes("web search") ||
    text.includes("internet") ||
    text.includes("อินเทอร์เน็ต") ||
    text.includes("ข้อมูลจากเว็บ")
  );
}

function extractSubjectKeywords(message: string, availableSubjects: string[]): string[] {
  const text = normalizeText(message);
  const fromSubjects = availableSubjects
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .filter((subject) => text.includes(normalizeText(subject)));
  const staticKeywords = ["คณิต", "คณิตศาสตร์", "อังกฤษ", "eng", "วิทย์", "science", "ไทย", "สังคม"];
  const fromStatic = staticKeywords.filter((item) => text.includes(normalizeText(item)));
  return Array.from(new Set([...fromSubjects, ...fromStatic]));
}

function parseUserQueryIntent(message: string, availableSubjects: string[]): QueryIntent {
  return {
    subjectKeywords: extractSubjectKeywords(message, availableSubjects),
    dateRange: parseDateRangeFromMessage(message),
    dateTarget: inferDateTarget(message),
    dueDateTarget: inferDueDateTarget(message),
    wantsEmphasis: inferEmphasisIntent(message),
    todayHomework: inferTodayHomeworkIntent(message),
    wantsExamSummary: inferExamSummaryIntent(message),
    explicitWebSearch: shouldUseGrounding(message),
  };
}

function buildClassContextRows(homeworkList: any[], learningContentList: any[]): ClassContextRow[] {
  const rows: ClassContextRow[] = [];

  for (const item of learningContentList) {
    if (isSheetTruthy(item.is_private)) continue;
    const itemDate = parseDateValue(String(item.date || ""));
    const description = String(item.description || "");
    const sourceLinks = Array.from(
      new Set([
        `${APP_BASE_URL}/content#/view?id=${encodeURIComponent(String(item.id || ""))}`,
        ...parseUrlList(item.links),
        ...parseUrlList(item.attachments),
      ])
    ).filter(Boolean);
    rows.push({
      date: formatDateOnly(itemDate),
      subject: String(item.subject || ""),
      homework: "",
      homeworkDeadline: "",
      createdDate: formatDateOnly(itemDate),
      deadlineDate: "",
      content: `${String(item.title || "")} ${description}`.trim(),
      emphasis: extractEmphasis(description),
      sourceLinks,
      rowType: "content",
    });
  }

  for (const item of homeworkList) {
    const createdDate = parseDateValue(String(item.created_at || ""));
    const deadlineDate = parseDateValue(String(item.deadline || ""));
    const srcDate = createdDate || deadlineDate;
    const description = String(item.description || "");
    const note = String(item.note || "");
    const sourceLinks = Array.from(
      new Set([
        `${APP_BASE_URL}/#/view?id=${encodeURIComponent(String(item.id || ""))}`,
        ...parseUrlList(item.link_work),
        ...parseUrlList(item.link_image),
      ])
    ).filter(Boolean);
    rows.push({
      date: formatDateOnly(srcDate),
      subject: String(item.subject || ""),
      homework: `${String(item.title || "")} ${description} ${note}`.trim(),
      homeworkDeadline: formatDateOnly(deadlineDate),
      createdDate: formatDateOnly(createdDate),
      deadlineDate: formatDateOnly(deadlineDate),
      content: "",
      emphasis: `${extractEmphasis(description)} ${extractEmphasis(note)}`.trim(),
      sourceLinks,
      rowType: "homework",
    });
  }

  return rows
    .filter((row) => row.date || row.homework || row.content)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function rowMatchesMessage(row: ClassContextRow, message: string): boolean {
  const text = normalizeText(message);
  if (!text) return true;
  const source = normalizeText(
    `${row.subject} ${row.homework} ${row.content} ${row.emphasis} ${row.deadlineDate} ${row.createdDate} ${row.sourceLinks.join(" ")}`
  );
  if (source.includes(text)) return true;
  const tokens = text.split(/\s+/).filter((t) => t.length >= 3).slice(0, 8);
  if (tokens.length <= 1) return true;
  const hitCount = tokens.reduce((acc, token) => acc + (source.includes(token) ? 1 : 0), 0);
  return hitCount >= Math.max(1, Math.floor(tokens.length / 3));
}

function dateTargetToValue(target: DateTarget): string {
  const today = formatDateOnly(getMidnightGMT7(new Date()));
  const tomorrow = formatDateOnly(new Date(getMidnightGMT7(new Date()).getTime() + 86400000));
  if (target === "today") return today;
  if (target === "tomorrow") return tomorrow;
  return "";
}

function filterRowsByIntent(rows: ClassContextRow[], message: string, intent: QueryIntent): ClassContextRow[] {
  const targetDate = dateTargetToValue(intent.dateTarget);
  const dueTargetDate = dateTargetToValue(intent.dueDateTarget);

  let result = rows;

  if (intent.dueDateTarget && dueTargetDate) {
    result = result.filter((row) => row.rowType === "homework" && row.deadlineDate === dueTargetDate);
  }

  if (intent.subjectKeywords.length > 0) {
    result = result.filter((row) =>
      intent.subjectKeywords.some((subjectKey) => {
        const key = normalizeText(subjectKey);
        const subject = normalizeText(row.subject);
        return subject.includes(key) || key.includes(subject);
      })
    );
  }

  if (intent.todayHomework) {
    const today = dateTargetToValue("today");
    result = result.filter((row) => row.date === today && row.homework);
  }

  if (intent.dateRange) {
    result = result.filter((row) => {
      const compareDate = intent.dueDateTarget ? row.deadlineDate : row.date;
      if (!compareDate) return false;
      return compareDate >= intent.dateRange!.start && compareDate <= intent.dateRange!.end;
    });
  }

  if (!intent.dateRange && intent.dateTarget && targetDate && !intent.dueDateTarget) {
    result = result.filter((row) => row.date === targetDate);
  }

  if (intent.wantsExamSummary && !intent.dateRange && !intent.dateTarget) {
    const cutoff = formatDateOnly(new Date(getMidnightGMT7(new Date()).getTime() - 60 * 86400000));
    const recent = result.filter((row) => row.date >= cutoff);
    if (recent.length > 0) result = recent;
  }

  const keywordFiltered = result.filter((row) => rowMatchesMessage(row, message));
  if (keywordFiltered.length > 0) {
    result = keywordFiltered;
  }

  if (intent.wantsEmphasis) {
    const withEmphasis = result.filter((row) => row.emphasis);
    if (withEmphasis.length > 0) result = withEmphasis;
  }

  if (result.length === 0) {
    const cutoff = formatDateOnly(new Date(getMidnightGMT7(new Date()).getTime() - 30 * 86400000));
    const recent = rows.filter((row) => row.date >= cutoff);
    result = recent.length > 0 ? recent : rows;
  }

  return result.slice(0, 30);
}

function resolveGeminiModel(requested: unknown, env: Bindings): string {
  const candidate = String(requested || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  if ((ALLOWED_GEMINI_MODELS as readonly string[]).includes(candidate)) {
    return candidate;
  }
  return DEFAULT_GEMINI_MODEL;
}

function buildFullSheetDataChunk(rows: ClassContextRow[]): string {
  const payload = rows.map((row) => ({
    date: row.date || "-",
    subject: row.subject || "-",
    rowType: row.rowType,
    homework: shortText(row.homework, 480),
    homeworkDeadline: row.homeworkDeadline || row.deadlineDate || "",
    createdDate: row.createdDate || "",
    deadlineDate: row.deadlineDate || "",
    content: shortText(row.content, 480),
    emphasis: shortText(row.emphasis, 200),
  }));

  return JSON.stringify(payload);
}

function buildRagSystemInstruction(fullSheetDataChunk: string): string {
  const chunk = fullSheetDataChunk && fullSheetDataChunk.trim() ? fullSheetDataChunk : "[]";
  return `คุณคือผู้เชี่ยวชาญวิเคราะห์เนื้อหาการเรียนทุกวิชา
Take your time to analyze — ใช้เวลาไตร่ตรองอย่างละเอียดก่อนตอบทุกครั้ง

[ข้อมูลที่เกี่ยวข้องจาก Google Sheet — กรองตามคำถามแล้ว]
${chunk}

[กระบวนการวิเคราะห์]
1. อ่านและทำความเข้าใจข้อมูลทุกแถว ทุกวิชา ทุกคาบเรียน ก่อนตอบคำถาม
2. เมื่อผู้ใช้ให้ keyword หรือหัวข้อ ให้ค้นหาเชิงลึก (Deep Content Search) ข้ามวิชาและข้ามวันที่
3. เชื่อมโยงเนื้อหาที่เกี่ยวข้องกัน แม้มาจากวิชาหรือเวลาที่ต่างกัน
4. ไม่ข้ามรายละเอียดสำคัญ แม้ข้อมูลจะกระจายอยู่หลายคาบหรือหลายวิชา
5. ห้ามใช้จินตนาการหรือข้อมูลนอกชีต หากไม่พบข้อมูลที่เกี่ยวข้อง ให้ระบุชัดเจน

[รูปแบบคำตอบ]
- เปิดด้วยบทสรุปภาพรวมที่ครอบคลุมและเชื่อมโยงกัน
- แยกตามหัวข้อ/วิชา/ช่วงเวลาที่เกี่ยวข้องกับคำถาม
- ระบุจุดเน้นจากครูและการบ้านที่เกี่ยวข้อง (ถ้ามี)
- ใช้ markdown เพื่อความอ่านง่าย (หัวข้อ, รายการ)
- ห้ามใส่รูปแบบอ้างอิงแบบ [1], [2], (ref), หรือ citation ใดๆ ในเนื้อหา
- หากต้องระบุแหล่งที่มา ให้แสดงเฉพาะลิงก์จริงภายใต้หัวข้อ "แหล่งที่มา" เท่านั้น`;
}

function buildContextSummary(
  rows: ClassContextRow[],
  modelUsed: string,
  chunkLength: number
): ContextSummary {
  const subjects = new Set(rows.map((row) => row.subject).filter(Boolean));
  const dates = new Set(rows.map((row) => row.date).filter(Boolean));
  const summary: ContextSummary = {
    totalRows: rows.length,
    totalSubjects: subjects.size,
    totalDates: dates.size,
    modelUsed,
  };
  if (chunkLength > CONTEXT_SIZE_WARNING_CHARS) {
    summary.contextWarning = "ข้อมูล context มีขนาดใหญ่มาก อาจใกล้ขีดจำกัดของโมเดล";
  }
  return summary;
}

type ChatReference = {
  refId: number;
  date: string;
  subject: string;
  rowType: "homework" | "content";
  title: string;
  snippet: string;
  sourceLinks: string[];
  archiveUrl?: string;
};

function tokenizeForScoring(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
    .slice(0, 40);
}

function scoreRowRelevance(row: ClassContextRow, message: string, answer: string): number {
  const corpus = normalizeText(
    `${row.subject} ${row.homework} ${row.content} ${row.emphasis} ${row.deadlineDate} ${row.createdDate}`
  );
  let score = 0;
  const tokens = Array.from(new Set([...tokenizeForScoring(message), ...tokenizeForScoring(answer)]));
  for (const token of tokens) {
    if (corpus.includes(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
  }
  if (rowMatchesMessage(row, message)) score += 5;
  return score;
}

function extractRowTitle(row: ClassContextRow): string {
  const text = row.rowType === "content" ? row.content : row.homework;
  const firstLine = String(text || "").split(/\n/)[0].trim();
  return shortText(firstLine, 80) || row.subject || "-";
}

function extractRowSnippet(row: ClassContextRow): string {
  const text = row.rowType === "content" ? row.content : row.homework;
  const combined = `${text} ${row.emphasis}`.trim();
  return shortText(combined, 200);
}

function pickArchiveUrl(row: ClassContextRow): string | undefined {
  const links = row.sourceLinks || [];
  const archive = links.find((link) => link.includes("/content") || link.includes("/#/view"));
  return archive || links[0];
}

function buildChatReferences(
  rows: ClassContextRow[],
  message: string,
  answer: string,
  limit = 12
): ChatReference[] {
  const scored = rows
    .map((row) => ({ row, score: scoreRowRelevance(row, message, answer) }))
    .sort((a, b) => b.score - a.score || String(b.row.date).localeCompare(String(a.row.date)));

  const matched = scored.filter((item) => item.score > 0).slice(0, limit);
  const selected = matched.length > 0 ? matched : scored.slice(0, Math.min(8, limit));

  return selected.map((item, index) => ({
    refId: index + 1,
    date: item.row.date || "-",
    subject: item.row.subject || "-",
    rowType: item.row.rowType,
    title: extractRowTitle(item.row),
    snippet: extractRowSnippet(item.row),
    sourceLinks: Array.from(new Set(item.row.sourceLinks || [])).slice(0, 8),
    archiveUrl: pickArchiveUrl(item.row),
  }));
}

function truncateForSheet(value: string, maxLen = 8000): string {
  const text = String(value || "");
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

async function logAiChat(
  env: Bindings,
  payload: {
    email: string;
    userName?: string;
    userMessage: string;
    aiAnswer?: string;
    model: string;
    attachmentName?: string;
    status: "success" | "fallback" | "error";
    contextSummary: ContextSummary;
    references: ChatReference[];
    sourceLinks: string[];
    errorMessage?: string;
  }
): Promise<void> {
  const id = `CHAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const row = [
    id,
    payload.email,
    payload.userName || "",
    truncateForSheet(payload.userMessage, 4000),
    truncateForSheet(payload.aiAnswer || "", 8000),
    payload.model,
    payload.attachmentName || "",
    payload.status,
    payload.contextSummary.totalRows,
    payload.contextSummary.totalSubjects,
    payload.contextSummary.totalDates,
    JSON.stringify(payload.references),
    JSON.stringify(payload.sourceLinks),
    truncateForSheet(payload.errorMessage || "", 1000),
    new Date().toISOString(),
  ];
  const endCol = String.fromCharCode(64 + AI_CHAT_LOGS_COLUMNS.length);
  await appendSheetRow(env, `${SHEETS.AI_CHAT_LOGS}!A:${endCol}`, row);
}

async function getAiChatLogs(env: Bindings) {
  try {
    const endCol = String.fromCharCode(64 + AI_CHAT_LOGS_COLUMNS.length);
    const rows = await getSheetValues(env, `${SHEETS.AI_CHAT_LOGS}!A2:${endCol}`);
    return toObjects(rows, AI_CHAT_LOGS_COLUMNS);
  } catch (e) {
    console.warn("AiChatLogs sheet may not exist yet", e);
    return [];
  }
}

async function askGeminiWithContext(
  env: Bindings,
  payload: {
    message: string;
    history: Array<{ role: string; text: string }>;
    attachment?: { mimeType?: string; dataBase64?: string; name?: string };
    systemInstruction: string;
    useGrounding: boolean;
    model: string;
  }
) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

  const model = resolveGeminiModel(payload.model, env);

  const historyContents = (payload.history || [])
    .filter((item) => item && item.text)
    .slice(-10)
    .map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: String(item.text) }],
    }));

  const userParts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
    { text: payload.message },
  ];
  if (payload.attachment?.dataBase64) {
    userParts.push({
      inline_data: {
        mime_type: payload.attachment.mimeType || "application/octet-stream",
        data: payload.attachment.dataBase64,
      },
    });
  }

  const reqBody = {
    system_instruction: {
      parts: [
        {
          text: payload.systemInstruction,
        },
      ],
    },
    contents: [
      ...historyContents,
      {
        role: "user",
        parts: userParts,
      },
    ],
    ...(payload.useGrounding ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      temperature: 0.2,
      topK: 24,
      topP: 0.8,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
    }
  );

  const data = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(data?.error?.message || "Gemini API request failed");
  }

  const answer = (data?.candidates?.[0]?.content?.parts || [])
    .map((part: any) => part?.text || "")
    .join("\n")
    .trim();

  if (!answer) throw new Error("Gemini returned empty answer");
  return stripCitationMarkers(answer);
}

// --- CORE DATA GETTERS ---

async function getHomeworkList(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.HOMEWORK}!A2:I`);
  return toObjects(rows, ["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"]);
}

async function getUserList(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.USERS}!A2:D`);
  return toObjects(rows, ["email", "name", "picture", "created_at"]);
}

async function getAllProgress(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.PROGRESS}!A2:E`);
  return toObjects(rows, ["email", "homework_id", "status", "image_url", "updated_at"]);
}

async function getProgressByEmail(env: Bindings, email: string) {
  const all = await getAllProgress(env);
  if (!email) return all;
  return all.filter((r: any) => String(r.email).toLowerCase() === email.toLowerCase());
}

async function getHomeworkWithProgress(env: Bindings, email: string) {
  const [homework, progress] = await Promise.all([
    getHomeworkList(env),
    getProgressByEmail(env, email)
  ]);
  const progressMap: any = {};
  progress.forEach((p: any) => { progressMap[p.homework_id] = p.status; });
  return homework.map((hw: any) => ({ ...hw, my_status: progressMap[hw.id] || "pending" }));
}

async function getLearningContent(
  env: Bindings,
  date?: string,
  id?: string,
  month?: string,
  subject?: string
) {
  const rows = await getSheetValues(env, `${SHEETS.LEARNING_CONTENT}!A2:K`);
  const data = toObjects(rows, ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "is_private", "created_at"]);

  if (id) return data.filter((item: any) => String(item.id) === String(id));
  if (month) {
    const match = String(month).match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return [];
    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    return data.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate.getFullYear() === year && itemDate.getMonth() === monthIndex;
    });
  }
  if (subject) {
    const subjectKey = String(subject).trim().toLowerCase();
    if (!subjectKey || subjectKey === 'all') return data;
    return data.filter((item: any) => String(item.subject || '').trim().toLowerCase() === subjectKey);
  }
  if (date) {
    const filterDate = new Date(date);
    return data.filter((item: any) => {
      const itemDate = new Date(item.date);
      return itemDate.getFullYear() === filterDate.getFullYear() &&
        itemDate.getMonth() === filterDate.getMonth() &&
        itemDate.getDate() === filterDate.getDate();
    });
  }
  return data;
}

async function getSubjects(env: Bindings) {
  const rows = await getSheetValues(env, `${SHEETS.SUBJECTS}!A2:D`);
  return toObjects(rows, ["id", "name", "color", "created_at"]);
}

async function getAudioPermissions(env: Bindings) {
  try {
    const rows = await getSheetValues(env, `${SHEETS.AUDIO_PERMISSIONS}!A2:A`);
    return rows
      .map((r: any) => String(r[0] || "").trim().toLowerCase())
      .filter(Boolean);
  } catch (e) {
    console.warn("AudioPermissions sheet may not exist yet", e);
    return [];
  }
}

async function getAnalyticsIpNotes(env: Bindings) {
  try {
    const endCol = String.fromCharCode(64 + ANALYTICS_IP_NOTES_COLUMNS.length);
    const rows = await getSheetValues(env, `${SHEETS.ANALYTICS_IP_NOTES}!A2:${endCol}`);
    return toObjects(rows, ANALYTICS_IP_NOTES_COLUMNS);
  } catch (e) {
    console.warn("AnalyticsIpNotes sheet may not exist yet", e);
    return [];
  }
}

async function saveAnalyticsIpNote(env: Bindings, data: any) {
  const adminEmail = data.admin_email || data.email;
  if (!isAdminEmail(adminEmail)) {
    throw new Error("Admin access required");
  }

  const ip = String(data.ip_address || "").trim();
  if (!ip) throw new Error("ip_address is required");

  const name = String(data.name || "").trim();
  const note = String(data.note || "").trim();
  const now = new Date().toISOString();
  const endCol = String.fromCharCode(64 + ANALYTICS_IP_NOTES_COLUMNS.length);
  const rowIndex = await findRowIndexById(env, SHEETS.ANALYTICS_IP_NOTES, ip);

  if (!name && !note) {
    if (rowIndex > 0) {
      await deleteRowById(env, SHEETS.ANALYTICS_IP_NOTES, ip);
    }
    return { deleted: true, ip_address: ip };
  }

  const row = [ip, name, note, now, adminEmail];
  if (rowIndex > 0) {
    const rowNum = rowIndex + 1;
    await updateSheetRow(env, `${SHEETS.ANALYTICS_IP_NOTES}!A${rowNum}:${endCol}${rowNum}`, row);
  } else {
    await appendSheetRow(env, `${SHEETS.ANALYTICS_IP_NOTES}!A:${endCol}`, row);
  }

  return { ip_address: ip, name, note, updated_at: now, updated_by: adminEmail };
}

async function getAnalytics(env: Bindings) {
  try {
    const endCol = String.fromCharCode(64 + ANALYTICS_COLUMNS.length);
    const rows = await getSheetValues(env, `${SHEETS.ANALYTICS}!A2:${endCol}`);
    const all = toObjects(rows, ANALYTICS_COLUMNS);
    return all.filter((row: any) => !isAdminEmail(row.email));
  } catch (e) {
    console.warn("Analytics sheet may not exist yet", e);
    return [];
  }
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getThreeMonthWindow(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function filterHomeworkFromToday(homework: any[]) {
  const today = startOfLocalDay(new Date());
  return homework.filter((hw) => {
    const deadline = startOfLocalDay(new Date(hw.deadline));
    return !Number.isNaN(deadline.getTime()) && deadline.getTime() >= today.getTime();
  });
}

function filterLearningContentThreeMonths(items: any[]) {
  const { start, end } = getThreeMonthWindow();
  return items.filter((item) => {
    const d = new Date(item.date);
    return !Number.isNaN(d.getTime()) && d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  });
}

function parsePageLimit(pageRaw?: string, limitRaw?: string) {
  const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
  const parsedLimit = parseInt(String(limitRaw || '20'), 10) || 20;
  const limit = parsedLimit === 50 ? 50 : 20;
  return { page, limit };
}

function paginateItems<T>(items: T[], page: number, limit: number) {
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page,
    limit,
  };
}

// --- TELEGRAM PROXY (Ported from google-apps-script-download.js) ---

async function uploadToTelegram(env: Bindings, blob: Blob, filename: string, contentType: string) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) throw new Error("Telegram config missing");

  let method = "sendDocument";
  let payloadField = "document";

  if (contentType.includes('image/')) {
    method = "sendPhoto";
    payloadField = "photo";
  } else if (contentType.includes('audio/')) {
    method = "sendAudio";
    payloadField = "audio";
  }

  const formData = new FormData();
  formData.append("chat_id", chatId);
  formData.append("caption", filename || "Uploaded via StudyFlow");
  formData.append(payloadField, blob, filename);

  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    body: formData
  });

  const result = await res.json() as any;
  if (!result.ok) throw new Error("Telegram API Error: " + result.description);

  let fileId = "";
  if (method === "sendPhoto") {
    fileId = result.result.photo[result.result.photo.length - 1].file_id;
  } else if (method === "sendAudio") {
    fileId = result.result.audio.file_id;
  } else {
    fileId = result.result.document.file_id;
  }

  const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
  const fileResult = await fileRes.json() as any;
  const filePath = fileResult.result.file_path;
  const tempUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

  return { fileId, url: tempUrl };
}

async function getFreshTelegramLink(env: Bindings, fileId: string, contentId?: string, contentType?: string) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");

  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`;
  const response = await fetch(getFileUrl);
  const result = await response.json() as any;
  
  if (!result.ok) throw new Error(result.description || "Telegram API Error");

  const filePath = result.result.file_path;
  const newLink = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
  
  if (contentId && contentType) {
    await updateSpreadsheetLink(env, contentId, contentType, fileId, newLink);
  }

  return { url: newLink, fileId: fileId };
}

async function updateSpreadsheetLink(env: Bindings, contentId: string, contentType: string, fileId: string, newUrl: string) {
  const sheetName = contentType === 'homework' ? SHEETS.HOMEWORK : SHEETS.LEARNING_CONTENT;
  const rows = await getSheetValues(env, `${sheetName}!A:I`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]) === String(contentId));
  if (rowIndex === -1) return;

  const rowNum = rowIndex + 1;
  const rowData = rows[rowIndex];
  const colsToCheck = contentType === 'homework' ? [5, 6] : [6, 7, 8];
  
  for (const colIdx of colsToCheck) {
    let currentVal = String(rowData[colIdx] || "");
    if (!currentVal) continue;
    let parts = currentVal.split(',');
    let updated = false;
    let newParts = parts.map(part => {
      if (part.includes(fileId)) {
        updated = true;
        let subParts = part.split('#');
        return `${newUrl}#${subParts[1] || "file"}#${fileId}`;
      }
      return part;
    });
    if (updated) {
      const colLetter = String.fromCharCode(65 + colIdx);
      await updateSheetRow(env, `${sheetName}!${colLetter}${rowNum}`, [newParts.join(',')]);
    }
  }
}

// --- DAILY SUMMARY (Ported from google-apps-script.js) ---

const DISCORD_CONTENT_MAX = 2000;

function sortHomeworkByDeadline(a: any, b: any) {
  const tA = a.deadline ? getMidnightGMT7(new Date(a.deadline)).getTime() : Infinity;
  const tB = b.deadline ? getMidnightGMT7(new Date(b.deadline)).getTime() : Infinity;
  if (tA !== tB) return tA - tB;
  const subA = (a.subject || "").toString().toLowerCase();
  const subB = (b.subject || "").toString().toLowerCase();
  if (subA !== subB) return subA.localeCompare(subB, "th");
  return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
}

function summaryLineWithLink(label: string, url: string, suffix = "") {
  return `- ${label} [(Link)](<${url}>)${suffix}\n`;
}

function summaryLinePlain(label: string, suffix = "") {
  return `- ${label}${suffix}\n`;
}

function splitDiscordContent(content: string, maxLen = DISCORD_CONTENT_MAX): string[] {
  const text = String(content || "");
  if (!text) return [""];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const slice = remaining.slice(0, maxLen);
    const cutAtNewline = slice.lastIndexOf('\n');
    const cutAtSpace = slice.lastIndexOf(' ');
    const cutIndex = cutAtNewline > 0 ? cutAtNewline + 1 : cutAtSpace > 0 ? cutAtSpace + 1 : maxLen;
    const part = remaining.slice(0, cutIndex);
    chunks.push(part);
    remaining = remaining.slice(cutIndex);
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

async function postDiscordContent(webhookUrl: string, content: string) {
  const chunks = splitDiscordContent(content, DISCORD_CONTENT_MAX);
  for (const part of chunks) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: part }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Discord summary webhook failed (${response.status}): ${errText || response.statusText}`);
    }
  }
}

function homeworkHasDetailContent(hw: any): boolean {
  return !!(
    (hw.description && String(hw.description).trim()) ||
    (hw.link_image && String(hw.link_image).trim()) ||
    (hw.link_work && String(hw.link_work).trim())
  );
}

function homeworkSummaryLine(hw: any, suffix = "") {
  const label = `${hw.subject} : ${hw.title}`;
  if (homeworkHasDetailContent(hw)) {
    return summaryLineWithLink(label, `${APP_BASE_URL}/#/view?id=${hw.id}`, suffix);
  }
  return summaryLinePlain(label, suffix);
}

async function generateDailySummary(env: Bindings, targetDate?: string) {
  const [homework, learningContent] = await Promise.all([
    getHomeworkList(env),
    getLearningContent(env)
  ]);
  
  const now = targetDate ? new Date(targetDate) : new Date();
  const gmt7Now = getMidnightGMT7(now);
  const tomorrow = new Date(gmt7Now.getTime() + 86400000);
  const oneWeekLater = new Date(gmt7Now.getTime() + 7 * 86400000);

  const todayLC = learningContent.filter(item => {
    if (isSheetTruthy(item.is_private)) return false;
    const itemDate = new Date(item.date);
    return getMidnightGMT7(itemDate).getTime() === gmt7Now.getTime();
  });

  const thaiDays = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
  const dStr = String(gmt7Now.getDate()).padStart(2, '0');
  const mStr = String(gmt7Now.getMonth() + 1).padStart(2, '0');
  const yearBE = (gmt7Now.getFullYear() + 543).toString().slice(-2);
  
  let message = `# ${dStr}/${mStr}/${yearBE}\n`;

  if (todayLC.length > 0) {
    message += "\n## 📚 เนื้อหาวันนี้\n";
    todayLC.forEach(item => {
      const label = `${item.subject} : ${item.title}`;
      message += summaryLineWithLink(label, `${APP_BASE_URL}/content#/view?id=${item.id}`);
    });
    message += "\n> (AI สรุปเนื้อหา แต่มีรูปเนื้อหาและไฟล์เสียงในห้องนะ)\n";
  }

  const todayHomework = homework.filter(hw => {
    if (!hw.created_at) return false;
    const created = new Date(hw.created_at);
    if (isNaN(created.getTime())) return false;
    return getMidnightGMT7(created).getTime() === gmt7Now.getTime();
  }).sort(sortHomeworkByDeadline);

  if (todayHomework.length > 0) {
    message += "\n## การบ้านวันนี้\n";
    todayHomework.forEach(hw => {
      message += homeworkSummaryLine(hw, hw.note ? ` ${hw.note}` : "");
    });
  }

  const upcoming = homework.filter(hw => {
    if (!hw.deadline) return false;
    const d = new Date(hw.deadline);
    const m = getMidnightGMT7(d);
    return m >= tomorrow && m <= oneWeekLater;
  }).sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime());

  const grouped: Record<string, any[]> = {};
  upcoming.forEach(hw => {
    const d = new Date(hw.deadline!);
    const key = `## ${thaiDays[d.getDay()]} (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(hw);
  });

  const longTerm = homework.filter(hw => {
    if (!hw.deadline) return true;
    return getMidnightGMT7(new Date(hw.deadline)).getTime() > oneWeekLater.getTime();
  }).sort(sortHomeworkByDeadline);

  const hasAllHomework = Object.keys(grouped).length > 0 || longTerm.length > 0;
  if (hasAllHomework) {
    message += "\n## การบ้านทั้งหมด\n";

    for (const key in grouped) {
      message += `${key}\n`;
      grouped[key].forEach(hw => {
        message += homeworkSummaryLine(hw, hw.note ? ` ${hw.note}` : "");
      });
    }

    if (longTerm.length > 0) {
      message += "## งานดองเค็ม\n";
      longTerm.forEach(hw => {
        let dateSuffix = "";
        if (hw.deadline) {
          const d = new Date(hw.deadline);
          dateSuffix = ` (${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')})`;
        }
        message += homeworkSummaryLine(hw, dateSuffix);
      });
    }
  }

  message += `\nเนื้อหาทั้งหมดอยู่ใน link นี้\n<${APP_BASE_URL}/>\n\n> Have question **Reply** to this Bot. || <@&1162383289575817326> ||`;
  return message;
}

// --- POST ACTIONS ---

async function addHomework(env: Bindings, data: any) {
  const id = Date.now().toString();
  const row = [id, data.subject || "", data.title || "", data.description || "", data.deadline || "", data.link_work || "", data.link_image || "", data.note || "", new Date().toISOString()];
  await appendSheetRow(env, `${SHEETS.HOMEWORK}!A:I`, row);
  return id;
}

async function editHomework(env: Bindings, data: any) {
  const rowIndex = await findRowIndexById(env, SHEETS.HOMEWORK, data.id);
  if (rowIndex === -1) throw new Error("Homework not found");
  const rowNum = rowIndex + 1;
  const row = [data.id, data.subject, data.title, data.description, data.deadline, data.link_work, data.link_image, data.note];
  await updateSheetRow(env, `${SHEETS.HOMEWORK}!A${rowNum}:H${rowNum}`, row);
  return "ok";
}

async function addLearningContent(env: Bindings, data: any) {
  const id = "LC-" + Date.now().toString();
  const row = [id, data.date || new Date().toISOString().split('T')[0], data.subject || "", data.title || "", data.description || "", data.audio_file_id || "", data.audio_url || "", data.attachments || "", data.links || "", isSheetTruthy(data.is_private) ? '1' : '', new Date().toISOString()];
  await appendSheetRow(env, `${SHEETS.LEARNING_CONTENT}!A:K`, row);
  return id;
}

async function editLearningContent(env: Bindings, data: any) {
  const rowIndex = await findRowIndexById(env, SHEETS.LEARNING_CONTENT, data.id);
  if (rowIndex === -1) throw new Error("Content not found");
  const rowNum = rowIndex + 1;
  const row = [data.id, data.date, data.subject, data.title, data.description, data.audio_file_id, data.audio_url, data.attachments, data.links, isSheetTruthy(data.is_private) ? '1' : ''];
  await updateSheetRow(env, `${SHEETS.LEARNING_CONTENT}!A${rowNum}:J${rowNum}`, row);
  return "ok";
}

async function addUser(env: Bindings, email: string, displayName: string, photoUrl: string) {
  if (!email) return;
  const rows = await getSheetValues(env, `${SHEETS.USERS}!A:A`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]).toLowerCase() === email.toLowerCase());
  if (rowIndex !== -1) {
    const sheetRow = rowIndex + 1;
    await updateSheetRow(env, `${SHEETS.USERS}!B${sheetRow}:C${sheetRow}`, [displayName || "", photoUrl || ""]);
  } else {
    await appendSheetRow(env, `${SHEETS.USERS}!A:D`, [email, displayName || "", photoUrl || "", new Date().toISOString()]);
  }
}

async function updateProgress(env: Bindings, email: string, homeworkId: string, status: string, imageUrl: string, append: boolean = false) {
  if (!email) throw new Error("Email is required");
  const rows = await getSheetValues(env, `${SHEETS.PROGRESS}!A:B`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]).toLowerCase() === email.toLowerCase() && String(r[1]) === String(homeworkId));

  if (rowIndex === -1) {
    await appendSheetRow(env, `${SHEETS.PROGRESS}!A:E`, [email, homeworkId, status || "pending", imageUrl || "", new Date().toISOString()]);
  } else {
    const sheetRow = rowIndex + 1;
    if (status) await updateSheetRow(env, `${SHEETS.PROGRESS}!C${sheetRow}`, [status]);
    if (imageUrl !== undefined) {
      let finalUrl = imageUrl;
      if (append) {
        const currentVals = await getSheetValues(env, `${SHEETS.PROGRESS}!D${sheetRow}:D${sheetRow}`);
        const currentVal = currentVals[0]?.[0] || "";
        const currentUrls = currentVal ? currentVal.split(',') : [];
        if (imageUrl && !currentUrls.includes(imageUrl)) currentUrls.push(imageUrl);
        finalUrl = currentUrls.join(',');
      }
      await updateSheetRow(env, `${SHEETS.PROGRESS}!D${sheetRow}`, [finalUrl]);
    }
    await updateSheetRow(env, `${SHEETS.PROGRESS}!E${sheetRow}`, [new Date().toISOString()]);
  }

  if (imageUrl && imageUrl.trim().length > 0) {
    const [users, hws] = await Promise.all([getUserList(env), getHomeworkList(env)]);
    const user = users.find((u: any) => u.email === email) || { name: email };
    const hw = hws.find((h: any) => String(h.id) === String(homeworkId)) || { title: "Homework" };
    await sendSubmissionNotification(env, user.name, hw.title, status, imageUrl);
  }
}

async function deleteRowById(env: Bindings, sheetName: string, id: string) {
  const rows = await getSheetValues(env, `${sheetName}!A:A`);
  const rowIndex = rows.findIndex((r: any) => String(r[0]) === String(id));
  if (rowIndex === -1) return false;
  const token = await getAuthToken(env);
  const ssRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`, { headers: { Authorization: `Bearer ${token}` } });
  const spreadsheet = await ssRes.json() as any;
  const sheet = spreadsheet.sheets.find((s: any) => s.properties.title === sheetName);
  if (!sheet) return false;
  const sheetId = sheet.properties.sheetId;
  await batchUpdateSheet(env, [{ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: rowIndex, endIndex: rowIndex + 1 } } }]);
  return true;
}

async function addComment(env: Bindings, homeworkId: string, ownerEmail: string, commenterEmail: string, text: string) {
  if (!homeworkId || !ownerEmail || !commenterEmail || !text) throw new Error("Missing parameters for comment");
  await appendSheetRow(env, `${SHEETS.COMMENTS}!A:E`, [homeworkId, ownerEmail, commenterEmail, text, new Date().toISOString()]);
  const [users, hws] = await Promise.all([getUserList(env), getHomeworkList(env)]);
  const commenter = users.find((u: any) => u.email === commenterEmail) || { name: commenterEmail };
  const owner = users.find((u: any) => u.email === ownerEmail) || { name: ownerEmail };
  const hw = hws.find((h: any) => String(h.id) === String(homeworkId)) || { title: "Homework" };
  const payload = { embeds: [{ title: "💬 New Comment in Activity Feed", color: 7506394, fields: [{ name: "From", value: commenter.name, inline: true }, { name: "To", value: owner.name + "'s work", inline: true }, { name: "Homework", value: hw.title, inline: false }, { name: "Comment", value: text }], footer: { text: "StudyFlow Activity Feed" }, timestamp: new Date().toISOString() }] };
  await sendSubmissionNotification(env, { ...payload, url: env.DISCORD_WEBHOOK_URL } as any, env.DISCORD_WEBHOOK_URL); // Modified to work with generic helper
  return true;
}

async function addSubject(env: Bindings, name: string, color: string) {
  if (!name) throw new Error("Name is required");
  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  await appendSheetRow(env, `${SHEETS.SUBJECTS}!A:D`, [id, name, color || "#6366f1", new Date().toISOString()]);
  return id;
}

async function getComments(env: Bindings, homeworkId?: string, ownerEmail?: string) {
  const rows = await getSheetValues(env, `${SHEETS.COMMENTS}!A2:E`);
  const comments = toObjects(rows, ["homework_id", "owner_email", "commenter_email", "text", "created_at"]);
  let filtered = comments;
  if (homeworkId) filtered = filtered.filter((r: any) => String(r.homework_id) === String(homeworkId));
  if (ownerEmail) filtered = filtered.filter((r: any) => String(r.owner_email).toLowerCase() === ownerEmail.toLowerCase());
  const users = await getUserList(env);
  return filtered.map((r: any) => {
    const u = users.find((user: any) => String(user.email).toLowerCase() === String(r.commenter_email).toLowerCase());
    return { ...r, commenter_name: u ? u.name : r.commenter_email, commenter_picture: u ? u.picture : "" };
  });
}

async function fixSheetHeaders(env: Bindings) {
  const results = [];
  for (const [sheetName, headers] of Object.entries(EXPECTED_HEADERS)) {
    const endCol = String.fromCharCode(64 + headers.length);
    const range = `${sheetName}!A1:${endCol}1`;
    try {
      await updateSheetRow(env, range, headers);
      results.push(`${sheetName}: Headers fixed`);
    } catch (e: any) {
      if (e.message.includes('Bad Request')) {
        try {
          await batchUpdateSheet(env, [
            { addSheet: { properties: { title: sheetName } } }
          ]);
          await updateSheetRow(env, range, headers);
          results.push(`${sheetName}: Sheet created and headers fixed`);
        } catch (err: any) {
          results.push(`${sheetName}: Failed to create - ${err.message}`);
        }
      } else {
        results.push(`${sheetName}: Failed - ${e.message}`);
      }
    }
  }
  return results;
}

async function logAnalytics(env: Bindings, data: any, req: any) {
  if (isAdminEmail(data.email)) {
    return { skipped: true, reason: "admin" };
  }

  if (data.event_type === "heartbeat") {
    return { skipped: true, reason: "heartbeat_disabled" };
  }

  const id = Date.now().toString() + Math.floor(Math.random() * 1000);
  const ipAddress = req.header('cf-connecting-ip') || req.header('x-forwarded-for') || "unknown";
  
  const row = [
    id, 
    data.event_type || "visit", 
    data.device_name || "unknown", 
    data.browser || "unknown", 
    ipAddress, 
    data.email || "", 
    new Date().toISOString(),
    data.page_visited || "",
    data.content_id || "",
    data.fingerprint || "",
    data.session_id || "",
    typeof data.metadata === 'string' ? data.metadata : (data.metadata ? JSON.stringify(data.metadata) : ""),
    data.visitor_id || "",
  ];
  const endCol = String.fromCharCode(64 + ANALYTICS_COLUMNS.length);
  await appendSheetRow(env, `${SHEETS.ANALYTICS}!A:${endCol}`, row);
  return id;
}

// --- NOTIFICATIONS ---

async function sendSubmissionNotification(env: Bindings, studentName: string | any, homeworkTitle?: string, status?: string, content?: string) {
  const url = String(env.DISCORD_WEBHOOK_URL || "").trim();
  if (!url) return;
  
  let payload: any;
  if (typeof studentName === 'object') {
    payload = studentName;
  } else {
    const isFile = content?.includes("http");
    const label = isFile ? "📎 New Attachment" : "📣 New Progress Update";
    const color = isFile ? 3447003 : 15105570;
    let displayContent = content || "";
    if (isFile) {
      displayContent = displayContent.split(',').map(p => {
        const [u, h] = p.trim().split('#');
        return h ? `[${decodeURIComponent(h)}](${u})` : `[View File](${u})`;
      }).join('\n');
    }
    payload = { embeds: [{ title: label, color: color, fields: [{ name: "Student", value: studentName, inline: true }, { name: "Homework", value: homeworkTitle, inline: true }, { name: "Content", value: displayContent.substring(0, 1000) }], footer: { text: "StudyFlow Activity Feed" }, timestamp: new Date().toISOString() }] };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Discord webhook failed (${response.status}): ${errText || response.statusText}`);
  }
}

// --- ROUTES ---

app.get('/health', (c) => c.text('ok'));

app.post('/api/chat', async (c) => {
  try {
    const authUser = await requireAuth(c);
    const body = await c.req.json<{ messages?: import('ai').UIMessage[] }>();
    return handleAiChatRequest(c.env, authUser, body);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Request failed';
    const status = message === 'Authentication required' ? 401 : 500;
    return c.json({ error: message }, status);
  }
});

app.post('/api/gemini-chat', async (c) => {
  const authUser = await requireAuth(c);
  const body = await c.req.json();
  const message = String(body?.message || "").trim();
  const history = Array.isArray(body?.history) ? body.history : [];
  const userEmail = authUser.email;
  const userName = String(body?.user?.name || "");
  const attachment = body?.attachment;
  const modelUsed = resolveGeminiModel(body?.model, c.env);
  const attachmentName = String(attachment?.name || "");

  let contextRows: ClassContextRow[] = [];
  let contextSummary: ContextSummary = {
    totalRows: 0,
    totalSubjects: 0,
    totalDates: 0,
    modelUsed,
  };

  const writeLog = (
    status: "success" | "fallback" | "error",
    extra: {
      aiAnswer?: string;
      references?: ChatReference[];
      sourceLinks?: string[];
      errorMessage?: string;
    } = {}
  ) => {
    const references = extra.references || buildChatReferences(contextRows, message, extra.aiAnswer || "");
    const sourceLinks =
      extra.sourceLinks ||
      Array.from(new Set(references.flatMap((ref) => ref.sourceLinks || []))).slice(0, 30);
    logAiChat(c.env, {
      email: userEmail,
      userName,
      userMessage: message || (attachmentName ? `[attachment] ${attachmentName}` : ""),
      aiAnswer: extra.aiAnswer,
      model: modelUsed,
      attachmentName,
      status,
      contextSummary,
      references,
      sourceLinks,
      errorMessage: extra.errorMessage,
    }).catch((err) => console.warn("logAiChat failed", err));
  };

  try {
    if (!message && !attachment?.dataBase64) {
      return c.json({ success: false, error: "Message or attachment is required" }, 400);
    }
    if (!userEmail) {
      return c.json({ success: false, error: "User email is required" }, 401);
    }

    const [homeworkList, learningContentList] = await Promise.all([
      getHomeworkList(c.env),
      getLearningContent(c.env),
    ]);
    contextRows = buildClassContextRows(homeworkList, learningContentList);
    const availableSubjects = Array.from(new Set(contextRows.map((row) => row.subject).filter(Boolean)));
    const queryIntent = parseUserQueryIntent(message || "วิเคราะห์ไฟล์ที่แนบ", availableSubjects);
    const promptRows = filterRowsByIntent(contextRows, message || "วิเคราะห์ไฟล์ที่แนบ", queryIntent);
    const fullSheetDataChunk = buildFullSheetDataChunk(promptRows);
    const systemInstruction = buildRagSystemInstruction(fullSheetDataChunk);
    const useGrounding = shouldUseGrounding(message || "วิเคราะห์ไฟล์ที่แนบ");
    contextSummary = buildContextSummary(promptRows, modelUsed, fullSheetDataChunk.length);
    const contextRowsForResponse = promptRows.slice(0, 8).map((row) => ({
      ...row,
      homework: shortText(row.homework, 160),
      content: shortText(row.content, 180),
      emphasis: shortText(row.emphasis, 140),
      sourceLinks: (row.sourceLinks || []).slice(0, 8),
    }));

    let answer = "";
    let status: "success" | "fallback" = "success";
    try {
      answer = await askGeminiWithContext(c.env, {
        message: message || "ช่วยวิเคราะห์ไฟล์ที่แนบ",
        history,
        attachment,
        systemInstruction,
        useGrounding,
        model: modelUsed,
      });
    } catch (err) {
      if (isGeminiLocationRestrictionError(err)) {
        answer = buildFallbackAnswerFromRows(promptRows, message || "สรุปข้อมูล");
        status = "fallback";
      } else {
        writeLog("error", { errorMessage: (err as Error)?.message || "gemini chat failed" });
        throw err;
      }
    }

    const references = buildChatReferences(promptRows, message, answer);
    const sourceLinks = Array.from(
      new Set(references.flatMap((ref) => ref.sourceLinks || []))
    ).slice(0, 30);

    writeLog(status, { aiAnswer: answer, references, sourceLinks });

    return c.json({
      success: true,
      data: {
        answer,
        references,
        sourceLinks,
        contextRows: contextRowsForResponse,
        contextSummary,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "gemini chat failed" }, 500);
  }
});

app.get('/content/:id', async (c) => {
  const rawId = c.req.param('id') || '';
  let id: string;
  let format: 'json' | 'txt';

  if (rawId.endsWith('.json')) {
    id = rawId.slice(0, -5);
    format = 'json';
  } else if (rawId.endsWith('.txt')) {
    id = rawId.slice(0, -4);
    format = 'txt';
  } else {
    return c.json({ error: 'Not found' }, 404);
  }

  if (!id || !/^LC-\d+$/.test(id)) {
    return c.json({ error: 'Invalid content ID. Expected format: LC-{timestamp}' }, 400);
  }

  try {
    const items = await getLearningContent(c.env, undefined, id);
    if (!items.length) {
      return c.json({ error: 'Content not found', id }, 404);
    }

    const email = await optionalAuth(c);
    if (isSheetTruthy(items[0].is_private) && !isAdminEmail(email)) {
      return c.json({ error: 'Content not found', id }, 404);
    }

    const origin = new URL(c.req.url).origin;
    const body = buildContentExport(items[0], origin);

    if (format === 'txt') {
      return new Response(formatContentAsText(body), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to export content' }, 500);
  }
});

app.get('/', async (c) => {
  const action = c.req.query('action');
  try {
    if (!action) return c.json({ success: true, message: "StudyFlow Cloudflare Worker is online 🚀" });
    let result: any;
    switch (action) {
      // --- Public ---
      case "list": result = await getHomeworkList(c.env); break;
      case "subjects": result = await getSubjects(c.env); break;

      // --- Requires valid login ---
      case "listWithProgress": {
        const email = await requireAuth(c).then(u => u.email);
        result = await getHomeworkWithProgress(c.env, email);
        break;
      }
      case "progress": {
        const email = await requireAuth(c).then(u => u.email);
        result = await getProgressByEmail(c.env, email);
        break;
      }
      case "comments": {
        await requireAuth(c);
        result = await getComments(c.env, c.req.query('homework_id'), c.req.query('owner_email'));
        break;
      }
      case "learningContent": {
        const email = await optionalAuth(c);
        const raw = filterPrivateLearningContent(
          await getLearningContent(
            c.env,
            c.req.query('date'),
            c.req.query('id'),
            c.req.query('month'),
            c.req.query('subject')
          ),
          email
        );
        const level = await resolveAudioAccess(c.env, email);
        result = sanitizeLearningContentList(raw, level);
        break;
      }
      case "getFreshLink": {
        const user = await requireAuth(c);
        const fileId = c.req.query('fileId');
        if (!fileId) throw new Error("fileId is required");
        await assertAudioAccess(c.env, user.email);
        result = await getFreshTelegramLink(c.env, fileId, c.req.query('contentId'), c.req.query('contentType'));
        break;
      }
      case "batchData": {
        const email = await optionalAuth(c);
        const admin = isAdminEmail(email);
        const [
          audioPermissions,
          learningContentRaw,
          homeworkRaw,
          users,
          progress,
          subjects,
          aiChatLogs,
        ] = await Promise.all([
          getAudioPermissions(c.env),
          getLearningContent(c.env),
          getHomeworkList(c.env),
          getUserList(c.env),
          getAllProgress(c.env),
          getSubjects(c.env),
          admin ? getAiChatLogs(c.env) : Promise.resolve([]),
        ]);
        const audioLevel = resolveAudioAccessLevel(email, audioPermissions, isAdminEmail);
        const learningContent = sanitizeLearningContentList(
          filterLearningContentThreeMonths(
            filterPrivateLearningContent(learningContentRaw, email)
          ),
          audioLevel
        );
        result = {
          homework: filterHomeworkFromToday(homeworkRaw),
          users,
          progress,
          learningContent,
          subjects,
          analytics: [],
          analyticsIpNotes: [],
          audioAccessGranted: audioLevel !== 'none',
          ...(admin ? {
            audioPermissions,
            aiChatLogs,
          } : {}),
        };
        break;
      }

      // --- Requires admin ---
      case "allProgress": await requireAdmin(c); result = await getAllProgress(c.env); break;
      case "users": await requireAdmin(c); result = await getUserList(c.env); break;
      case "adminHomeworkList": {
        await requireAdmin(c);
        const { page, limit } = parsePageLimit(c.req.query('page'), c.req.query('limit'));
        const q = String(c.req.query('q') || '').toLowerCase().trim();
        let tasks = await getHomeworkList(c.env);
        tasks.sort((a: any, b: any) => {
          const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
          const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
          if (dateB !== dateA) return dateB - dateA;
          return String(b.id).localeCompare(String(a.id));
        });
        if (q) {
          tasks = tasks.filter((hw: any) =>
            String(hw.title || '').toLowerCase().includes(q) ||
            String(hw.subject || '').toLowerCase().includes(q) ||
            String(hw.description || '').toLowerCase().includes(q) ||
            String(hw.id || '').toLowerCase().includes(q)
          );
        }
        result = paginateItems(tasks, page, limit);
        break;
      }
      case "adminContentList": {
        await requireAdmin(c);
        const { page, limit } = parsePageLimit(c.req.query('page'), c.req.query('limit'));
        const q = String(c.req.query('q') || '').toLowerCase().trim();
        const subject = String(c.req.query('subject') || '').trim();
        let items = await getLearningContent(c.env);
        items.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (subject && subject.toLowerCase() !== 'all') {
          items = items.filter((item: any) =>
            String(item.subject || '').trim().toLowerCase() === subject.toLowerCase()
          );
        }
        if (q) {
          items = items.filter((item: any) =>
            String(item.title || '').toLowerCase().includes(q) ||
            String(item.description || '').toLowerCase().includes(q) ||
            String(item.id || '').toLowerCase().includes(q) ||
            String(item.subject || '').toLowerCase().includes(q)
          );
        }
        result = paginateItems(items, page, limit);
        break;
      }
      case "adminDashboard": {
        await requireAdmin(c);
        const [homework, users, progress, learningContent] = await Promise.all([
          getHomeworkList(c.env),
          getUserList(c.env),
          getAllProgress(c.env),
          getLearningContent(c.env),
        ]);
        const today = startOfLocalDay(new Date());
        const next7Days = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcomingDeadlines = homework.filter((hw: any) => {
          const deadline = startOfLocalDay(new Date(hw.deadline));
          return !Number.isNaN(deadline.getTime()) && deadline >= today && deadline <= next7Days;
        }).length;
        result = {
          totalUsers: users.length,
          activeTasks: homework.length,
          totalContent: learningContent.length,
          upcomingDeadlines,
          recentActivity: progress.slice(-5).reverse(),
        };
        break;
      }
      case "adminAnalytics": {
        await requireAdmin(c);
        const [analytics, analyticsIpNotes] = await Promise.all([
          getAnalytics(c.env),
          getAnalyticsIpNotes(c.env),
        ]);
        result = { analytics, analyticsIpNotes };
        break;
      }
      case "dailySummary": {
        await requireAdmin(c);
        const summary = await generateDailySummary(c.env, c.req.query('date'));
        if (c.req.query('send') === 'true') {
          const summaryWebhookUrl = String(c.env.SUMMARY_WEBHOOK_URL || "").trim();
          if (!summaryWebhookUrl) throw new Error("SUMMARY_WEBHOOK_URL is missing");
          await postDiscordContent(summaryWebhookUrl, summary);
        }
        result = { summary };
        break;
      }

      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.message === 'Authentication required' ? 401
      : err.message === 'Admin access required' ? 403
      : 500;
    return c.json({ success: false, error: err.message }, status);
  }
});

app.post('/', async (c) => {
  try {
    let body: any = {};
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) body = await c.req.json();
    else body = await c.req.parseBody();

    const action = body.action || c.req.query('action');
    const getVal = (key: string) => body[key] ?? c.req.query(key) ?? '';
    if (!action) return c.json({ success: false, error: "Missing action" }, 400);

    let result: any;
    switch (action) {
      // --- Public (fire-and-forget analytics) ---
      case "logAnalytics": result = await logAnalytics(c.env, body, c.req); break;

      // --- Requires valid login ---
      case "addUser": {
        const user = await requireAuth(c);
        await addUser(c.env, user.email, getVal('display_name'), getVal('photo_url'));
        result = "ok";
        break;
      }
      case "updateProgress": {
        const user = await requireAuth(c);
        await updateProgress(c.env, user.email, getVal('homework_id'), getVal('status'), getVal('image_url'), getVal('append') === 'true');
        result = "ok";
        break;
      }
      case "addComment": {
        const user = await requireAuth(c);
        result = await addComment(c.env, getVal('homework_id'), getVal('owner_email'), user.email, getVal('text'));
        break;
      }
      case "registerUpload": {
        await requireAuth(c);
        const uploadRow = [Date.now().toString(), getVal('filename'), getVal('contentType'), getVal('url'), new Date().toISOString(), "", getVal('fileId')];
        await appendSheetRow(c.env, `${SHEETS.URLS}!A:G`, uploadRow);
        result = "ok";
        break;
      }
      case "upload":
      case "uploadProof":
      case "uploadAudio": {
        const uploadUser = await requireAuth(c);
        const file = body.myFile || body.content || body.contents;
        let blob: Blob;
        let filename = getVal('filename') || "uploaded_file";
        let mimeType = getVal('contentType') || "application/octet-stream";
        if (file instanceof File) {
          blob = file;
          filename = file.name;
          mimeType = file.type;
        } else if (typeof file === 'string') {
          const base64 = file.includes('base64,') ? file.split('base64,')[1] : file;
          const bin = atob(base64);
          const uint8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) uint8[i] = bin.charCodeAt(i);
          blob = new Blob([uint8], { type: mimeType });
        } else {
          throw new Error("No file content provided");
        }
        const uploadRes = await uploadToTelegram(c.env, blob, filename, mimeType);
        const finalUrl = `${uploadRes.url}#${encodeURIComponent(filename)}#${uploadRes.fileId}`;
        if (action === 'uploadProof') {
          await updateProgress(c.env, uploadUser.email, getVal('homework_id'), getVal('status'), finalUrl, true);
        }
        result = { ...uploadRes, url: finalUrl };
        break;
      }

      // --- Requires admin ---
      case "saveAnalyticsIpNote": {
        const admin = await requireAdmin(c);
        result = await saveAnalyticsIpNote(c.env, { ...body, admin_email: admin.email });
        break;
      }
      case "addHomework": await requireAdmin(c); result = await addHomework(c.env, body); break;
      case "editHomework": await requireAdmin(c); result = await editHomework(c.env, body); break;
      case "deleteHomework": await requireAdmin(c); result = await deleteRowById(c.env, SHEETS.HOMEWORK, getVal('id')); break;
      case "addLearningContent": await requireAdmin(c); result = await addLearningContent(c.env, body); break;
      case "editLearningContent": await requireAdmin(c); result = await editLearningContent(c.env, body); break;
      case "deleteLearningContent": await requireAdmin(c); result = await deleteRowById(c.env, SHEETS.LEARNING_CONTENT, getVal('id')); break;
      case "addSubject": await requireAdmin(c); result = await addSubject(c.env, getVal('name'), getVal('color')); break;
      case "deleteSubject": await requireAdmin(c); result = await deleteRowById(c.env, SHEETS.SUBJECTS, getVal('id')); break;
      case "sendSummary": {
        await requireAdmin(c);
        const summaryText = await generateDailySummary(c.env, getVal('date'));
        const summaryWebhookUrl = String(c.env.SUMMARY_WEBHOOK_URL || "").trim();
        if (!summaryWebhookUrl) throw new Error("SUMMARY_WEBHOOK_URL is missing");
        await postDiscordContent(summaryWebhookUrl, summaryText);
        result = "Summary sent to Discord successfully! 📢";
        break;
      }
      case "fixSheetHeaders": await requireAdmin(c); result = await fixSheetHeaders(c.env); break;

      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.message === 'Authentication required' ? 401
      : err.message === 'Admin access required' ? 403
      : 500;
    return c.json({ success: false, error: err.message }, status);
  }
});

export default app;
