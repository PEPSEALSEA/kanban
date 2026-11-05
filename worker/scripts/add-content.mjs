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
//   --replace-audio    With --audio on a card that was already imported: upload the audio again and swap only its audio columns
//   --api <url>       Worker URL override (default WORKER_URL in .dev.vars, else the production Worker)
//
// The row gets tags "<term>,<course code>" (code from the current-term Subjects row, if it has one).
// With --audio the upload goes through the Worker (it holds the Telegram secrets). For batches prefer
// worker/scripts/content-queue.mjs, which queues locally so the AI does not wait on Telegram.
// The D1 fast-read copy picks the new row up on the next 10-minute cron tick.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JWT } from 'google-auth-library';
import {
  AUDIO_MAX_BYTES, DEFAULT_API, bangkokToday, dateFromFilename, loadDevVars, makeKey, parseLesson, postCliContent, readTerm, resolveSubject, validDate,
} from './lib/content-common.mjs';

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
let lesson;
try { lesson = parseLesson(fs.readFileSync(path.resolve(file), 'utf8')); } catch (e) { fail(e.message); }
lesson.warnings.forEach((w) => console.warn(`Warning: ${w}`));
const { markdown, title } = lesson;

// --- date ---
const date = opt('date') || dateFromFilename(path.basename(file)) || bangkokToday();
if (!validDate(date)) fail(`invalid date "${date}" (use YYYY-MM-DD)`);

// --- term ---
let term;
try { term = readTerm(opt('term')); } catch (e) { fail(e.message); }

const env = loadDevVars();
const client = new JWT({ email: env.GOOGLE_CLIENT_EMAIL, key: env.GOOGLE_PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const { token } = await client.getAccessToken();
const auth = { Authorization: `Bearer ${token}` };
const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`;

const subjectRes = await fetch(`${base}/values/${encodeURIComponent('Subjects!A2:F')}`, { headers: auth });
if (!subjectRes.ok) fail(`could not read Subjects: ${subjectRes.status}`);
const subjects = ((await subjectRes.json()).values || []).map((r) => ({ name: String(r[1] || '').trim(), term: String(r[4] || '').trim() || term, code: String(r[5] || '').trim() }));
const currentSubjects = subjects.filter((s) => s.term === term);

let subject, code;
try { ({ subject, code } = resolveSubject(currentSubjects, subjectArg, term)); } catch (e) { fail(e.message); }
const tags = [term, code].filter(Boolean).join(',');

// --- audio (optional): goes through the Worker's /api/cli/content, which holds the Telegram secrets ---
const audioArg = opt('audio');
let audioPath = '';
if (audioArg) {
  audioPath = path.resolve(audioArg);
  if (!fs.existsSync(audioPath)) fail(`audio file not found: ${audioPath}`);
  const size = fs.statSync(audioPath).size;
  if (size > AUDIO_MAX_BYTES) fail(`audio is ${(size / 1048576).toFixed(1)} MB; the archive limit is 19 MB. Compress or split it first.`);
}
const API_URL = opt('api') || env.WORKER_URL || DEFAULT_API;
const CLI_KEY = process.env.CLI_ADMIN_KEY || env.CLI_ADMIN_KEY || '';
// Deterministic key => re-running the same pair never creates a duplicate card.
const key = makeKey({ audioBasename: audioArg ? path.basename(audioPath) : '', date, subject, title });

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
  const out = await postCliContent({
    api: API_URL, cliKey: CLI_KEY, key, date, subject, title, description: markdown,
    isPrivate: flag('private'), audioPath, replaceAudio: flag('replace-audio'),
  });
  if (!out.ok) fail(`Worker import failed: ${out.error}`);
  console.log(`
${out.replacedAudio ? 'Audio replaced on existing card' : out.existed ? 'Already imported (skipped)' : 'Imported with audio'}: ${out.id}`);
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
