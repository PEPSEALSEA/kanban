import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { JWT } from 'google-auth-library';
import { buildContentExport } from './contentExport';

type Bindings = {
  SPREADSHEET_ID: string;
  DISCORD_WEBHOOK_URL: string;
  SUMMARY_WEBHOOK_URL: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GEMINI_API_KEY?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
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
};

const EXPECTED_HEADERS = {
  [SHEETS.HOMEWORK]: ["id", "subject", "title", "description", "deadline", "link_work", "link_image", "note", "created_at"],
  [SHEETS.USERS]: ["email", "name", "picture", "created_at"],
  [SHEETS.PROGRESS]: ["email", "homework_id", "status", "image_url", "updated_at"],
  [SHEETS.LEARNING_CONTENT]: ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "created_at"],
  [SHEETS.SUBJECTS]: ["id", "name", "color", "created_at"],
  [SHEETS.COMMENTS]: ["homework_id", "owner_email", "commenter_email", "text", "created_at"],
  [SHEETS.URLS]: ["id", "filename", "contentType", "url", "created_at", "uploader", "fileId"],
  [SHEETS.ANALYTICS]: ["id", "event_type", "device_name", "browser", "ip_address", "email", "created_at", "page_visited", "content_id", "fingerprint", "session_id", "metadata"],
  [SHEETS.ANALYTICS_IP_NOTES]: ["ip_address", "name", "note", "updated_at", "updated_by"],
  [SHEETS.AUDIO_PERMISSIONS]: ["email", "note", "created_at"]
};

const ANALYTICS_COLUMNS = EXPECTED_HEADERS[SHEETS.ANALYTICS];
const ANALYTICS_IP_NOTES_COLUMNS = EXPECTED_HEADERS[SHEETS.ANALYTICS_IP_NOTES];
const APP_BASE_URL = "https://pepsealsea.github.io/kanban";


// --- AUTH & API HELPERS ---

async function getAuthToken(env: Bindings) {
  const client = new JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const credentials = await client.authorize();
  return credentials.access_token;
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
    explicitWebSearch: shouldUseGrounding(message),
  };
}

