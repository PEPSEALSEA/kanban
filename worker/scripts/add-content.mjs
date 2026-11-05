// Add one LearningContent card to the Google Sheet from a Markdown file (AI content workflow, see docs/AI_CONTENT_WORKFLOW.md).
//
//   node worker/scripts/add-content.mjs --file lesson.md --subject Physic            -> dry-run (prints the row, writes nothing)
//   node worker/scripts/add-content.mjs --file lesson.md --subject Physic --apply    -> appends the row
//
// Options:
//   --file <path>      Markdown whose first line is "# Title" (the template's required first line)
//   --subject <name>   Must be a subject of the current term (see Subjects sheet) or "Other"
//   --date YYYY-MM-DD  Defaults to a DD-MM-YY / DD-MM-YYYY / YYYY-MM-DD date in the file name, else today (Asia/Bangkok)
//   --private          Mark the card private (is_private = 1)
//   --term N/YYYY      Defaults to CURRENT_TERM in lib/config.ts
//   --audio <path>     Also archive this audio (<=19 MB) and attach it. Needs CLI_ADMIN_KEY (worker/.dev.vars or env)
//                      matching the Worker secret; goes through POST /api/cli/content. Idempotent (re-runs skip).
//   --api <url>        Worker URL override (default WORKER_URL in .dev.vars, else the production Worker)
//
// The row gets tags "<term>,<course code>" (code from the current-term Subjects row, if it has one).
// Audio is not handled here: the audio archive needs the Worker's Telegram secrets, so attach the audio afterwards
// in the app (Admin -> Content Archive -> edit the card). The D1 fast-read copy picks the new row up on the next
// 10-minute cron tick.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JWT } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(workerRoot, '..');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const fail = (msg) => { console.error(`Error: ${msg}`); process.exit(1); };

const file = opt('file');
const subjectArg = opt('subject');
if (!file || !subjectArg) fail('usage: add-content.mjs --file <lesson.md> --subject <name> [--date YYYY-MM-DD] [--private] [--apply]');
const APPLY = flag('apply');

