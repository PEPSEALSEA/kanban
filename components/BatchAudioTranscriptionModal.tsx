'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useData } from './DataProvider';
import MarkdownRenderer from './MarkdownRenderer';
import { compressAudioIfNeeded } from '@/lib/audio-compressor';
import {
  audioRequest, AudioRequestError, delay, deleteAudioJob, downloadAudioText,
  loadAudioJobs, storeAudioJob, uploadAudio, type AudioJob,
} from '@/lib/audioTranscription';
import {
  ARCHIVE_MAX_BYTES, AUDIO_MAX_BYTES, AUDIO_MIME, AUDIO_MODELS, TEACHING_PROMPT,
  contentParts, dateFromAudioName, splitText, type AudioMetadata, type GeminiAudioFile,
} from '@/shared/audioTranscript';

const control: React.CSSProperties = { width: '100%', padding: '0.6rem', border: '1px solid var(--admin-border)', borderRadius: '0.5rem', background: 'var(--admin-bg-soft)', color: 'var(--admin-text-main)' };
const button: React.CSSProperties = { padding: '0.55rem 0.85rem', borderRadius: '0.5rem', border: '1px solid var(--admin-border)', color: 'var(--admin-text-main)', background: 'var(--admin-bg-soft)', cursor: 'pointer' };

