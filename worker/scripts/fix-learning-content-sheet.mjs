import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JWT } from 'google-auth-library';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadDevVars() {
  const raw = fs.readFileSync(path.join(root, '.dev.vars'), 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v.replace(/\\n/g, '\n');
  }
  return env;
}

function columnLetter(index1Based) {
  let n = index1Based;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const HEADERS = [
  'id', 'date', 'subject', 'title', 'description', 'audio_file_id', 'audio_url',
  'attachments', 'links', 'is_private', 'created_at',
];
const SHEET = 'LearningContent';

async function main() {
  const env = loadDevVars();
  const client = new JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const token = await client.getAccessToken();
  const accessToken = token.token;
  const ssId = env.SPREADSHEET_ID;
  const auth = { Authorization: `Bearer ${accessToken}` };

  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${ssId}?fields=sheets.properties`,
    { headers: auth }
  );
  const meta = await metaRes.json();
  const sheet = meta.sheets?.find((s) => s.properties?.title === SHEET);
  if (!sheet) throw new Error(`Sheet ${SHEET} not found`);
  const sheetId = sheet.properties.sheetId;

  const endCol = columnLetter(HEADERS.length);
  const firstRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${SHEET}!A1:${endCol}1`)}`,
    { headers: auth }
  );
  const firstJson = await firstRes.json();
  const first = firstJson.values?.[0] || [];
  const hasHeader = String(first[0] || '').trim().toLowerCase() === 'id';
  const hasData = first.some((c) => String(c || '').trim() !== '');

  if (!hasHeader && hasData) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${ssId}:batchUpdate`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          insertDimension: {
            range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            inheritFromBefore: false,
          },
        }],
      }),
    });
    console.log('Inserted header row (row 1 was data)');
  }

  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${SHEET}!A1:${endCol}1`)}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [HEADERS] }),
    }
  );
  console.log('Headers written:', HEADERS.join(', '));

  const wideEnd = columnLetter(26);
  const dataRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${SHEET}!A2:${wideEnd}`)}`,
    { headers: auth }
  );
  const dataJson = await dataRes.json();
  const rows = dataJson.values || [];
  let repaired = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const sheetRow = i + 2;
    if (String(row[0] || '').trim().startsWith('LC-')) continue;
    let idCol = -1;
    for (let c = 1; c < row.length; c++) {
      if (String(row[c] || '').trim().startsWith('LC-')) {
        idCol = c;
        break;
      }
    }
    if (idCol < 0) continue;
    const shifted = row.slice(idCol);
    const clearWidth = Math.max(row.length, HEADERS.length + idCol, 26);
    const fixed = Array.from({ length: clearWidth }, (_, idx) =>
      idx < HEADERS.length && shifted[idx] !== undefined ? shifted[idx] : ''
    );
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${ssId}/values/${encodeURIComponent(`${SHEET}!A${sheetRow}:${columnLetter(clearWidth)}${sheetRow}`)}?valueInputOption=USER_ENTERED`,
      {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [fixed] }),
      }
    );
    repaired++;
    console.log(`Repaired row ${sheetRow}: shifted left from col ${columnLetter(idCol + 1)}`);
  }

  console.log(`Done. Repaired ${repaired} shifted row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
