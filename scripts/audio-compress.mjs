#!/usr/bin/env node
// Local, parallel, size-aware audio converter for StudyFlow recordings (see docs/AUDIO_COMPRESS.md).
//
// Why: the app archives audio in Telegram (the Worker rejects files above 19 MiB). Instead of one fixed setting
// for every file (e.g. 16 kbps HE-AAC), this picks the highest bitrate that still fits the size budget for each
// file's length, so short recordings stay clear and only long ones are squeezed. Files that already fit are
// copied untouched. A recording too long for a clear single file is split into equal parts.
//
//   node scripts/audio-compress.mjs <files or folders...> [options]
//
// Options (defaults in brackets):
//   --out <dir>        output folder [<first input folder>/compressed]
//   --target-mb <n>    size budget per output file in MiB [18]
//   --hard-mb <n>      files at or below this are copied as-is; outputs above it are re-encoded smaller [19]
//   --jobs <n>         parallel ffmpeg processes [75% of CPU cores]
//   --codec <c>        aac (.m4a, plays everywhere) | opus (.ogg, clearest at low bitrate) | mp3 [aac]
//   --max-kbps <n>     never exceed this bitrate [80]
//   --min-kbps <n>     below this, split into parts instead of degrading [aac 40, opus 20, mp3 40]
//   --stereo           keep stereo (default: mono, which halves the bits for speech)
//   --normalize        even out loudness (ffmpeg dynaudnorm) before encoding
//   --recursive        look inside sub-folders
//   --plan             only print the plan, convert nothing
//   --overwrite        replace existing outputs (default: skip them)
//
// Needs ffmpeg + ffprobe on PATH. No npm packages.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MiB = 1024 * 1024;
const AUDIO_EXT = new Set(['.m4a', '.mp3', '.wav', '.aac', '.ogg', '.opus', '.flac', '.aiff', '.aif', '.webm', '.wma', '.mp4', '.mov', '.mkv', '.m4v']);

// ---------- args ----------
const argv = process.argv.slice(2);
const flags = new Set();
const opts = {};
const inputs = [];
const VALUE_OPTS = new Set(['out', 'target-mb', 'hard-mb', 'jobs', 'codec', 'max-kbps', 'min-kbps']);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) { inputs.push(a); continue; }
  const name = a.slice(2);
  if (VALUE_OPTS.has(name)) opts[name] = argv[++i];
  else flags.add(name);
}
const die = (msg) => { console.error(`Error: ${msg}`); process.exit(1); };
if (inputs.length === 0) die('give at least one audio file or folder (see the header of scripts/audio-compress.mjs)');

const num = (name, fallback) => {
  if (opts[name] === undefined) return fallback;
  const n = Number(opts[name]);
  if (!Number.isFinite(n) || n <= 0) die(`--${name} must be a positive number`);
  return n;
};
const codec = (opts.codec || 'aac').toLowerCase();
if (!['aac', 'opus', 'mp3'].includes(codec)) die('--codec must be aac, opus or mp3');
const targetBytes = num('target-mb', 18) * MiB;
const hardBytes = num('hard-mb', 19) * MiB;
if (targetBytes > hardBytes) die('--target-mb must not exceed --hard-mb');
const maxKbps = num('max-kbps', 80);
const minKbps = num('min-kbps', { aac: 40, opus: 20, mp3: 40 }[codec]);
if (minKbps > maxKbps) die('--min-kbps must not exceed --max-kbps');
const jobs = Math.max(1, Math.floor(num('jobs', Math.max(1, Math.floor(os.cpus().length * 0.75)))));
const channels = flags.has('stereo') ? 2 : 1;
const PLAN_ONLY = flags.has('plan');
const OVERWRITE = flags.has('overwrite');

// ---------- helpers ----------
function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => resolve({ code: -1, stdout, stderr: String(e.message) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function collect(p, recursive, out) {
  const stat = fs.statSync(p);
  if (stat.isFile()) {
    if (AUDIO_EXT.has(path.extname(p).toLowerCase())) out.push(path.resolve(p));
    return;
  }
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) { if (recursive && entry.name !== 'compressed') collect(full, true, out); }
    else if (AUDIO_EXT.has(path.extname(entry.name).toLowerCase())) out.push(path.resolve(full));
  }
}

