import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';
import worker from '../src/index';
import { audioTranscriptionRoutes, completedGeneration } from '../src/audioTranscription';
import { contentParts, dateFromAudioName, splitText, validDate, validateTeachingText } from '../../shared/audioTranscript';

const golden = '# แรงและกฎของนิวตัน\n\n## [00:00] แรงลัพธ์\nครูอธิบาย **F = ma** โดย force คือแรง\n\n## [00:20] ตัวอย่าง\nมวล 2 kg ความเร่ง 3 m/s² ดังนั้น F = 6 N\n\n> [เพิ่มเติม] หน่วยนิวตันคือ kg·m/s²\n';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('complete chronological content', () => {
  it('reads Thai Buddhist and ISO dates, rejects impossible dates, and retains explicit fallback', () => {
    expect(dateFromAudioName('05-09-69 Physics.mp3', '2026-01-01')).toEqual({ date: '2026-09-05', inferred: true });
    expect(dateFromAudioName('2026-09-05 lesson.wav').date).toBe('2026-09-05');
    expect(dateFromAudioName('31-02-2569 lesson.mp3', '2026-09-05')).toEqual({ date: '2026-09-05', inferred: false });
    expect(validDate('2026-02-29')).toBe(false);
  });
  it('splits without loss, duplication, or broken surrogate pairs', () => {
    const transcript = ('[00:01] ครูพูด force แรง 🚀\n').repeat(1500);
    const chunks = splitText(transcript, 14000);
    expect(chunks.join('')).toBe(transcript);
    expect(chunks.every(chunk => chunk.length <= 14000)).toBe(true);
    expect(chunks.some(chunk => /^[\uDC00-\uDFFF]/.test(chunk))).toBe(false);
  });
  it('preserves all long lesson sections across Sheets-sized cards', () => {
    const sections = Array.from({ length: 100 }, (_, i) => `## [${String(i).padStart(2, '0')}:00] ช่วงที่ ${i}\n${'เนื้อหา '.repeat(150)}\n`).join('');
    const cards = contentParts(`# ฟิสิกส์\n${sections}`, 'ฟิสิกส์');
    expect(cards.length).toBeGreaterThan(1);
    expect(cards.every(card => card.description.length < 49000)).toBe(true);
    expect(cards.map(card => card.description.slice(card.description.indexOf('\n') + 1)).join('')).toBe(sections);
  });
  it('accepts the expected lesson and rejects missing section timestamps', () => {
    expect(validateTeachingText(golden)).toBe(golden.trim());
    expect(() => validateTeachingText(golden + '\n## ไม่มีเวลา\nอื่น ๆ')).toThrow(/timestamp/);
  });
  it('refuses truncated, blocked, and empty model output; excludes thinking', () => {
    expect(() => completedGeneration({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: golden }] } }] })).toThrow(/ขีดจำกัด/);
    expect(() => completedGeneration({ candidates: [{ finishReason: 'SAFETY' }] })).toThrow();
    expect(() => completedGeneration({ candidates: [{ finishReason: 'STOP', content: { parts: [] } }] })).toThrow();
    expect(completedGeneration({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'thinking' }, { text: golden }] } }] }).text).toBe(golden.trim());
  });
});