export default function BatchAudioTranscriptionModal({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void | Promise<void> }) {
  const { subjects, user } = useData();
  const [jobs, setJobs] = useState<AudioJob[]>([]);
  const jobsRef = useRef<AudioJob[]>([]);
  const [model, setModel] = useState<string>(AUDIO_MODELS[0].id);
  const [parallel, setParallel] = useState(2);
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const running = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const prepareTail = useRef<Promise<unknown>>(Promise.resolve());
  const uploadTail = useRef<Promise<unknown>>(Promise.resolve());
  const saveTail = useRef<Promise<unknown>>(Promise.resolve());
  const owner = user?.email || '';

  const publish = () => setJobs(jobsRef.current.map(job => ({ ...job })));
  const checkpoint = async (job: AudioJob) => {
    publish();
    try { await storeAudioJob(job); }
    catch { setStorageWarning('พื้นที่เก็บในเบราว์เซอร์ไม่พอ: อย่าปิดหน้านี้จนเสร็จ และดาวน์โหลดข้อความสำรอง'); }
  };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!owner) return;
    const abort = new AbortController();
    let alive = true;
    void (async () => {
      try {
        const restored = await loadAudioJobs(owner);
        if (!alive) return;
        jobsRef.current = restored;
        setJobs(restored);
      } catch { if (alive) setStorageWarning('เบราว์เซอร์นี้เก็บงานเพื่อกลับมาทำต่อไม่ได้ กรุณาเปิดหน้านี้ไว้จนเสร็จ'); }
      try {
        await audioRequest('/config', abort.signal);
        if (alive) setReady(true);
      } catch (error) { if (alive) setNotice(error instanceof Error ? error.message : 'ตรวจสอบระบบไม่สำเร็จ'); }
    })();
    return () => { alive = false; abort.abort(); controller.current?.abort(); };
  }, [owner]);

  useEffect(() => {
    if (!busy) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [busy]);

  const addFiles = async (files: File[]) => {
    setNotice('');
    const errors: string[] = [];
    for (const file of files) {
      if (jobsRef.current.length >= 30) { errors.push('เก็บได้ครั้งละ 30 ไฟล์ กรุณาล้างรายการที่เสร็จแล้วก่อน'); break; }
      if (!AUDIO_MIME[file.name.split('.').pop()?.toLowerCase() || ''] || !file.size || file.size > AUDIO_MAX_BYTES) {
        errors.push(`${file.name}: ต้องเป็นไฟล์เสียงที่รองรับ ขนาด 1 byte–90 MB`); continue;
      }
      if (jobsRef.current.some(job => job.file.name === file.name && job.file.size === file.size && job.file.lastModified === file.lastModified)) {
        errors.push(`${file.name}: มีอยู่ในรายการแล้ว`); continue;
      }
      const inferred = dateFromAudioName(file.name);
      const job: AudioJob = {
        id: crypto.randomUUID(), owner, file, model, subject, isPrivate,
        date: date || inferred.date, dateHint: date ? 'วันที่ที่เลือก' : inferred.inferred ? 'อ่านจากชื่อไฟล์' : 'วันที่อัปโหลด (กรุงเทพฯ)',
        stage: 'รอเริ่ม', progress: 0, formatted: [], sources: [],
      };
      jobsRef.current.push(job);
      await checkpoint(job);
    }
    setNotice(errors.join('\n'));
  };

  const processJob = async (job: AudioJob, signal: AbortSignal) => {
    const stage = (message: string, progress: number) => { job.stage = message; job.progress = progress; publish(); };
    const retry = async <T,>(operation: () => Promise<T>): Promise<T> => {
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        try { return await operation(); }
        catch (error) {
          if (!(error instanceof AudioRequestError) || ![409, 429, 503].includes(error.status) || attempt >= 3) throw error;
          const seconds = error.status === 409 ? 45 : 15 * 2 ** attempt;
          const previous = job.stage;
          stage(`${error.status === 409 ? 'รอยืนยันการบันทึก' : 'รอโควตา/การเชื่อมต่อ'} — ลองใหม่ใน ${seconds} วินาที (${attempt + 1}/3)`, job.progress);
          await delay(seconds * 1000, signal);
          stage(previous, job.progress);
        }
      }
    };
    try {
      job.error = undefined;
      if (!job.transcript && job.uploaded?.file.expirationTime && Date.parse(job.uploaded.file.expirationTime) <= Date.now()) job.needsUpload = true;
      if (!job.uploaded || job.needsUpload) {
        // Serialize decoding to avoid several full audio buffers competing for browser memory.
        const prepare = prepareTail.current.catch(() => undefined).then(async () => {
          signal.throwIfAborted();
          if (!job.prepared) {
            stage('เตรียมเสียง', 2);
            const prepared = await compressAudioIfNeeded(job.file, percent => stage(`เตรียมเสียง ${percent}%`, 2 + percent * 0.08), 18);
            job.prepared = prepared.file;
            await checkpoint(job);
          }
          if (job.prepared.size > ARCHIVE_MAX_BYTES) throw new Error('เสียงยังใหญ่เกิน 19 MB หลังบีบอัด กรุณาแบ่งเป็นไฟล์สั้นลง');
        });
        prepareTail.current = prepare;
        await prepare;
        signal.throwIfAborted();
        stage('รอส่งเสียงเข้าคลัง', 10);
        // Keep large multipart uploads serial; AI requests still run in parallel.
        const upload = uploadTail.current.catch(() => undefined).then(async () => {
          signal.throwIfAborted();
          job.uploaded = await uploadAudio(job.prepared!, signal, percent => stage(percent === 100 ? 'ส่งเสียงครบแล้ว — กำลังเก็บเข้าคลังและเตรียม Gemini' : `อัปโหลด ${percent}%`, 10 + percent * 0.15), job.uploaded?.audio);
          job.needsUpload = false;
        });
        uploadTail.current = upload;
        await upload;
        await checkpoint(job);
      }
      if (!job.transcript) {
        stage('รอ Gemini เตรียมไฟล์', 28);
        let active = false;
        for (let i = 0; i < 90; i++) {
          let result: { file: GeminiAudioFile };
          try { result = await retry(() => audioRequest<{ file: GeminiAudioFile }>(`/file/${job.uploaded!.file.name.split('/')[1]}`, signal)); }
          catch (error) {
            if (error instanceof AudioRequestError && error.status === 400) job.needsUpload = true;
            throw error;
          }
          if (result.file.state === 'ACTIVE') { active = true; break; }
          if (result.file.state === 'FAILED') { job.needsUpload = true; throw new Error('Gemini อ่านไฟล์นี้ไม่ได้ กดทำต่อเพื่ออัปโหลดสำเนาใหม่'); }
          await delay(4000, signal);
        }
        if (!active) throw new Error('Gemini ยังเตรียมไฟล์ไม่เสร็จ ลองทำต่ออีกครั้งภายหลัง');
        stage('ถอดเสียงไทย / English พร้อม timestamp', 32);
        const result = await retry(() => audioRequest<{ transcript: string }>('/transcribe', signal, { model: job.model, file: { name: job.uploaded!.file.name, mimeType: job.uploaded!.file.mimeType } }));
        job.transcript = result.transcript;
        job.chunks = splitText(result.transcript, 14000);
        await checkpoint(job);
      }
      if (!job.markdown) {
        job.chunks ||= splitText(job.transcript, 14000);
        for (let i = job.formatted.length; i < job.chunks.length; i++) {
          stage(`จัดเนื้อหาตาม prompt + ค้นข้อมูลเพิ่มเติม (${i + 1}/${job.chunks.length})`, 48 + 32 * i / job.chunks.length);
          const result = await retry(() => audioRequest<{ markdown: string; sources: AudioJob['sources'] }>('/format', signal, { model: job.model, transcript: job.transcript, focus: job.chunks![i] }));
          job.formatted.push(result.markdown);
          job.sources.push(...result.sources.filter(source => !job.sources.some(existing => existing.uri === source.uri)));
          await checkpoint(job);
        }
        job.markdown = job.formatted.map((part, i) => i === 0 ? part : part.replace(/^# [^\n]+\n/, '')).join('\n\n');
        await checkpoint(job);
      }
      if (!job.metadata) {
        stage('สร้างหัวข้อ คำอธิบาย และเลือกวิชา', 83);
        const result = await retry(() => audioRequest<{ metadata: AudioMetadata }>('/metadata', signal, { model: job.model, markdown: job.markdown, subjects: subjects.map(s => s.name), filename: job.file.name }));
        job.metadata = result.metadata;
        job.cards = contentParts(job.markdown, result.metadata.title);
        await checkpoint(job);
      }
      // Persist stable IDs and exact payload before the first save; retries reuse them.
      job.cards ||= contentParts(job.markdown, job.metadata.title);
      await checkpoint(job);
      const save = saveTail.current.catch(() => undefined).then(async () => {
        for (let i = 0; i < job.cards!.length; i++) {
          if (job.cards![i].id) continue;
          signal.throwIfAborted();
          stage(`สร้าง Content (${i + 1}/${job.cards!.length})`, 90 + 9 * i / job.cards!.length);
          const audio = job.uploaded!.audio;
          const result = await retry(() => audioRequest<{ id: string }>('/save', signal, {
            requestId: `${job.id}-${i}`, date: job.date, subject: job.subject || job.metadata!.subject,
            title: job.cards![i].title, description: job.cards![i].description,
            audio_file_id: audio.fileId, audio_url: `${audio.url}#${encodeURIComponent(audio.filename)}#${audio.fileId}`,
            is_private: job.isPrivate ? '1' : '',
          }));
          job.cards![i].id = result.id;
          await checkpoint(job);
        }
      });
      saveTail.current = save;
      await save;
      job.done = true;
      stage('สร้าง Content แล้ว', 100);
      // Gemini keeps files for 48 hours; cleanup is best effort and cannot undo a saved card.
      if (job.uploaded) await audioRequest(`/file/${job.uploaded.file.name.split('/')[1]}`, signal, undefined, 'DELETE').catch(() => undefined);
      await checkpoint(job);
    } catch (error) {
      job.error = signal.aborted ? undefined : error instanceof Error ? error.message : 'ทำงานไม่สำเร็จ';
      job.stage = signal.aborted ? 'พักไว้ — กดเริ่มเพื่อทำต่อ' : 'ต้องลองใหม่';
      await checkpoint(job);
    }
  };

  const start = async (onlyId?: string) => {
    if (running.current || !ready) return;
    const queue = jobsRef.current.filter(job => !job.done && (!onlyId || job.id === onlyId));
    if (!queue.length) return;
    running.current = true;
    setBusy(true);
    const abort = new AbortController();
    controller.current = abort;
    setNotice('');
    try {
      // Web Locks also prevents a second tab from running the same persisted queue.
      const run = async () => {
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
          while (next < queue.length && !abort.signal.aborted) await processJob(queue[next++], abort.signal);
        }));
      };
      if (navigator.locks) await navigator.locks.request('studyflow-audio-batch', { ifAvailable: true }, async lock => {
        if (!lock) { setNotice('มีอีกแท็บกำลังถอดเสียงอยู่ กรุณาทำต่อในแท็บนั้น'); return; }
        await run();
      });
      else await run();
    } finally {
      running.current = false;
      setBusy(false);
      controller.current = null;
      await onRefresh();
    }
  };

  const remove = async (job: AudioJob) => {
    try {
      await deleteAudioJob(job.id);
      jobsRef.current = jobsRef.current.filter(item => item.id !== job.id);
      publish();
      if (job.uploaded && !job.done) void audioRequest(`/file/${job.uploaded.file.name.split('/')[1]}`, new AbortController().signal, undefined, 'DELETE').catch(() => undefined);
    } catch { setStorageWarning('ล้างรายการในเบราว์เซอร์ไม่สำเร็จ กรุณาลองใหม่'); }
  };
  const complete = jobs.filter(job => job.done).length;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="audio-ai-title" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="admin-card" style={{ width: '100%', maxWidth: 1050, maxHeight: '94vh', overflowY: 'auto', padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
          <div><h2 id="audio-ai-title" style={{ fontSize: '1.4rem', fontWeight: 800 }}>ถอดเสียง → สร้าง Content อัตโนมัติ</h2>
            <p style={{ color: 'var(--admin-text-muted)', marginTop: 6 }}>เสียงไทย / English → เนื้อหาตามลำดับเวลา → หัวข้อ วิชา และวันที่ พร้อมสร้างการ์ด</p></div>
          <button aria-label="ปิดหน้าถอดเสียง" style={{ ...button, flexShrink: 0 }} disabled={busy} onClick={onClose}>ปิด</button>
        </div>
        <p style={{ margin: '1rem 0', fontSize: '0.85rem', color: 'var(--admin-text-muted)' }}>เปิดหน้านี้ไว้ระหว่างทำงาน หากหยุดหรือรีเฟรช กลับมากดเริ่มเพื่อทำต่อจากขั้นตอนที่บันทึกไว้ เปอร์เซ็นต์รวมแสดงขั้นตอนที่เสร็จแล้ว; ขั้น AI แสดงสถานะระหว่างรอ</p>
        <fieldset disabled={busy || !ready} style={{ border: 0, padding: 0, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.8rem' }}>
            <label>โมเดลสำหรับไฟล์ใหม่<select style={control} value={model} onChange={e => setModel(e.target.value)}>{AUDIO_MODELS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label>จำนวนไฟล์พร้อมกัน<select style={control} value={parallel} onChange={e => setParallel(Number(e.target.value))}><option value={1}>1 — ประหยัดโควตา</option><option value={2}>2 — แนะนำ</option><option value={3}>3 — เร็วขึ้นเมื่อโควตาพอ</option></select></label>
            <label>วิชาสำหรับไฟล์ใหม่<select style={control} value={subject} onChange={e => setSubject(e.target.value)}><option value="">AI เลือกอัตโนมัติ</option>{subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}<option value="Other">Other</option></select></label>
            <label>วันที่สำหรับไฟล์ใหม่<input aria-label="วันที่สำหรับไฟล์ใหม่" type="date" style={control} value={date} onChange={e => setDate(e.target.value)} /><small>เว้นว่าง: ชื่อไฟล์ → วันนี้</small></label>
          </div>
          <label style={{ display: 'block', margin: '0.8rem 0' }}><input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} /> สร้างไฟล์ใหม่เป็น Private</label>
          <label style={{ display: 'block', border: '2px dashed var(--admin-border)', borderRadius: '0.75rem', padding: '1.2rem', background: 'var(--admin-bg-soft)' }}>
            <strong>เลือกเสียงหลายไฟล์</strong><p style={{ fontSize: '0.8rem', margin: '0.4rem 0' }}>MP3, M4A, WAV, AAC, OGG, FLAC, AIFF, WebM · สูงสุด 90 MB/ไฟล์ · เตรียมเสียงให้ไม่เกิน 19 MB ก่อนส่ง</p>
            <input aria-label="เลือกเสียงหลายไฟล์" type="file" multiple style={{ maxWidth: '100%' }} accept={Object.keys(AUDIO_MIME).map(ext => `.${ext}`).join(',')} onChange={e => { void addFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
          </label>
        </fieldset>
        <details style={{ margin: '1rem 0', fontSize: '0.85rem' }}><summary>Prompt ที่ใช้จัดเนื้อหา</summary><pre style={{ whiteSpace: 'pre-wrap', padding: '1rem', maxHeight: 280, overflowY: 'auto' }}>{TEACHING_PROMPT}</pre></details>
        {notice && <p role="alert" style={{ whiteSpace: 'pre-wrap', color: '#b45309', margin: '0.8rem 0' }}>{notice}</p>}
        {storageWarning && <p role="alert" style={{ color: '#b45309' }}>{storageWarning}</p>}
        {!ready && !notice && <p>กำลังตรวจสอบระบบและเรียกคืนงาน…</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
          <strong>{jobs.length ? `เสร็จ ${complete}/${jobs.length} ไฟล์` : 'ยังไม่มีไฟล์ — เลือกเสียงเพื่อเริ่ม'}</strong>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {!busy && complete > 0 && <button style={button} onClick={() => { void (async () => { for (const job of jobsRef.current.filter(item => item.done)) await remove(job); })(); }}>ล้างรายการที่เสร็จแล้ว</button>}
            {busy ? <button style={button} onClick={() => { controller.current?.abort(); setNotice('กำลังพักงาน หากกำลังเตรียมเสียง กรุณารอขั้นตอนนั้นจบก่อน'); }}>พักงาน</button>
              : <button className="admin-btn-primary" style={{ opacity: !ready || !jobs.some(job => !job.done) ? 0.5 : 1 }} disabled={!ready || !jobs.some(job => !job.done)} onClick={() => void start()}>{jobs.length > 0 && complete === jobs.length ? 'สร้างครบแล้ว' : 'เริ่ม / ทำต่อ และสร้าง Content'}</button>}
          </div>
        </div>
        <div style={{ display: 'grid', gap: '0.85rem' }}>
          {jobs.map(job => <article key={job.id} style={{ border: '1px solid var(--admin-border)', borderRadius: '0.75rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}><strong style={{ overflowWrap: 'anywhere' }}>{job.metadata?.title || job.file.name}</strong><span>{job.done ? 'เสร็จแล้ว' : `${Math.round(job.progress)}%`}</span></div>
            <small style={{ color: 'var(--admin-text-muted)' }}>{job.file.name} · {(job.file.size / 1024 / 1024).toFixed(1)} MB</small>
            {!job.done && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem', marginTop: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem' }}>วันที่<input type="date" aria-label={`วันที่ ${job.file.name}`} style={control} disabled={busy || !!job.cards} value={job.date} onChange={e => { if (!e.target.value) return; const source = jobsRef.current.find(item => item.id === job.id)!; source.date = e.target.value; source.dateHint = 'กำหนดเอง'; void checkpoint(source); }} /><small>{job.dateHint}</small></label>
              <label style={{ fontSize: '0.8rem' }}>วิชา<select style={control} disabled={busy || !!job.cards} value={job.subject} onChange={e => { const source = jobsRef.current.find(item => item.id === job.id)!; source.subject = e.target.value; void checkpoint(source); }}><option value="">AI เลือกอัตโนมัติ</option>{subjects.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}<option value="Other">Other</option></select></label>
              <label style={{ fontSize: '0.8rem' }}>โมเดล<select style={control} disabled={busy || !!job.cards} value={job.model} onChange={e => { const source = jobsRef.current.find(item => item.id === job.id)!; source.model = e.target.value; void checkpoint(source); }}>{AUDIO_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
              <label style={{ fontSize: '0.8rem' }}>การมองเห็น<select style={control} disabled={busy || !!job.cards} value={job.isPrivate ? 'private' : 'public'} onChange={e => { const source = jobsRef.current.find(item => item.id === job.id)!; source.isPrivate = e.target.value === 'private'; void checkpoint(source); }}><option value="public">ตามสิทธิ์ปกติ</option><option value="private">Private</option></select></label>
            </div>}
            <progress aria-label={`ความคืบหน้า ${job.file.name}`} value={job.progress} max={100} style={{ width: '100%', height: 12, accentColor: 'var(--admin-primary)', marginTop: 12 }} />
            <p role="status" style={{ fontSize: '0.85rem', marginTop: 4 }}>{job.stage}</p>
            {job.error && <p role="alert" style={{ color: '#dc2626', fontSize: '0.85rem', marginTop: 6 }}>{job.error}</p>}
            {job.metadata && <p style={{ marginTop: 8, fontSize: '0.9rem' }}>{job.metadata.summary}<br /><small>{job.subject || job.metadata.subject} · {job.date} · {job.isPrivate ? 'Private' : 'ตามสิทธิ์ปกติ'}</small></p>}
            {job.cards && job.cards.length > 1 && <p style={{ fontSize: '0.8rem' }}>เนื้อหายาว แบ่งเป็น {job.cards.length} การ์ดตามลำดับโดยไม่ตัดข้อความ</p>}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 10 }}>
              {!busy && !job.done && <button style={button} onClick={() => void start(job.id)}>ทำต่อไฟล์นี้</button>}
              {!busy && job.error && job.uploaded && !job.transcript && <button style={button} onClick={() => {
                const source = jobsRef.current.find(item => item.id === job.id)!;
                source.needsUpload = true; source.error = undefined; source.stage = 'รออัปโหลดใหม่'; source.progress = 10;
                void checkpoint(source);
              }}>เตรียมอัปโหลดใหม่</button>}
              {job.markdown && <button style={button} onClick={() => setPreview(preview === job.id ? null : job.id)}>ดูเนื้อหา</button>}
              {job.markdown && <button style={button} onClick={() => downloadAudioText(job.markdown!, `${job.file.name}.md`)}>ดาวน์โหลด Markdown</button>}
              {job.transcript && <button style={button} onClick={() => downloadAudioText(job.transcript!, `${job.file.name}.transcript.txt`)}>ดาวน์โหลด Transcript</button>}
              {job.cards?.filter(card => card.id).map((card, i) => <Link key={card.id} href={`/content#/view?id=${encodeURIComponent(card.id!)}`} target="_blank" style={button}>เปิด Content{job.cards!.length > 1 ? ` ${i + 1}` : ''}</Link>)}
              {!busy && <button style={button} onClick={() => void remove(job)}>ล้างรายการนี้</button>}
            </div>
            {preview === job.id && job.markdown && <div className="markdown-content" style={{ marginTop: 16, padding: 16, background: 'var(--admin-bg-soft)', borderRadius: 8, maxHeight: 450, overflowY: 'auto' }}><MarkdownRenderer content={job.markdown} />{job.sources.length > 0 && <details><summary>แหล่งข้อมูลที่ AI ใช้ตรวจสอบ</summary>{job.sources.map(source => <p key={source.uri}><a href={source.uri} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}</details>}</div>}
          </article>)}
        </div>
        {complete > 0 && <p style={{ marginTop: 16, fontSize: '0.8rem', color: 'var(--admin-text-muted)' }}>การล้างรายการจะลบสำเนางานในเบราว์เซอร์ Content ที่สร้างแล้วจะยังอยู่ในคลัง</p>}
      </div>
    </div>
  );
}
