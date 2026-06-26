const THAI_DAYS_FULL = [
  'วันอาทิตย์',
  'วันจันทร์',
  'วันอังคาร',
  'วันพุธ',
  'วันพฤหัสบดี',
  'วันศุกร์',
  'วันเสาร์',
] as const;

const THAI_DAYS_NEXT = [
  'วันอาทิตย์หน้า',
  'วันจันทร์หน้า',
  'วันอังคารหน้า',
  'วันพุธหน้า',
  'วันพฤหน้า',
  'วันศุกร์หน้า',
  'วันเสาร์หน้า',
] as const;

const BANGKOK_TZ = 'Asia/Bangkok';

function toBangkokDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: BANGKOK_TZ });
}

function getBangkokWeekday(date: Date): number {
  const key = toBangkokDateKey(date);
  return new Date(`${key}T12:00:00+07:00`).getUTCDay();
}

function diffCalendarDays(date: Date, reference: Date): number {
  const a = new Date(`${toBangkokDateKey(date)}T00:00:00+07:00`).getTime();
  const b = new Date(`${toBangkokDateKey(reference)}T00:00:00+07:00`).getTime();
  return Math.round((a - b) / 86_400_000);
}

export function formatThaiRelativeDayLabel(date: Date, reference: Date = new Date()): string {
  const diff = diffCalendarDays(date, reference);

  if (diff === 0) return 'วันนี้';
  if (diff === 1) return THAI_DAYS_FULL[getBangkokWeekday(date)];
  if (diff === -1) return 'เมื่อวาน';
  if (diff >= 2) return THAI_DAYS_NEXT[getBangkokWeekday(date)];

  return THAI_DAYS_FULL[getBangkokWeekday(date)];
}