async function probe(file) {
  const r = await run('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'format=duration:stream=codec_name', '-of', 'json', file]);
  if (r.code === -1) die('ffprobe not found. Install ffmpeg and make sure ffmpeg/ffprobe are on PATH.');
  if (r.code !== 0) return { error: r.stderr.trim().split('\n').pop() || 'ffprobe failed' };
  try {
    const j = JSON.parse(r.stdout);
    const duration = Number(j.format?.duration);
    if (!j.streams?.length) return { error: 'no audio stream' };
    if (!Number.isFinite(duration) || duration <= 0) return { error: 'unknown duration' };
    return { duration, size: fs.statSync(file).size };
  } catch { return { error: 'could not read ffprobe output' }; }
}

const EXT = { aac: '.m4a', opus: '.ogg', mp3: '.mp3' };

function sampleRateFor(kbps) {
  if (codec === 'opus') return kbps <= 32 ? 24000 : 48000;
  if (codec === 'mp3') return kbps <= 64 ? 24000 : 32000;
  return kbps <= 48 ? 24000 : kbps <= 72 ? 32000 : 44100;
}

// Highest bitrate that fits the budget for `seconds` of audio (2.5% reserved for container overhead).
const fitKbps = (seconds) => Math.floor((targetBytes * 8 * 0.975) / seconds / 1000);

function makePlan(file, info) {
  if (info.size <= hardBytes) return { mode: 'copy' };
  const kbps = fitKbps(info.duration);
  if (kbps >= minKbps) return { mode: 'encode', parts: 1, partSeconds: info.duration, kbps: Math.min(kbps, maxKbps) };
  // Too long to stay clear in one file: equal parts, each at (or above) the minimum bitrate.
  const parts = Math.ceil(info.duration / ((targetBytes * 8 * 0.975) / (minKbps * 1000)));
  const partSeconds = info.duration / parts;
  return { mode: 'encode', parts, partSeconds, kbps: Math.min(Math.max(fitKbps(partSeconds), minKbps), maxKbps) };
}

function encodeArgs(input, output, kbps, start, length) {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y'];
  if (start !== undefined) args.push('-ss', String(start));
  args.push('-i', input);
  if (length !== undefined) args.push('-t', String(length));
  args.push('-vn', '-map', '0:a:0', '-ac', String(channels), '-ar', String(sampleRateFor(kbps)), '-threads', '1');
  if (flags.has('normalize')) args.push('-af', 'dynaudnorm=f=200:g=11');
  if (codec === 'aac') args.push('-c:a', 'aac', '-b:a', `${kbps}k`, '-movflags', '+faststart');
  else if (codec === 'opus') args.push('-c:a', 'libopus', '-b:a', `${kbps}k`, '-application', 'voip', '-vbr', 'on');
  else args.push('-c:a', 'libmp3lame', '-b:a', `${kbps}k`);
  args.push(output);
  return args;
}

const fmtMB = (b) => `${(b / MiB).toFixed(1)} MiB`;
const fmtDur = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60); return `${h ? `${h}h` : ''}${String(m).padStart(h ? 2 : 1, '0')}m${String(sec).padStart(2, '0')}s`; };

// ---------- main ----------
const files = [];
for (const p of inputs) {
  if (!fs.existsSync(p)) die(`not found: ${p}`);
  collect(p, flags.has('recursive'), files);
}
if (files.length === 0) die('no audio files found (looked for ' + [...AUDIO_EXT].join(' ') + ')');
files.sort((a, b) => a.localeCompare(b, 'th'));

const firstInput = path.resolve(inputs[0]);
const outDir = path.resolve(opts.out || path.join(fs.statSync(firstInput).isDirectory() ? firstInput : path.dirname(firstInput), 'compressed'));

console.log(`Files: ${files.length}   codec: ${codec}   channels: ${channels}   budget: ${fmtMB(targetBytes)} (limit ${fmtMB(hardBytes)})   jobs: ${jobs}`);
console.log(`Output: ${outDir}\n`);

