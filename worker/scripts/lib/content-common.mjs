// Shared helpers for the Learning Content CLI tools (add-content.mjs, content-queue.mjs).
// See docs/AI_CONTENT_WORKFLOW.md. Nothing here prints secrets.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const workerRoot = path.resolve(__dirname, '..', '..');
export const repoRoot = path.resolve(workerRoot, '..');

export const AUDIO_MAX_BYTES = 19 * 1024 * 1024;
export const DEFAULT_API = 'https://kanban-worker.sealseapep.workers.dev';

export function loadDevVars() {
  const env = {};
  for (const line of fs.readFileSync(path.join(workerRoot, '.dev.vars'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v.replace(/\\n/g, '\n');
  }
  return env;
}

/** Markdown must start with "# Title" (teaching template). Returns { markdown, title, warnings }. Throws Error. */
export function parseLesson(raw) {
  const markdown = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
  const firstLine = markdown.split('\n', 1)[0];
  if (!/^# \S/.test(firstLine)) throw new Error('the first line must be "# <title>" (template rule: no preamble before the title)');
  const title = firstLine.replace(/^#\s+/, '').trim();
  if (markdown.length > 49000) throw new Error(`content is ${markdown.length} chars; one Sheets cell holds 50,000. Split it into numbered cards (part 1, part 2 ...) in time order.`);
  const warnings = [];
  if (!/\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(markdown)) warnings.push('no [mm:ss] timestamps found; the template requires one per section.');
  return { markdown, title, warnings };
}

export function validDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** DD-MM-YY (a 2-digit year is read as 20YY, so pass --date for Buddhist-era names), DD-MM-YYYY (BE ok) or YYYY-MM-DD. */
export function dateFromFilename(name) {
  let m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{2}|\d{4})/);
  if (!m) return '';
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  if (year > 2400) year -= 543;
  return `${String(year).padStart(4, '0')}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}

export const bangkokToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());

export function readTerm(override) {
  if (override) return override;
  const configText = fs.readFileSync(path.join(repoRoot, 'lib', 'config.ts'), 'utf8');
  const term = (configText.match(/CURRENT_TERM\s*=\s*'([^']+)'/) || [])[1];
  if (!term) throw new Error('could not read CURRENT_TERM from lib/config.ts; pass --term');
  return term;
}

/** Reads the Subjects sheet. Returns { base, auth, subjects } where subjects = current-term [{name, code}]. */
export async function fetchSheetsContext(env, term) {
  const { JWT } = await import('google-auth-library');
  const client = new JWT({ email: env.GOOGLE_CLIENT_EMAIL, key: env.GOOGLE_PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
  const { token } = await client.getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`;
  const res = await fetch(`${base}/values/${encodeURIComponent('Subjects!A2:F')}`, { headers: auth });
  if (!res.ok) throw new Error(`could not read Subjects: ${res.status}`);
  const all = ((await res.json()).values || []).map((r) => ({ name: String(r[1] || '').trim(), term: String(r[4] || '').trim() || term, code: String(r[5] || '').trim() }));
  return { base, auth, subjects: all.filter((s) => s.term === term).map(({ name, code }) => ({ name, code })) };
}

/** Case-insensitive match against the current-term subjects, or "Other". Throws with the valid options. */
export function resolveSubject(subjects, arg, term) {
  const wanted = arg.trim().toLowerCase();
  if (wanted === 'other') return { subject: 'Other', code: '' };
  const match = subjects.find((s) => s.name.toLowerCase() === wanted);
  if (!match) throw new Error(`"${arg}" is not a ${term} subject. Options: ${subjects.map((s) => s.name).join(', ')}, Other`);
  return { subject: match.name, code: match.code };
}

/** Deterministic id suffix: the same audio/date/subject/title never creates a second card. DO NOT change the formula. */
export function makeKey({ audioBasename, date, subject, title }) {
  return crypto.createHash('sha256').update([audioBasename || '', date, subject, title].join('\n')).digest('hex').slice(0, 32);
}

/**
 * POST one card (+ optional audio) to the Worker. Never throws on HTTP errors.
 * Returns { ok, status, retryable, fatal, error, id, existed, replacedAudio, audio }.
 * retryable: network/timeout/429/5xx. fatal: the key/config is wrong (401/503), so the whole batch should stop.
 */
export async function postCliContent({ api, cliKey, key, date, subject, title, description, isPrivate, audioPath, replaceAudio, timeoutMs = 240000 }) {
  const form = new FormData();
  form.append('key', key);
  form.append('date', date);
  form.append('subject', subject);
  form.append('title', title);
  form.append('description', description);
  form.append('is_private', isPrivate ? '1' : '');
  if (replaceAudio) form.append('replace_audio', '1');
  if (audioPath) form.append('audio', new Blob([fs.readFileSync(audioPath)]), path.basename(audioPath));
  let r;
  try {
    r = await fetch(`${api}/api/cli/content`, { method: 'POST', headers: { 'X-CLI-Key': cliKey }, body: form, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    return { ok: false, status: 0, retryable: true, fatal: false, error: `network: ${e?.name === 'TimeoutError' ? `timeout after ${timeoutMs / 1000}s` : e?.message || e}` };
  }
  const out = await r.json().catch(() => ({}));
  if (r.ok && out.success) return { ok: true, status: r.status, id: out.id, existed: Boolean(out.existed), replacedAudio: Boolean(out.replacedAudio), audio: Boolean(out.audio) };
  return {
    ok: false,
    status: r.status,
    retryable: r.status === 429 || r.status >= 500,
    fatal: r.status === 401 || r.status === 503,
    error: `${r.status} ${out.error || ''}`.trim(),
  };
}
