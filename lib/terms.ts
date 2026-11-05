import { CURRENT_TERM } from '@/lib/config';

// Rows carry `tags` as a comma-separated string, e.g. "1/2569,ว30205" (term tag + course-code tag).
// Subjects carry `term` (e.g. "2/2569") and `code` (course code). Older rows may have neither;
// they are treated as belonging to the current term so nothing disappears before the data is backfilled.

type SubjectLike = { id?: string; name: string; term?: string; code?: string };
type Taggable = { tags?: string };

const TERM_TAG = /^\d{1,2}\/\d{4}$/;

export const normalizeName = (value?: string) => (value || '').trim().toLowerCase();

export function parseTags(raw?: string): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[,\n]/)) {
    const tag = part.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export const isTermTag = (tag: string) => TERM_TAG.test(tag);

export function subjectTerm(subject: SubjectLike): string {
  return (subject.term || '').trim() || CURRENT_TERM;
}

// Newest term first ("2/2569" before "1/2569"), the current term always first.
function compareTerms(a: string, b: string): number {
  if (a === CURRENT_TERM) return -1;
  if (b === CURRENT_TERM) return 1;
  const [ta, ya] = a.split('/').map(Number);
  const [tb, yb] = b.split('/').map(Number);
  return yb - ya || tb - ta;
}

export function listTerms(subjects: SubjectLike[], items: Taggable[] = []): string[] {
  const terms = new Set<string>([CURRENT_TERM]);
  subjects.forEach((s) => terms.add(subjectTerm(s)));
  items.forEach((item) => parseTags(item.tags).filter(isTermTag).forEach((t) => terms.add(t)));
  return Array.from(terms).sort(compareTerms);
}

// Subjects shown in a filter for `term`; 'All' lists each name once.
export function subjectsForTerm<T extends SubjectLike>(subjects: T[], term: string): T[] {
  if (term !== 'All') return subjects.filter((s) => subjectTerm(s) === term);
  const seen = new Set<string>();
  return subjects.filter((s) => {
    const key = normalizeName(s.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const currentTermSubjects = <T extends SubjectLike>(subjects: T[]) => subjectsForTerm(subjects, CURRENT_TERM);

// An item with no term tag at all (legacy) matches every term so it is never hidden by accident.
export function itemInTerm(item: Taggable, term: string): boolean {
  if (!term || term === 'All') return true;
  const tags = parseTags(item.tags).filter(isTermTag);
  return tags.length === 0 || tags.includes(term);
}

export function subjectCode(subjects: SubjectLike[], name: string, term: string): string {
  const key = normalizeName(name);
  return subjects.find((s) => normalizeName(s.name) === key && subjectTerm(s) === term)?.code?.trim() || '';
}
