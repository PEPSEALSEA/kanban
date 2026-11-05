// Term rollover for StudyFlow (see docs/TERM_ROLLOVER.md).
//
//   node worker/scripts/term-rollover.mjs                 -> dry-run (reads only, writes a backup + prints the plan)
//   node worker/scripts/term-rollover.mjs --apply         -> writes headers, tags, subject terms/codes, new-term subjects
//   node worker/scripts/term-rollover.mjs --config x.json -> use another config (default: term-2569.json)
//
// What it does (idempotent; rows that already have tags are left alone):
//   1. Adds the new header cells: Subjects E1:F1 (term, code), Homework J1 (tags), LearningContent L1 (tags).
//   2. Merges spelling variants of a subject name (config `aliases`) into one canonical name.
//   3. Tags every untagged Homework / LearningContent row with `backfillTerm` + its course-code tag.
//   4. Sets term + code on the existing Subjects rows (the previous term, so they leave the main filter).
//   5. Appends the new term's subjects (colour copied from the same-name previous subject).
//
// Everything is written with valueInputOption=RAW so "1/2569" stays text (USER_ENTERED turns it into a date).
// A JSON backup of the three tabs is saved under worker/scripts/backups/ (git-ignored) before any write.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JWT } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const configPath = path.resolve(__dirname, args.includes('--config') ? args[args.indexOf('--config') + 1] : 'term-2569.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function loadDevVars() {
  const raw = fs.readFileSync(path.join(root, '.dev.vars'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v.replace(/\\n/g, '\n');
  }
  return env;
}

const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

// alias (normalised) -> canonical name
const canonicalByKey = new Map();
const knownNames = new Set();
for (const term of Object.values(config.terms)) for (const name of Object.keys(term.codes)) knownNames.add(name);
for (const name of knownNames) canonicalByKey.set(norm(name), name);
for (const [canonical, list] of Object.entries(config.aliases || {})) {
  canonicalByKey.set(norm(canonical), canonical);
  for (const alias of list) canonicalByKey.set(norm(alias), canonical);
}
const canonicalName = (raw) => canonicalByKey.get(norm(raw)) ?? String(raw ?? '').trim();

