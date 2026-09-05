export const AUDIO_MODELS = [
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
] as const;

export const AUDIO_MAX_BYTES = 90 * 1024 * 1024;
export const ARCHIVE_MAX_BYTES = 19 * 1024 * 1024;
export const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
  ogg: 'audio/ogg', flac: 'audio/flac', aiff: 'audio/aiff', aif: 'audio/aiff', webm: 'audio/webm',
};

// Kept verbatim as the editorial instruction; pipeline constraints are separate.
export const TEACHING_PROMPT = `คุณคือผู้ถอดเนื้อหาการสอนจาก transcript เสียงครู

## งานของคุณ
ถอดและสรุปเนื้อหาที่ครูพูดตามลำดับเวลาจริง ห้ามข้ามหรือเรียงลำดับใหม่

## รูปแบบ output
- บรรทัดแรกสุดคือ # ชื่อหัวข้อวิชา/บทเรียน (ไม่มีคำนำ ไม่มีคำอธิบายว่านี่คืออะไร)
- ทุก section ต้องมี timestamp กำกับ เช่น [00:00]
- ใช้ Markdown: #, ##, ###, **bold**, > blockquote, table ตามความเหมาะสม
- ไม่ใส่ emoji
- ไม่มีคำเกริ่นนำหรือคำลงท้าย

## เนื้อหาที่ต้องรวม
1. **เนื้อหาหลัก** — อธิบายตามที่ครูพูด ครบถ้วน ไม่ตัดทอน
2. **โจทย์/ตัวอย่าง** — เขียนโจทย์พร้อมวิธีทำทุกข้อที่ครูพูดถึง
3. **สรุป** — ถ้าครูสรุปช่วงไหน ให้สรุปตามนั้นด้วย
4. **เนื้อหาเสริมอัตโนมัติ** — ทุกครั้งที่ครูกล่าวถึงสิ่งต่อไปนี้โดยไม่ได้อธิบายในคลิป ให้คุณหาข้อมูลและเขียนอธิบายเพิ่มเองทันที:
   - คำศัพท์หรือคำเฉพาะทาง → ให้นิยามและยกตัวอย่าง
   - สูตรหรือกฎ → ให้อธิบายว่าใช้ยังไงและยกตัวอย่างการใช้
   - แนวคิดหรือหลักการ → ให้อธิบายความหมายและบอกว่าเกี่ยวข้องกับบทเรียนอย่างไร
   - ชื่อบุคคล ทฤษฎี หรือเหตุการณ์ → ให้บอกว่าคือใคร/คืออะไรโดยย่อ
   - คำถามที่ครูทิ้งไว้หรือตั้งให้คิด → ให้ตอบคำถามนั้นด้วย
   เขียนส่วนเสริมในบล็อก > [เพิ่มเติม] ต่อท้ายจุดนั้นเสมอ เพื่อแยกให้ชัดว่าส่วนไหนครูพูด ส่วนไหน AI เสริม
   ห้ามเพิ่มในกรณีที่ครูอธิบายครบแล้วในคลิป

## สิ่งที่ห้ามทำ
- ห้ามข้ามเนื้อหา
- ห้ามเรียบเรียงใหม่จนเสียลำดับการสอน
- ห้ามเพิ่มเนื้อหาที่ครูไม่ได้พูดถึงเลย (เสริมได้เฉพาะสิ่งที่ครูกล่าวถึงแต่ไม่ได้อธิบาย)
- ห้ามเขียนว่า "นี่คือการสรุปจาก transcript" หรือประโยคเกริ่นใดๆ

## Note
- อาจจะมีบางเนื้อหาที่คุณครูพูดเล่น หรือว่าบางเนื้อหาที่มันอาจจะไม่ได้เกี่ยวกับเนื้อหา มันเป็นการส่อเสียด เราก็เอาออกให้หน่อยนะ เขาแค่พูดกันเล่น ๆ`;

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function bangkokDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function dateFromAudioName(name: string, fallback = bangkokDate()): { date: string; inferred: boolean } {
  const match = name.match(/(?:^|\D)(\d{4})[-_](\d{1,2})[-_](\d{1,2})(?:\D|$)/);
  const local = match ? null : name.match(/(?:^|\D)(\d{1,2})[-_](\d{1,2})[-_](\d{2,4})(?:\D|$)/);
  if (!match && !local) return { date: fallback, inferred: false };
  const [y, m, d] = match ? [match[1], match[2], match[3]] : [local![3], local![2], local![1]];
  let year = Number(y);
  if (y.length === 2) year += year >= 43 ? 2500 : 2000;
  if (year > 2400) year -= 543;
  const date = `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return validDate(date) ? { date, inferred: true } : { date: fallback, inferred: false };
}

/** Lossless boundaries: concatenating chunks always reproduces the input. */
export function splitText(text: string, limit: number): string[] {
  const parts: string[] = [];
  while (text.length > limit) {
    let at = text.lastIndexOf('\n', limit);
    if (at < limit / 2) at = limit;
    else at += 1;
    // Never split a UTF-16 surrogate pair.
    if (/[\uD800-\uDBFF]/.test(text[at - 1])) at -= 1;
    parts.push(text.slice(0, at));
    text = text.slice(at);
  }
  if (text) parts.push(text);
  return parts;
}

export type AudioMetadata = { title: string; summary: string; subject: string };
export type GeminiAudioFile = { name: string; uri: string; mimeType: string; state?: string; expirationTime?: string };

export function validateTeachingText(text: string): string {
  const clean = text.trim().replace(/^```(?:markdown)?\s*\n/, '').replace(/\n```$/, '').trim();
  if (!/^# [^\n]+\n/.test(clean) || !/\[\d{2,}:\d{2}(?::\d{2})?\]/.test(clean)) {
    throw new Error('AI ไม่ได้ส่งเนื้อหาพร้อมหัวข้อและเวลา กรุณาลองขั้นตอนนี้ใหม่');
  }
  const sections = clean.split('\n').filter(line => /^#{2,3} /.test(line));
  if (sections.some(line => !/\[\d{2,}:\d{2}(?::\d{2})?\]/.test(line))) {
    throw new Error('บางหัวข้อไม่มี timestamp กรุณาลองจัดเนื้อหาใหม่');
  }
  return clean;
}

export function contentParts(markdown: string, title: string): { title: string; description: string }[] {
  if (markdown.length <= 48000) return [{ title, description: markdown }];
  const heading = markdown.split('\n')[0];
  const body = markdown.slice(heading.length + 1);
  // Prefer complete sections so tables, blockquotes and equations remain together.
  const sections = body.split(/(?=^## )/m);
  const chunks: string[] = [];
  let current = '';
  for (const section of sections) {
    for (const piece of splitText(section, 46000)) {
      if (current.length + piece.length > 46000) { chunks.push(current); current = ''; }
      current += piece;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((part, i) => ({
    title: `${title} (${i + 1}/${chunks.length})`,
    description: `${heading} (${i + 1}/${chunks.length})\n${part}`,
  }));
}
