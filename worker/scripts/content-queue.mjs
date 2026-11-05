// Local upload queue for Learning Content (see docs/AI_CONTENT_WORKFLOW.md).
//
// Why: summarising a lesson (AI, fast) and archiving its audio on Telegram + writing the Sheet row (slow, rate
// limited, can fail) used to run one after another, so the AI sat waiting on every upload. Now they are split:
//
//   add     the AI finishes a lesson and ENQUEUES it. Local only (SQLite), returns in well under a second.
//   drain   a separate process uploads the queue (Telegram + Sheet) with retries, while the AI keeps summarising.
//
//   node worker/scripts/content-queue.mjs add --file content-drafts/x.md --audio compressed/x.m4a --subject Physic [--date YYYY-MM-DD] [--private]
//   node worker/scripts/content-queue.mjs drain [--watch] [--idle 300] [--delay 1000] [--max-attempts 5] [--dry-run]
//   node worker/scripts/content-queue.mjs status [--all] [--json]
//   node worker/scripts/content-queue.mjs retry [<id> | --all]       failed -> pending
//   node worker/scripts/content-queue.mjs remove <id>                 drop a pending/failed job
//
// Data lives in content-queue/queue.db (git-ignored). Uploads go through the Worker (POST /api/cli/content), which is
// idempotent on the job key, so re-running or crashing mid-upload never creates a duplicate card.
// Needs Node >= 22.13 (built-in node:sqlite) and CLI_ADMIN_KEY in worker/.dev.vars for `drain`.
import fs from 'node:fs';
import path from 'node:path';
import {
  AUDIO_MAX_BYTES, DEFAULT_API, bangkokToday, dateFromFilename, fetchSheetsContext, loadDevVars, makeKey,
  parseLesson, postCliContent, readTerm, repoRoot, resolveSubject, validDate,
} from './lib/content-common.mjs';

// node:sqlite is flagged experimental on some Node 22 builds; keep the output clean.
process.removeAllListeners('warning');
let DatabaseSync;
try {
  ({ DatabaseSync } = await import('node:sqlite'));
} catch {
  console.error('Error: this tool needs Node >= 22.13 (built-in node:sqlite).');
  process.exit(1);
}