function parseTags(raw) {
  const out = [];
  for (const t of String(raw ?? '').split(/[,\n]/)) {
    const tag = t.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

async function main() {
  const env = loadDevVars();
  const client = new JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await client.getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}`;

  const get = async (range) => {
    const res = await fetch(`${base}/values/${encodeURIComponent(range)}`, { headers: auth });
    if (!res.ok) throw new Error(`GET ${range} failed: ${res.status} ${await res.text()}`);
    return (await res.json()).values || [];
  };
  const batchWrite = async (data) => {
    for (let i = 0; i < data.length; i += 400) {
      const res = await fetch(`${base}/values:batchUpdate`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ valueInputOption: 'RAW', data: data.slice(i, i + 400) }),
      });
      if (!res.ok) throw new Error(`batchUpdate failed: ${res.status} ${await res.text()}`);
    }
  };

  const subjects = await get('Subjects!A1:F');
  const homework = await get('Homework!A1:J');
  const content = await get('LearningContent!A1:L');

  const expectHeader = (rows, sheet) => {
    if (String(rows[0]?.[0] ?? '').trim().toLowerCase() !== 'id') {
      throw new Error(`${sheet}: row 1 is not a header row (run Admin "Fix Sheets" first)`);
    }
  };
  expectHeader(subjects, 'Subjects');
  expectHeader(homework, 'Homework');
  expectHeader(content, 'LearningContent');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${stamp}-term-rollover-backup.json`);
  fs.writeFileSync(backupFile, JSON.stringify({ subjects, homework, content }, null, 2));
  console.log(`Backup saved: ${backupFile}`);

  const writes = []; // {range, values}
  const backfillTerm = config.backfillTerm;
  const backfillCodes = config.terms[backfillTerm]?.codes ?? {};

  // --- header cells ---
  writes.push({ range: 'Subjects!E1:F1', values: [['term', 'code']] });
  writes.push({ range: 'Homework!J1', values: [['tags']] });
  writes.push({ range: 'LearningContent!L1', values: [['tags']] });

  // --- Homework / LearningContent rows ---
  const report = {};
  const renames = {};
  const noCode = {};
  let alreadyTagged = 0;
  const dates = [];

  const processRows = (rows, sheet, subjectCol, tagsCol, dateCol) => {
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i] || [];
      if (!String(row[0] ?? '').trim()) continue;
      const sheetRow = i + 1;
      const rawSubject = String(row[subjectCol] ?? '');
      const subject = canonicalName(rawSubject);
      if (dateCol !== null) dates.push(String(row[dateCol] ?? ''));

      if (subject !== rawSubject.trim() && subject !== rawSubject) {
        const key = `${sheet}: ${rawSubject} -> ${subject}`;
        renames[key] = (renames[key] || 0) + 1;
        writes.push({ range: `${sheet}!${colLetter(subjectCol)}${sheetRow}`, values: [[subject]] });
      }

      const existing = parseTags(row[tagsCol]);
      if (existing.length > 0) { alreadyTagged++; continue; }

      const tags = [backfillTerm];
      const code = backfillCodes[subject];
      if (code) tags.push(code);
      else noCode[`${sheet}: ${subject || '(blank)'}`] = (noCode[`${sheet}: ${subject || '(blank)'}`] || 0) + 1;
      writes.push({ range: `${sheet}!${colLetter(tagsCol)}${sheetRow}`, values: [[tags.join(',')]] });

      const key = `${sheet}: ${subject || '(blank)'} => ${tags.join(',')}`;
      report[key] = (report[key] || 0) + 1;
    }
  };
  const colLetter = (i) => String.fromCharCode(65 + i);
  processRows(homework, 'Homework', 1, 9, null);
  processRows(content, 'LearningContent', 2, 11, 1);

  // --- Subjects: old term gets term+code; new term gets new rows ---
  const subjectRows = subjects.slice(1).filter((r) => String(r[0] ?? '').trim());
  const subjectPlan = [];
  for (let i = 1; i < subjects.length; i++) {
    const row = subjects[i] || [];
    if (!String(row[0] ?? '').trim()) continue;
    const name = canonicalName(row[1]);
    const existingTerm = String(row[4] ?? '').trim();
    if (existingTerm) { subjectPlan.push(`keep ${name} (term ${existingTerm})`); continue; }
    const code = backfillCodes[name] || '';
    writes.push({ range: `Subjects!E${i + 1}:F${i + 1}`, values: [[backfillTerm, code]] });
    subjectPlan.push(`${name}: term ${backfillTerm}${code ? `, code ${code}` : ', (no code)'}`);
  }

  const colorByName = new Map();
  for (const r of subjectRows) colorByName.set(canonicalName(r[1]), String(r[2] ?? ''));
  const existingTermNames = new Set(subjectRows.filter((r) => String(r[4] ?? '').trim()).map((r) => `${String(r[4]).trim()}|${canonicalName(r[1])}`));

  const newSubjectRows = [];
  for (const [term, def] of Object.entries(config.terms)) {
    if (term === backfillTerm) continue;
    let n = 0;
    for (const [name, code] of Object.entries(def.codes)) {
      if (existingTermNames.has(`${term}|${name}`)) continue;
      const color = colorByName.get(name) || `hsl(${(name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 47) % 360}, 75%, 50%)`;
      const id = `${Date.now()}${String(n++).padStart(3, '0')}`;
      newSubjectRows.push([id, name, color, new Date().toISOString(), term, code]);
    }
  }

  // --- report ---
  console.log(`\nMode: ${APPLY ? 'APPLY' : 'DRY-RUN (nothing is written)'}`);
  console.log(`Homework rows: ${homework.length - 1}, LearningContent rows: ${content.length - 1}, already tagged (skipped): ${alreadyTagged}`);
  const sortedDates = dates.filter(Boolean).sort();
  if (sortedDates.length) console.log(`LearningContent date range: ${sortedDates[0]} .. ${sortedDates[sortedDates.length - 1]}`);
  console.log('\nSubject name merges:');
  for (const [k, v] of Object.entries(renames)) console.log(`  ${k}  x${v}`);
  console.log('\nTags to write (sheet: subject => tags  xrows):');
  for (const [k, v] of Object.entries(report).sort()) console.log(`  ${k}  x${v}`);
  console.log('\nRows that get the term tag only (no course code):');
  for (const [k, v] of Object.entries(noCode).sort()) console.log(`  ${k}  x${v}`);
  console.log('\nExisting Subjects rows:');
  for (const line of subjectPlan) console.log(`  ${line}`);
  console.log('\nNew Subjects rows to append:');
  for (const r of newSubjectRows) console.log(`  ${r[4]}  ${r[1]}  ${r[5]}  ${r[2]}`);
  console.log(`\nTotal cell-range writes: ${writes.length}, new subject rows: ${newSubjectRows.length}`);

  if (!APPLY) { console.log('\nRe-run with --apply to write.'); return; }

  await batchWrite(writes);
  if (newSubjectRows.length) {
    const res = await fetch(`${base}/values/${encodeURIComponent('Subjects!A:F')}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: newSubjectRows }),
    });
    if (!res.ok) throw new Error(`append subjects failed: ${res.status} ${await res.text()}`);
  }
  console.log('\nDone. Remember to clear the Worker cache (open Admin or edit any item) and run the content sync.');
}

main().catch((e) => { console.error(e); process.exit(1); });
