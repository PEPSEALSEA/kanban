import { JWT } from 'google-auth-library';

export type SheetBindings = {
  SPREADSHEET_ID: string;
  GOOGLE_CLIENT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
};

export const SHEETS = {
  HOMEWORK: 'Homework',
  LEARNING_CONTENT: 'LearningContent',
  AI_CHAT_LOGS: 'AiChatLogs',
} as const;

const AI_CHAT_LOGS_COLUMNS = [
  'id',
  'email',
  'user_name',
  'user_message',
  'ai_answer',
  'model',
  'attachment_name',
  'status',
  'context_total_rows',
  'context_subjects',
  'context_dates',
  'references_json',
  'source_links_json',
  'error_message',
  'created_at',
];

let cachedAuthToken: { value: string; expiresAt: number } | null = null;
let authTokenPromise: Promise<string> | null = null;

export async function getAuthToken(env: SheetBindings): Promise<string> {
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

export async function getSheetValues(env: SheetBindings, range: string) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${body || res.statusText}`);
  }
  const data = (await res.json()) as { values?: string[][] };
  return data.values || [];
}

export async function appendSheetRow(env: SheetBindings, range: string, values: unknown[]) {
  const token = await getAuthToken(env);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${body || res.statusText}`);
  }
  return await res.json();
}

export function toObjects(rows: string[][], headers: string[]) {
  if (!rows || rows.length === 0) return [];
  return rows.map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });
}

export function isSheetTruthy(v?: string) {
  return v === '1' || String(v || '').toLowerCase() === 'true';
}

export async function getHomeworkList(env: SheetBindings) {
  const rows = await getSheetValues(env, `${SHEETS.HOMEWORK}!A2:I`);
  return toObjects(rows, [
    'id',
    'subject',
    'title',
    'description',
    'deadline',
    'link_work',
    'link_image',
    'note',
    'created_at',
  ]);
}

export async function getLearningContent(env: SheetBindings) {
  const rows = await getSheetValues(env, `${SHEETS.LEARNING_CONTENT}!A2:K`);
  return toObjects(rows, [
    'id',
    'date',
    'subject',
    'title',
    'description',
    'audio_file_id',
    'audio_url',
    'attachments',
    'links',
    'is_private',
    'created_at',
  ]);
}

function truncateForSheet(value: string, maxLen = 8000): string {
  const text = String(value || '');
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 3))}...`;
}

export async function logAiChat(
  env: SheetBindings,
  payload: {
    email: string;
    userName?: string;
    userMessage: string;
    aiAnswer?: string;
    model: string;
    status: 'success' | 'fallback' | 'error';
    contextTotalRows: number;
    contextSubjects: number;
    contextDates: number;
    errorMessage?: string;
  }
): Promise<void> {
  const id = `CHAT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const row = [
    id,
    payload.email,
    payload.userName || '',
    truncateForSheet(payload.userMessage, 4000),
    truncateForSheet(payload.aiAnswer || '', 8000),
    payload.model,
    '',
    payload.status,
    payload.contextTotalRows,
    payload.contextSubjects,
    payload.contextDates,
    '[]',
    '[]',
    truncateForSheet(payload.errorMessage || '', 1000),
    new Date().toISOString(),
  ];
  const endCol = String.fromCharCode(64 + AI_CHAT_LOGS_COLUMNS.length);
  await appendSheetRow(env, `${SHEETS.AI_CHAT_LOGS}!A:${endCol}`, row);
}
