import { API_URL } from './config';
import { authHeaders } from './auth';
import type { AudioMetadata, GeminiAudioFile } from '@/shared/audioTranscript';

export type AudioJob = {
  id: string; owner: string; file: File; date: string; dateHint: string; subject: string;
  model: string; isPrivate: boolean; stage: string; progress: number; error?: string;
  prepared?: File; uploaded?: { file: GeminiAudioFile; audio: { fileId: string; url: string; filename: string } };
  transcript?: string; chunks?: string[]; formatted: string[];
  sources: { uri: string; title: string }[]; markdown?: string; metadata?: AudioMetadata;
  cards?: { title: string; description: string; id?: string }[];
  done?: boolean;
  needsUpload?: boolean;
};

const BASE = `${API_URL}/api/admin/audio`;
export class AudioRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Paused', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Paused', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export async function audioRequest<T>(path: string, signal: AbortSignal, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { ...authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal,
  });
  const data = await response.json().catch(() => ({ error: `การเชื่อมต่อผิดพลาด (${response.status})` }));
  if (!response.ok || data.success === false) throw new AudioRequestError(data.error || 'คำขอไม่สำเร็จ', response.status);
  return data as T;
}

export function uploadAudio(file: File, signal: AbortSignal, onProgress: (percent: number) => void, existingAudio?: NonNullable<AudioJob['uploaded']>['audio']): Promise<NonNullable<AudioJob['uploaded']>> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open('POST', `${BASE}/upload?filename=${encodeURIComponent(file.name)}${existingAudio ? '&temporaryOnly=1' : ''}`);
    for (const [key, value] of Object.entries(authHeaders())) xhr.setRequestHeader(key, value);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.timeout = 5 * 60 * 1000;
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onloadend = () => signal.removeEventListener('abort', abort);
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || !data.success) throw new AudioRequestError(data.error || 'อัปโหลดไม่สำเร็จ', xhr.status);
        resolve({ ...data, audio: existingAudio || data.audio });
      } catch (error) { reject(error); }
    };
    xhr.onerror = () => reject(new Error('เครือข่ายขาดหายระหว่างอัปโหลด'));
    xhr.ontimeout = () => reject(new Error('อัปโหลดใช้เวลานานเกินไป กรุณาลองใหม่'));
    xhr.onabort = () => reject(new DOMException('Paused', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { reject(new DOMException('Paused', 'AbortError')); return; }
    xhr.send(file);
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('studyflow-audio-transcripts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('jobs', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('jobs', mode);
      const req = action(tx.objectStore('jobs'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
export async function loadAudioJobs(owner: string): Promise<AudioJob[]> {
  const jobs = await withStore('readonly', store => store.getAll()) as AudioJob[];
  return jobs.filter(job => job.owner === owner).map(job => ({ ...job, stage: job.done ? 'สร้าง Content แล้ว' : 'พักไว้ — กดเริ่มเพื่อทำต่อ' }));
}
export async function storeAudioJob(job: AudioJob) { await withStore('readwrite', store => store.put(job)); }
export async function deleteAudioJob(id: string) { await withStore('readwrite', store => store.delete(id)); }

export function downloadAudioText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