describe('audio API boundaries', () => {
  it('requires authentication for every operation, including save and config', async () => {
    for (const [path, method] of [['config', 'GET'], ['upload', 'POST'], ['transcribe', 'POST'], ['format', 'POST'], ['metadata', 'POST'], ['save', 'POST'], ['file/abc', 'DELETE']]) {
      const response = await worker.fetch(new Request(`http://localhost/api/admin/audio/${path}`, { method }), {}, {});
      expect(response.status).toBe(401);
    }
  });
  it('uses search for teaching, and keeps metadata generation separate', async () => {
    const calls: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: body.generationConfig.responseMimeType ? JSON.stringify({ title: 'แรง', summary: 'การคำนวณแรงลัพธ์', subject: 'Invented subject' }) : golden }] } }] });
    }));
    const api = audioTranscriptionRoutes();
    const env = { GEMINI_API_KEY: 'test-key', TELEGRAM_BOT_TOKEN: 'test-bot', TELEGRAM_CHAT_ID: 'test-chat', DB: {} };
    const format = await api.request('/format', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gemini-2.5-flash', transcript: '[00:00] F = ma', focus: '[00:00] F = ma' }) }, env);
    expect(format.status).toBe(200);
    expect(calls[0].tools).toEqual([{ google_search: {} }]);
    const meta = await api.request('/metadata', { method: 'POST', body: JSON.stringify({ model: 'gemini-2.5-flash', markdown: golden, subjects: ['Physics'], filename: 'lesson.mp3' }) }, env);
    expect((await meta.json()).metadata.subject).toBe('Other');
    expect(calls[1].tools).toBeUndefined();
  });
  it('rejects unsupported models before making a provider call', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const response = await audioTranscriptionRoutes().request('/transcribe', { method: 'POST', body: JSON.stringify({ model: 'arbitrary-model', file: { name: 'files/abc', mimeType: 'audio/mpeg' } }) }, { GEMINI_API_KEY: 'test', TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: 'test', DB: {} });
    expect(response.status).toBe(400); expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('concurrent and ambiguous content saves (real SQLite journal, mocked Sheets)', () => {
  let token: string;
  let jwk: JsonWebKey;
  beforeAll(async () => {
    const key = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    jwk = await crypto.subtle.exportKey('jwk', key.publicKey);
    const encode = (data: unknown) => Buffer.from(JSON.stringify(data)).toString('base64url');
    const payload = `${encode({ alg: 'RS256', kid: 'audio-test' })}.${encode({ aud: 'test-client', iss: 'https://accounts.google.com', email: 'pepsealsea@gmail.com', exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    token = `${payload}.${Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key.privateKey, new TextEncoder().encode(payload))).toString('base64url')}`;
  });
  it('appends separate IDs in parallel and reconciles a lost response without appending twice', async () => {
    const sql = new DatabaseSync(':memory:');
    sql.exec(readFileSync(new URL('../migrations/0001_content_cache.sql', import.meta.url), 'utf8'));
    sql.exec(readFileSync(new URL('../migrations/0002_learning_content_hash.sql', import.meta.url), 'utf8'));
    const db = {
      prepare(query: string) {
        let args: (string | number | null)[] = [];
        return {
          bind(...values: typeof args) { args = values; return this; },
          async run() { const result = sql.prepare(query).run(...args); return { success: true, meta: { changes: Number(result.changes) }, results: [] }; },
          async first() { return sql.prepare(query).get(...args) || null; },
          async all() { return { results: sql.prepare(query).all(...args), success: true }; },
        };
      },
      async batch(statements: { run(): Promise<unknown> }[]) { return Promise.all(statements.map(statement => statement.run())); },
    };
    const rows: string[][] = [];
    let loseResponse = false;
    vi.spyOn(JWT.prototype, 'authorize').mockResolvedValue({ access_token: 'test-access-token' });
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      if (String(url).includes('/oauth2/v3/certs')) return Response.json({ keys: [{ ...jwk, kid: 'audio-test' }] });
      if (String(url).includes(':append')) {
        expect(String(url)).toContain('valueInputOption=RAW');
        expect(decodeURIComponent(String(url))).toContain('LearningContent!A:A');
        rows.push(JSON.parse(init.body).values[0]);
        if (loseResponse) { loseResponse = false; throw new Error('connection lost after append'); }
        return Response.json({ updates: { updatedRows: 1 } });
      }
      if (String(url).includes('sheets.googleapis.com')) return Response.json({ values: [['id'], ...rows.map(row => [row[0]])] });
      throw new Error('Unexpected external request');
    }));
    const env = { DB: db, SPREADSHEET_ID: 'test-sheet', GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_EMAIL: 'test', GOOGLE_PRIVATE_KEY: 'test' };
    const pending: Promise<unknown>[] = [];
    const context = { waitUntil(promise: Promise<unknown>) { pending.push(promise); } };
    const body = (id: string) => ({ requestId: `${id}-0`, date: '2026-09-05', subject: 'Physics', title: '=Literal title', description: golden, audio_file_id: 'audio-test', audio_url: 'https://example.com/audio', is_private: '' });
    const save = (payload: ReturnType<typeof body>) => worker.fetch(new Request('http://localhost/api/admin/audio/save', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env, context);
    const first = body(crypto.randomUUID()), second = body(crypto.randomUUID());
    const results = await Promise.all([save(first), save(second)]);
    expect(results.map(result => result.status)).toEqual([200, 200]);
    expect(new Set(rows.map(row => row[0])).size).toBe(2);
    const third = body(crypto.randomUUID());
    loseResponse = true;
    expect((await save(third)).status).toBe(503);
    expect((await save(third)).status).toBe(409);
    sql.prepare('UPDATE audio_content_saves SET lease_until = 0 WHERE request_id = ?').run(third.requestId);
    expect((await save(third)).status).toBe(200);
    expect((await save(third)).status).toBe(200);
    expect(rows.length).toBe(3);
    expect((await save({ ...third, title: 'Changed payload' })).status).toBe(409);
    await Promise.allSettled(pending);
    sql.close();
  });
});