function buildClassContextRows(homeworkList: any[], learningContentList: any[]): ClassContextRow[] {
  const rows: ClassContextRow[] = [];

  for (const item of learningContentList) {
    const itemDate = parseDateValue(String(item.date || ""));
    const description = String(item.description || "");
    const sourceLinks = Array.from(
      new Set([
        `${APP_BASE_URL}/content#/view?id=${encodeURIComponent(String(item.id || ""))}`,
        ...parseUrlList(item.links),
        ...parseUrlList(item.attachments),
        ...parseUrlList(item.audio_url),
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

  const keywordFiltered = result.filter((row) => rowMatchesMessage(row, message));
  if (keywordFiltered.length > 0) {
    result = keywordFiltered;
  }

  if (intent.wantsEmphasis) {
    const withEmphasis = result.filter((row) => row.emphasis);
    if (withEmphasis.length > 0) result = withEmphasis;
  }

  return result.slice(0, 30);
}

function buildFilteredSheetDataChunk(rows: ClassContextRow[]): string {
  const grouped = new Map<
    string,
    {
      date: string;
      subject: string;
      homeworkItems: string[];
      deadlineItems: string[];
      contentItems: string[];
      emphasisItems: string[];
      sourceLinks: string[];
    }
  >();

  for (const row of rows) {
    const key = `${row.date}__${row.subject}`;
    const curr = grouped.get(key) || {
      date: row.date || "-",
      subject: row.subject || "-",
      homeworkItems: [],
      deadlineItems: [],
      contentItems: [],
      emphasisItems: [],
      sourceLinks: [],
    };

    if (row.homework) curr.homeworkItems.push(row.homework);
    if (row.deadlineDate) curr.deadlineItems.push(row.deadlineDate);
    if (row.content) curr.contentItems.push(row.content);
    if (row.emphasis) curr.emphasisItems.push(row.emphasis);
    curr.sourceLinks.push(...(row.sourceLinks || []));
    grouped.set(key, curr);
  }

  const compactRows = Array.from(grouped.values())
    .map((row) => ({
      date: row.date,
      subject: row.subject,
      homework: shortText(Array.from(new Set(row.homeworkItems)).join(" | "), 2200),
      deadlines: shortText(Array.from(new Set(row.deadlineItems)).join(" | "), 160),
      content: shortText(Array.from(new Set(row.contentItems)).join(" | "), 2800),
      emphasis: shortText(Array.from(new Set(row.emphasisItems)).join(" | "), 600),
      sourceLinks: Array.from(new Set(row.sourceLinks)).slice(0, 12),
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return JSON.stringify(compactRows, null, 2);
}

function buildSystemInstruction(filteredSheetDataChunk: string): string {
  const chunk = filteredSheetDataChunk && filteredSheetDataChunk.trim() ? filteredSheetDataChunk : "[]";
  return `คุณคือ "ผู้เชี่ยวชาญการวิเคราะห์ข้อมูลและสรุปเนื้อหาห้องเรียน" หน้าที่ของคุณคือตอบคำถามผู้ใช้โดยอิงจากข้อมูลใน Google Sheet ที่แนบมาให้เท่านั้น

[ข้อมูลที่คุณต้องใช้ประมวลผล (Google Sheet Data Chunk)]
${chunk}

[กฎเหล็กและกระบวนการคิด]
1. การจำกัดขอบเขตข้อมูล: ห้ามใช้จินตนาการหรือคิดคำตอบขึ้นมาเองเด็ดขาด หากคำถามของผู้ใช้ไม่มีคำตอบระบุอยู่ในข้อมูล Sheet ที่แนบมา ให้ตอบว่า "ขออภัยครับ ไม่พบข้อมูลในระบบตามช่วงเวลา/วิชาที่ระบุ"
2. วิธีการอ่านและกรองข้อมูล:
   - เมื่อผู้ใช้ระบุชื่อวิชา ให้ใช้เฉพาะแถวที่มีวิชานั้น
   - เมื่อผู้ใช้ระบุวันที่หรือช่วงเวลา ให้เรียงจากเก่าไปใหม่และใช้เฉพาะช่วงที่ถาม
3. รูปแบบการตอบกลับ:
   - 📅 วันที่: [ว/ด/ป]
   - 📘 วิชา: [ชื่อวิชา]
   - 📝 สรุปเนื้อหาสำคัญ: [สรุปจากข้อมูล content แบบครบประเด็นหลัก]
   - จุดที่คุณครูเน้นย้ำ: [ดึงจากข้อมูลจุดเน้น]
   - 📌 การบ้านและกำหนดส่ง: [รายละเอียดการบ้าน; ถ้าไม่มีให้ระบุว่า ไม่มี]
4. ห้ามคัดลอกข้อมูลดิบยาวๆ จากชีตมาตอบตรงๆ ให้สรุปใหม่แบบกระชับแต่ครบสาระ (ไม่เกิน 10 บรรทัดต่อ 1 วัน/วิชา)
5. หากเจอข้อมูลวิชาเดียวกันในวันเดียวกันหลายรายการ ให้รวมให้เป็นภาพรวมเดียว ลดความซ้ำซ้อน
6. ห้ามใส่รูปแบบอ้างอิงแบบ [1], [2], (ref), หรือ citation ใดๆ ในเนื้อหา หากต้องระบุแหล่งที่มาให้แสดงเฉพาะลิงก์จริงภายใต้หัวข้อ "แหล่งที่มา" เท่านั้น`;
}

async function askGeminiWithContext(
  env: Bindings,
  payload: {
    message: string;
    history: Array<{ role: string; text: string }>;
    attachment?: { mimeType?: string; dataBase64?: string; name?: string };
    systemInstruction: string;
    useGrounding: boolean;
  }
) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");

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
      temperature: 0.15,
      topK: 24,
      topP: 0.8,
      maxOutputTokens: 700,
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
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

async function getLearningContent(env: Bindings, date?: string, id?: string) {
  const rows = await getSheetValues(env, `${SHEETS.LEARNING_CONTENT}!A2:J`);
  const data = toObjects(rows, ["id", "date", "subject", "title", "description", "audio_file_id", "audio_url", "attachments", "links", "created_at"]);

  if (id) return data.filter((item: any) => String(item.id) === String(id));
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
  const row = [id, data.date || new Date().toISOString().split('T')[0], data.subject || "", data.title || "", data.description || "", data.audio_file_id || "", data.audio_url || "", data.attachments || "", data.links || "", new Date().toISOString()];
  await appendSheetRow(env, `${SHEETS.LEARNING_CONTENT}!A:J`, row);
  return id;
}

async function editLearningContent(env: Bindings, data: any) {
  const rowIndex = await findRowIndexById(env, SHEETS.LEARNING_CONTENT, data.id);
  if (rowIndex === -1) throw new Error("Content not found");
  const rowNum = rowIndex + 1;
  const row = [data.id, data.date, data.subject, data.title, data.description, data.audio_file_id, data.audio_url, data.attachments, data.links];
  await updateSheetRow(env, `${SHEETS.LEARNING_CONTENT}!A${rowNum}:I${rowNum}`, row);
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
    typeof data.metadata === 'string' ? data.metadata : (data.metadata ? JSON.stringify(data.metadata) : "")
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

app.post('/api/gemini-chat', async (c) => {
  try {
    const body = await c.req.json();
    const message = String(body?.message || "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];
    const userEmail = String(body?.user?.email || "").trim().toLowerCase();
    const attachment = body?.attachment;

    if (!message && !attachment?.dataBase64) {
      return c.json({ success: false, error: "Message or attachment is required" }, 400);
    }
    if (!userEmail) {
      return c.json({ success: false, error: "User email is required" }, 401);
    }

    const [homeworkList, learningContentList, subjects] = await Promise.all([
      getHomeworkList(c.env),
      getLearningContent(c.env),
      getSubjects(c.env),
    ]);
    const availableSubjects = subjects.map((item) => String(item?.name || "")).filter(Boolean);
    const intent = parseUserQueryIntent(message || "วิเคราะห์ไฟล์ที่แนบ", availableSubjects);
    const allRows = buildClassContextRows(homeworkList, learningContentList);
    const contextRows = filterRowsByIntent(allRows, message || "วิเคราะห์ไฟล์ที่แนบ", intent);
    const filteredSheetDataChunk = buildFilteredSheetDataChunk(contextRows);
    const systemInstruction = buildSystemInstruction(filteredSheetDataChunk);
    const useGrounding = false;
    const contextRowsForResponse = contextRows.slice(0, 8).map((row) => ({
      ...row,
      homework: shortText(row.homework, 160),
      content: shortText(row.content, 180),
      emphasis: shortText(row.emphasis, 140),
      sourceLinks: (row.sourceLinks || []).slice(0, 8),
    }));
    const sourceLinks = Array.from(
      new Set(contextRows.flatMap((row) => row.sourceLinks || []))
    ).slice(0, 20);

    let answer = "";
    try {
      answer = await askGeminiWithContext(c.env, {
        message: message || "ช่วยวิเคราะห์ไฟล์ที่แนบ",
        history,
        attachment,
        systemInstruction,
        useGrounding,
      });
    } catch (err) {
      if (isGeminiLocationRestrictionError(err)) {
        answer = buildFallbackAnswerFromRows(contextRows, message || "สรุปข้อมูล");
      } else {
        throw err;
      }
    }

    const sourceDates = Array.from(new Set(contextRowsForResponse.map((row) => row.date).filter(Boolean))).slice(0, 10);
    const sourceSubjects = Array.from(new Set(contextRowsForResponse.map((row) => row.subject).filter(Boolean))).slice(0, 10);
    const filterSummary: FilterSummary = {
      subjectKeywords: intent.subjectKeywords,
      dateRange: intent.dateRange,
      dateTarget: intent.dateTarget,
      dueDateTarget: intent.dueDateTarget,
      wantsEmphasis: intent.wantsEmphasis,
      explicitWebSearch: intent.explicitWebSearch,
      matchedRowsCount: contextRows.length,
      sourceDates,
      sourceSubjects,
    };

    return c.json({
      success: true,
      data: {
        answer,
        sourceLinks,
        contextRows: contextRowsForResponse,
        filterSummary,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message || "gemini chat failed" }, 500);
  }
});

app.get('/content/:id', async (c) => {
  const rawId = c.req.param('id') || '';
  if (!rawId.endsWith('.json')) {
    return c.json({ error: 'Not found' }, 404);
  }
  const id = rawId.slice(0, -5);

  if (!id || !/^LC-\d+$/.test(id)) {
    return c.json({ error: 'Invalid content ID. Expected format: LC-{timestamp}' }, 400);
  }

  try {
    const items = await getLearningContent(c.env, undefined, id);
    if (!items.length) {
      return c.json({ error: 'Content not found', id }, 404);
    }

    const origin = new URL(c.req.url).origin;
    const body = buildContentExport(items[0], origin);

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
  const email = c.req.query('email') || "";
  try {
    if (!action) return c.json({ success: true, message: "StudyFlow Cloudflare Worker is online 🚀" });
    let result: any;
    switch (action) {
      case "list": result = await getHomeworkList(c.env); break;
      case "listWithProgress": result = await getHomeworkWithProgress(c.env, email); break;
      case "progress": result = await getProgressByEmail(c.env, email); break;
      case "allProgress": result = await getAllProgress(c.env); break;
      case "users": result = await getUserList(c.env); break;
      case "comments": result = await getComments(c.env, c.req.query('homework_id'), c.req.query('owner_email')); break;
      case "learningContent": result = await getLearningContent(c.env, c.req.query('date'), c.req.query('id')); break;
      case "subjects": result = await getSubjects(c.env); break;
      case "dailySummary": 
        const summary = await generateDailySummary(c.env, c.req.query('date'));
        if (c.req.query('send') === 'true') {
          const summaryWebhookUrl = String(c.env.SUMMARY_WEBHOOK_URL || "").trim();
          if (!summaryWebhookUrl) throw new Error("SUMMARY_WEBHOOK_URL is missing");
          await postDiscordContent(summaryWebhookUrl, summary);
        }
        result = { summary };
        break;
      case "getFreshLink":
        const fileId = c.req.query('fileId');
        if (!fileId) throw new Error("fileId is required");
        result = await getFreshTelegramLink(c.env, fileId, c.req.query('contentId'), c.req.query('contentType'));
        break;
      case "batchData": 
        result = { 
          homework: await getHomeworkList(c.env), 
          users: await getUserList(c.env), 
          progress: await getAllProgress(c.env), 
          learningContent: await getLearningContent(c.env), 
          subjects: await getSubjects(c.env),
          analytics: await getAnalytics(c.env),
          analyticsIpNotes: await getAnalyticsIpNotes(c.env),
          audioPermissions: await getAudioPermissions(c.env),
        };
        break;
      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, ...result, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/', async (c) => {
  try {
    let body: any = {};
    const contentType = c.req.header('content-type') || '';
    if (contentType.includes('application/json')) body = await c.req.json();
    else body = await c.req.parseBody();

    const action = body.action || c.req.query('action');
    const getVal = (key: string) => body[key] || c.req.query(key);
    if (!action) return c.json({ success: false, error: "Missing action" }, 400);

    let result: any;
    switch (action) {
      case "logAnalytics": result = await logAnalytics(c.env, body, c.req); break;
      case "saveAnalyticsIpNote": result = await saveAnalyticsIpNote(c.env, body); break;
      case "addHomework": result = await addHomework(c.env, body); break;
      case "editHomework": result = await editHomework(c.env, body); break;
      case "deleteHomework": result = await deleteRowById(c.env, SHEETS.HOMEWORK, getVal('id')); break;
      case "addLearningContent": result = await addLearningContent(c.env, body); break;
      case "editLearningContent": result = await editLearningContent(c.env, body); break;
      case "deleteLearningContent": result = await deleteRowById(c.env, SHEETS.LEARNING_CONTENT, getVal('id')); break;
      case "updateProgress": await updateProgress(c.env, getVal('email'), getVal('homework_id'), getVal('status'), getVal('image_url'), getVal('append') === 'true'); result = "ok"; break;
      case "addUser": await addUser(c.env, getVal('email'), getVal('display_name'), getVal('photo_url')); result = "ok"; break;
      case "addSubject": result = await addSubject(c.env, getVal('name'), getVal('color')); break;
      case "deleteSubject": result = await deleteRowById(c.env, SHEETS.SUBJECTS, getVal('id')); break;
      case "addComment": result = await addComment(c.env, getVal('homework_id'), getVal('owner_email'), getVal('commenter_email'), getVal('text')); break;
      case "sendSummary":
        const summaryText = await generateDailySummary(c.env, getVal('date'));
        const summaryWebhookUrl = String(c.env.SUMMARY_WEBHOOK_URL || "").trim();
        if (!summaryWebhookUrl) throw new Error("SUMMARY_WEBHOOK_URL is missing");
        await postDiscordContent(summaryWebhookUrl, summaryText);
        result = "Summary sent to Discord successfully! 📢";
        break;
      case "registerUpload":
        const uploadRow = [Date.now().toString(), getVal('filename'), getVal('contentType'), getVal('url'), new Date().toISOString(), "", getVal('fileId')];
        await appendSheetRow(c.env, `${SHEETS.URLS}!A:G`, uploadRow);
        result = "ok";
        break;
      case "upload":
      case "uploadProof":
      case "uploadAudio":
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
          await updateProgress(c.env, getVal('email'), getVal('homework_id'), getVal('status'), finalUrl, true);
        }
        result = { ...uploadRes, url: finalUrl };
        break;
      case "fixSheetHeaders":
        result = await fixSheetHeaders(c.env);
        break;
      default: return c.json({ success: false, error: "unknown action: " + action }, 400);
    }
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

export default app;