// --- content ---
const markdown = fs.readFileSync(path.resolve(file), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n').trim();
const firstLine = markdown.split('\n', 1)[0];
if (!/^# \S/.test(firstLine)) fail('the first line must be "# <title>" (template rule: no preamble before the title)');
const title = firstLine.replace(/^#\s+/, '').trim();
if (markdown.length > 49000) fail(`content is ${markdown.length} chars; one Sheets cell holds 50,000. Split it into numbered cards (part 1, part 2 ...) in time order.`);
if (!/\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(markdown)) console.warn('Warning: no [mm:ss] timestamps found; the template requires one per section.');

// --- date ---
function validDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function dateFromFilename(name) {
  let m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/(\d{1,2})[-_.](\d{1,2})[-_.](\d{2}|\d{4})/);
  if (!m) return '';
  let year = Number(m[3]);
  if (m[3].length === 2) year += 2000;
  if (year > 2400) year -= 543;
  return `${String(year).padStart(4, '0')}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
}
const bangkokToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
const date = opt('date') || dateFromFilename(path.basename(file)) || bangkokToday;
if (!validDate(date)) fail(`invalid date "${date}" (use YYYY-MM-DD)`);

// --- term ---
const configText = fs.readFileSync(path.join(repoRoot, 'lib', 'config.ts'), 'utf8');
const term = opt('term') || (configText.match(/CURRENT_TERM\s*=\s*'([^']+)'/) || [])[1];
if (!term) fail('could not read CURRENT_TERM from lib/config.ts; pass --term');

function loadDevVars() {
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

const env = loadDevVars();
const client = new JWT({ email: env.GOOGLE_CLIENT_EMAIL, key: env.GOOGLE_PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const { token } = await client.getAccessToken();
const auth = { Authorization: `Bearer ${token}` };
const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`;

const subjectRes = await fetch(`${base}/values/${encodeURIComponent('Subjects!A2:F')}`, { headers: auth });
if (!subjectRes.ok) fail(`could not read Subjects: ${subjectRes.status}`);
const subjects = ((await subjectRes.json()).values || []).map((r) => ({ name: String(r[1] || '').trim(), term: String(r[4] || '').trim() || term, code: String(r[5] || '').trim() }));
const currentSubjects = subjects.filter((s) => s.term === term);

const wanted = subjectArg.trim().toLowerCase();
let subject = 'Other';
let code = '';
if (wanted !== 'other') {
  const match = currentSubjects.find((s) => s.name.toLowerCase() === wanted);
  if (!match) fail(`"${subjectArg}" is not a ${term} subject. Options: ${currentSubjects.map((s) => s.name).join(', ')}, Other`);
  subject = match.name;
  code = match.code;
}
const tags = [term, code].filter(Boolean).join(',');

// --- audio (optional): goes through the Worker's /api/cli/content, which holds the Telegram secrets ---
const audioArg = opt('audio');
let audioPath = '';
if (audioArg) {
  audioPath = path.resolve(audioArg);
  if (!fs.existsSync(audioPath)) fail(`audio file not found: ${audioPath}`);
  const size = fs.statSync(audioPath).size;
  if (size > 19 * 1024 * 1024) fail(`audio is ${(size / 1048576).toFixed(1)} MB; the archive limit is 19 MB. Compress or split it first.`);
}
const API_URL = opt('api') || env.WORKER_URL || 'https://kanban-worker.sealseapep.workers.dev';
const CLI_KEY = process.env.CLI_ADMIN_KEY || env.CLI_ADMIN_KEY || '';
// Deterministic key => re-running the same pair never creates a duplicate card.
const key = crypto.createHash('sha256').update([audioArg ? path.basename(audioPath) : '', date, subject, title].join('\n')).digest('hex').slice(0, 32);

const row = [
  `LC-${crypto.randomUUID()}`, date, subject, title, markdown,
  '', '', '', '', flag('private') ? '1' : '',
  new Date().toISOString(), tags,
];

console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (nothing is written)'}`);
console.log(`id:      ${row[0]}`);
console.log(`date:    ${date}${opt('date') ? '' : ' (from file name or today)'}`);
console.log(`subject: ${subject}`);
console.log(`title:   ${title}`);
console.log(`tags:    ${tags}`);
console.log(`private: ${row[9] ? 'yes' : 'no'}`);
console.log(`length:  ${markdown.length} chars, ${markdown.split('\n').length} lines`);
if (audioPath) console.log(`audio:   ${path.basename(audioPath)} (${(fs.statSync(audioPath).size / 1048576).toFixed(1)} MB) -> via ${API_URL}`);

if (!APPLY) { console.log('\nRe-run with --apply to append this card.'); process.exit(0); }

if (audioPath) {
  if (!CLI_KEY) fail('CLI_ADMIN_KEY is missing: add it to worker/.dev.vars (same value as the Worker secret) or set the env var.');
  const form = new FormData();
  form.append('key', key);
  form.append('date', date);
  form.append('subject', subject);
  form.append('title', title);
  form.append('description', markdown);
  form.append('is_private', flag('private') ? '1' : '');
  form.append('audio', new Blob([fs.readFileSync(audioPath)]), path.basename(audioPath));
  const r = await fetch(`${API_URL}/api/cli/content`, { method: 'POST', headers: { 'X-CLI-Key': CLI_KEY }, body: form });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || !out.success) fail(`Worker import failed: ${r.status} ${out.error || ''}`);
  console.log(`\n${out.existed ? 'Already imported (skipped)' : 'Imported with audio'}: ${out.id}`);
  process.exit(0);
}

// RAW + anchored to column A, same as the Worker's addLearningContent (keeps "1/2569" and dates as text).
const res = await fetch(`${base}/values/${encodeURIComponent('LearningContent!A:A')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ values: [row] }),
});
if (!res.ok) fail(`append failed: ${res.status} ${await res.text()}`);
console.log('\nAppended. It appears in the app within ~10 minutes (cron sync), or at once after Admin -> Dashboard -> Sync Fast Cache.');