// Probe everything in parallel, then plan.
const probed = new Array(files.length);
{
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, files.length) }, async () => {
    while (next < files.length) { const i = next++; probed[i] = await probe(files[i]); }
  }));
}

const tasks = []; // {label, run}
const rows = [];
for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const info = probed[i];
  const name = path.basename(file);
  if (info.error) { rows.push({ name, note: `SKIP (${info.error})` }); continue; }
  const plan = makePlan(file, info);
  const base = path.basename(file, path.extname(file));
  const ext = EXT[codec];
  const row = { name, size: info.size, duration: info.duration, plan, outputs: [] };
  rows.push(row);

  if (plan.mode === 'copy') {
    const dest = path.join(outDir, name);
    row.outputs.push(dest);
    tasks.push({ row, dest, run: async () => {
      if (fs.existsSync(dest) && !OVERWRITE) return { skipped: true };
      fs.mkdirSync(outDir, { recursive: true });
      fs.copyFileSync(file, dest);
      return { bytes: info.size };
    } });
    continue;
  }

  for (let part = 0; part < plan.parts; part++) {
    const suffix = plan.parts > 1 ? `_part${part + 1}of${plan.parts}` : '';
    const dest = path.join(outDir, `${base}${suffix}${ext}`);
    row.outputs.push(dest);
    tasks.push({ row, dest, run: async () => {
      if (fs.existsSync(dest) && !OVERWRITE) return { skipped: true };
      fs.mkdirSync(outDir, { recursive: true });
      const start = plan.parts > 1 ? part * plan.partSeconds : undefined;
      // The last part runs to the end of the file (no -t) so nothing is cut off by rounding.
      const length = plan.parts > 1 && part < plan.parts - 1 ? plan.partSeconds : undefined;
      let kbps = plan.kbps;
      for (let attempt = 0; attempt < 4; attempt++) {
        const r = await run('ffmpeg', encodeArgs(file, dest, kbps, start, length));
        if (r.code !== 0) { fs.rmSync(dest, { force: true }); return { error: r.stderr.trim().split('\n').pop() || 'ffmpeg failed' }; }
        const bytes = fs.statSync(dest).size;
        if (bytes <= hardBytes) return { bytes, kbps };
        kbps = Math.max(8, Math.floor(kbps * 0.9)); // came out too big: retry a little lower
      }
      fs.rmSync(dest, { force: true });
      return { error: 'still above the size limit after 4 attempts; use --target-mb lower or --min-kbps lower' };
    } });
  }
}

// ---------- plan table ----------
for (const row of rows) {
  if (row.note) { console.log(`  ${row.name}\n      ${row.note}`); continue; }
  const p = row.plan;
  const what = p.mode === 'copy'
    ? 'copy as-is (already fits)'
    : `${codec} ${p.kbps} kbps${p.parts > 1 ? `, split into ${p.parts} parts of ~${fmtDur(p.partSeconds)}` : ''}${p.kbps < 40 && codec !== 'opus' ? '  (low: consider --codec opus)' : ''}`;
  console.log(`  ${row.name}\n      ${fmtMB(row.size)}, ${fmtDur(row.duration)}  ->  ${what}`);
}
if (PLAN_ONLY) { console.log('\n--plan: nothing converted.'); process.exit(0); }

// ---------- run (parallel pool) ----------
console.log('');
const started = Date.now();
let done = 0;
let next = 0;
const results = [];
await Promise.all(Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
  while (next < tasks.length) {
    const task = tasks[next++];
    const t0 = Date.now();
    const res = await task.run();
    results.push({ task, res });
    done++;
    const tag = res.error ? `FAILED: ${res.error}` : res.skipped ? 'skipped (exists; use --overwrite)' : `${fmtMB(res.bytes)}${res.kbps ? ` @ ${res.kbps} kbps` : ''}  ${((Date.now() - t0) / 1000).toFixed(1)}s`;
    console.log(`[${done}/${tasks.length}] ${path.basename(task.dest)}  ${tag}`);
  }
}));

const failed = results.filter((r) => r.res.error).length;
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s: ${tasks.length - failed} ok, ${failed} failed. Output: ${outDir}`);
process.exit(failed ? 1 : 0);