const argv = process.argv.slice(2);
const command = argv[0] && !argv[0].startsWith('--') ? argv[0] : '';
const rest = command ? argv.slice(1) : argv;
const flag = (name) => rest.includes(`--${name}`);
const opt = (name) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};
const positional = rest[0] && !rest[0].startsWith('--') ? [rest[0]] : []; // retry <id> / remove <id>
const fail = (msg) => { console.error(`Error: ${msg}`); process.exit(1); };
const num = (name, def) => { const v = Number(opt(name)); return Number.isFinite(v) && opt(name) !== undefined ? v : def; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();
const fmt = (ms) => new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok' });

// --- database ---
const dbPath = path.resolve(opt('db') || path.join(repoRoot, 'content-queue', 'queue.db'));
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 8000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',   -- pending | uploading | done | failed
    date TEXT NOT NULL,
    subject TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    is_private INTEGER NOT NULL DEFAULT 0,
    audio_path TEXT NOT NULL DEFAULT '',
    audio_size INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    card_id TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    done_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`);
const metaGet = (k) => db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v;
const metaSet = (k, v) => db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);

const counts = () => {
  const c = { pending: 0, uploading: 0, done: 0, failed: 0 };
  for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM jobs GROUP BY status').all()) c[r.status] = Number(r.n);
  return c;
};
const countLine = (c = counts()) => `queue: ${c.pending} pending, ${c.uploading} uploading, ${c.done} done, ${c.failed} failed`;
const label = (j) => `#${j.id} ${j.date} ${j.subject} "${String(j.title).slice(0, 60)}"`;

// --- subjects: cached so `add` stays instant and offline-friendly ---
async function subjectsFor(term) {
  const cacheKey = `subjects:${term}`;
  const cached = metaGet(cacheKey);
  if (cached) {
    const { at, subjects } = JSON.parse(cached);
    if (now() - at < 12 * 3600 * 1000) return subjects;
  }
  try {
    const { subjects } = await fetchSheetsContext(loadDevVars(), term);
    metaSet(cacheKey, JSON.stringify({ at: now(), subjects }));
    return subjects;
  } catch (e) {
    if (cached) { console.warn(`Warning: could not refresh subjects (${e.message}); using the cached list.`); return JSON.parse(cached).subjects; }
    console.warn(`Warning: could not read subjects (${e.message}); accepting "${opt('subject')}" unchecked.`);
    return null;
  }
}

// --- commands ---
async function cmdAdd() {
  const file = opt('file');
  const subjectArg = opt('subject');
  if (!file || !subjectArg) fail('usage: add --file <lesson.md> --subject <name> [--audio <file>] [--date YYYY-MM-DD] [--private]');
  let lesson;
  try { lesson = parseLesson(fs.readFileSync(path.resolve(file), 'utf8')); } catch (e) { fail(e.message); }
  lesson.warnings.forEach((w) => console.warn(`Warning: ${w}`));

  const date = opt('date') || dateFromFilename(path.basename(file)) || bangkokToday();
  if (!validDate(date)) fail(`invalid date "${date}" (use YYYY-MM-DD)`);

  let audioPath = '';
  let audioSize = 0;
  if (opt('audio')) {
    audioPath = path.resolve(opt('audio'));
    if (!fs.existsSync(audioPath)) fail(`audio file not found: ${audioPath}`);
    audioSize = fs.statSync(audioPath).size;
    if (audioSize > AUDIO_MAX_BYTES) fail(`audio is ${(audioSize / 1048576).toFixed(1)} MB; the archive limit is 19 MB. Run scripts/audio-compress.mjs first.`);
  }

  const term = readTerm(opt('term'));
  const subjects = await subjectsFor(term);
  let subject = subjectArg.trim();
  if (subjects) {
    try { subject = resolveSubject(subjects, subjectArg, term).subject; } catch (e) { fail(e.message); }
  } else if (subject.toLowerCase() === 'other') subject = 'Other';

  const key = makeKey({ audioBasename: audioPath ? path.basename(audioPath) : '', date, subject, title: lesson.title });
  const existing = db.prepare('SELECT * FROM jobs WHERE key = ?').get(key);
  if (existing) {
    if (existing.status === 'failed') {
      db.prepare("UPDATE jobs SET status='pending', attempts=0, next_attempt_at=0, last_error='', description=?, updated_at=? WHERE id=?").run(lesson.markdown, now(), existing.id);
      console.log(`Re-queued failed job #${existing.id} (content refreshed). ${countLine()}`);
    } else {
      console.log(`Already queued as #${existing.id} (${existing.status}); nothing to do. ${countLine()}`);
    }
    return;
  }
  const t = now();
  const info = db.prepare(`INSERT INTO jobs (key, date, subject, title, description, is_private, audio_path, audio_size, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(key, date, subject, lesson.title, lesson.markdown, flag('private') ? 1 : 0, audioPath, audioSize, t, t);
  console.log(`Queued #${info.lastInsertRowid}: ${date} | ${subject} | ${lesson.title}`);
  console.log(`         ${lesson.markdown.length} chars${audioPath ? `, audio ${path.basename(audioPath)} (${(audioSize / 1048576).toFixed(1)} MB)` : ', no audio'}${flag('private') ? ', private' : ''}`);
  console.log(countLine());
}

function acquireLock() {
  const held = metaGet('drain_lock');
  if (held) {
    const { pid, at } = JSON.parse(held);
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { /* not running */ }
    if (alive && pid !== process.pid && now() - at < 120000) fail(`another drain is already running (pid ${pid}). It will pick up newly queued jobs by itself if it was started with --watch.`);
  }
  metaSet('drain_lock', JSON.stringify({ pid: process.pid, at: now() }));
}
const heartbeat = () => metaSet('drain_lock', JSON.stringify({ pid: process.pid, at: now() }));
const releaseLock = () => { try { db.prepare("DELETE FROM meta WHERE k = 'drain_lock'").run(); } catch { /* ignore */ } };

async function cmdDrain() {
  const watch = flag('watch');
  const idleMs = num('idle', 300) * 1000;
  const delayMs = num('delay', 1000);
  const maxAttempts = num('max-attempts', 5);

  if (flag('dry-run')) {
    const jobs = db.prepare("SELECT * FROM jobs WHERE status IN ('pending','uploading') ORDER BY id").all();
    jobs.forEach((j) => console.log(`would upload ${label(j)}${j.audio_path ? ` + ${path.basename(j.audio_path)}` : ''}`));
    console.log(jobs.length ? countLine() : `Nothing to upload. ${countLine()}`);
    return;
  }

  const env = loadDevVars();
  const cliKey = process.env.CLI_ADMIN_KEY || env.CLI_ADMIN_KEY || '';
  if (!cliKey) fail('CLI_ADMIN_KEY is missing: add it to worker/.dev.vars (same value as the Worker secret) or set the env var.');
  const api = opt('api') || env.WORKER_URL || DEFAULT_API;

  acquireLock();
  process.on('SIGINT', () => { releaseLock(); process.exit(130); });
  db.prepare("UPDATE jobs SET status='pending' WHERE status='uploading'").run(); // left over from a crashed run
  console.log(`Draining to ${api}${watch ? ` (watch mode: exits after ${idleMs / 1000}s with nothing to do)` : ''}. ${countLine()}`);

  let lastWork = now();
  let okCount = 0;
  let failCount = 0;
  for (;;) {
    heartbeat();
    const job = db.prepare("SELECT * FROM jobs WHERE status='pending' AND next_attempt_at <= ? ORDER BY id LIMIT 1").get(now());
    if (!job) {
      const waiting = db.prepare("SELECT MIN(next_attempt_at) AS t, COUNT(*) AS n FROM jobs WHERE status='pending'").get();
      if (Number(waiting.n) > 0) { await sleep(Math.min(Math.max(Number(waiting.t) - now(), 500), 5000)); continue; } // retries pending
      if (!watch || now() - lastWork > idleMs) break;
      await sleep(2000);
      continue;
    }
    lastWork = now();

    if (job.audio_path && !fs.existsSync(job.audio_path)) {
      db.prepare("UPDATE jobs SET status='failed', last_error=?, updated_at=? WHERE id=?").run(`audio file is gone: ${job.audio_path}`, now(), job.id);
      console.log(`FAIL ${label(job)}: audio file is gone`);
      failCount++;
      continue;
    }
    db.prepare("UPDATE jobs SET status='uploading', attempts=attempts+1, updated_at=? WHERE id=?").run(now(), job.id);
    const started = now();
    const r = await postCliContent({
      api, cliKey, key: job.key, date: job.date, subject: job.subject, title: job.title, description: job.description,
      isPrivate: Boolean(job.is_private), audioPath: job.audio_path, replaceAudio: false,
    });
    const secs = ((now() - started) / 1000).toFixed(1);

    if (r.ok) {
      db.prepare("UPDATE jobs SET status='done', card_id=?, last_error='', done_at=?, updated_at=? WHERE id=?").run(r.id, now(), now(), job.id);
      console.log(`OK   ${label(job)} -> ${r.id}${r.existed ? ' (already existed)' : ''}${job.audio_path ? ' [audio]' : ''} ${secs}s`);
      okCount++;
    } else if (r.fatal) {
      db.prepare("UPDATE jobs SET status='pending', attempts=attempts-1, last_error=?, updated_at=? WHERE id=?").run(r.error, now(), job.id);
      console.error(`STOP ${r.error}. The CLI key or Worker config is wrong, so every job would fail. Fix CLI_ADMIN_KEY (worker/.dev.vars vs the deployed Worker var) and run drain again.`);
      releaseLock();
      process.exit(2);
    } else if (r.retryable && job.attempts + 1 < maxAttempts) {
      const wait = Math.min(30000 * 2 ** job.attempts, 600000);
      db.prepare("UPDATE jobs SET status='pending', next_attempt_at=?, last_error=?, updated_at=? WHERE id=?").run(now() + wait, r.error, now(), job.id);
      console.log(`RETRY ${label(job)}: ${r.error} (attempt ${job.attempts + 1}/${maxAttempts}, next ~${fmt(now() + wait)})`);
    } else {
      db.prepare("UPDATE jobs SET status='failed', last_error=?, updated_at=? WHERE id=?").run(r.error, now(), job.id);
      console.log(`FAIL ${label(job)}: ${r.error}`);
      failCount++;
    }
    if (delayMs > 0) await sleep(delayMs); // be gentle with the Telegram queue
  }

  releaseLock();
  console.log(`\nDrain finished: ${okCount} uploaded, ${failCount} failed. ${countLine()}`);
  if (okCount) console.log('Cards appear in the app within ~10 minutes (cron) or at once via Admin -> Dashboard -> Sync Fast Cache.');
  if (counts().failed) console.log('Inspect with `status`, fix the cause, then `retry --all`.');
}

function cmdStatus() {
  const c = counts();
  const rows = db.prepare(flag('all') ? 'SELECT * FROM jobs ORDER BY id' : "SELECT * FROM jobs WHERE status != 'done' ORDER BY id").all();
  if (flag('json')) { console.log(JSON.stringify({ counts: c, jobs: rows.map(({ description, ...j }) => j) }, null, 2)); return; }
  console.log(countLine(c));
  for (const j of rows) {
    const extra = j.status === 'done' ? j.card_id : j.last_error ? `${j.last_error} (attempts ${j.attempts})` : '';
    console.log(`  ${j.status.padEnd(9)} ${label(j)}${j.audio_path ? ' [audio]' : ''}${extra ? `  ${extra}` : ''}`);
  }
  const lock = metaGet('drain_lock');
  if (lock) { const { pid, at } = JSON.parse(lock); console.log(`drain running: pid ${pid}, heartbeat ${fmt(at)}`); }
}

function cmdRetry() {
  const target = positional[0];
  if (!target && !flag('all')) fail('usage: retry <id> | retry --all');
  const sql = "UPDATE jobs SET status='pending', attempts=0, next_attempt_at=0, last_error='', updated_at=? WHERE status='failed'";
  const r = target ? db.prepare(`${sql} AND id = ?`).run(now(), Number(target)) : db.prepare(sql).run(now());
  console.log(`${r.changes} job(s) back to pending. ${countLine()}`);
}

function cmdRemove() {
  const id = Number(positional[0]);
  if (!id) fail('usage: remove <id>');
  const r = db.prepare("DELETE FROM jobs WHERE id = ? AND status IN ('pending','failed')").run(id);
  console.log(r.changes ? `Removed #${id}.` : `#${id} not found or already uploading/done.`);
}

const commands = { add: cmdAdd, drain: cmdDrain, status: cmdStatus, retry: cmdRetry, remove: cmdRemove };
if (!commands[command]) fail('usage: content-queue.mjs <add|drain|status|retry|remove> [options]  (see the header of this file)');
await commands[command]();
