'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useData } from '@/components/DataProvider';
import { API_URL } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { subjectBadgeStyle } from '@/lib/colors';
import { IconArchive, IconChevronRight, IconKanban, IconSearch, IconX } from '@/components/icons';

type SearchScope = 'all' | 'homework' | 'content';

type LearningContent = {
  id: string;
  date: string;
  subject: string;
  title: string;
  description: string;
};

type Homework = {
  id: string;
  subject: string;
  title: string;
  description: string;
  deadline: string;
  note: string;
};

const normalize = (value?: string) => (value || '').toLocaleLowerCase('th-TH').trim();
const stripMarkup = (value?: string) => (value || '')
  .replace(/[#*_>`~]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function dateLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function SearchPage() {
  const { allHomework, learningContent, subjects, isLoading, logEvent } = useData();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [subjectContent, setSubjectContent] = useState<LearningContent[] | null>(null);
  const [loadingSubject, setLoadingSubject] = useState(false);
  const [visibleCount, setVisibleCount] = useState(16);
  const inputRef = useRef<HTMLInputElement>(null);

  const subjectNames = useMemo(() => {
    const names = new Map<string, string>();
    subjects.forEach((subject) => subject.name && names.set(normalize(subject.name), subject.name));
    allHomework.forEach((item) => item.subject && names.set(normalize(item.subject), item.subject));
    learningContent.forEach((item) => item.subject && names.set(normalize(item.subject), item.subject));
    return Array.from(names.values()).sort((a, b) => a.localeCompare(b, 'th'));
  }, [subjects, allHomework, learningContent]);

  const activeSubjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const names = new Set<string>();
    allHomework.forEach((item) => {
      const deadline = new Date(item.deadline);
      if (item.subject && !Number.isNaN(deadline.getTime()) && deadline >= today) names.add(item.subject);
    });
    learningContent
      .filter((item) => item.subject)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 12)
      .forEach((item) => names.add(item.subject));
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'th'));
  }, [allHomework, learningContent]);

  const otherSubjects = useMemo(
    () => subjectNames.filter((name) => !activeSubjects.some((active) => normalize(active) === normalize(name))),
    [subjectNames, activeSubjects],
  );

  const selectedColor = useCallback((name: string) => {
    return subjects.find((subject) => normalize(subject.name) === normalize(name))?.color || '#0ea5e9';
  }, [subjects]);

  useEffect(() => {
    if (!selectedSubject) {
      setSubjectContent(null);
      return;
    }
    let cancelled = false;
    setSubjectContent(null);
    setLoadingSubject(true);
    void fetch(`${API_URL}?action=learningContent&subject=${encodeURIComponent(selectedSubject)}`, { headers: authHeaders() })
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) setSubjectContent(Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => {
        if (!cancelled) setSubjectContent(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSubject(false);
      });
    return () => { cancelled = true; };
  }, [selectedSubject]);

  const contentPool = subjectContent || learningContent;
  const term = normalize(query);
  const matches = useCallback((values: Array<string | undefined>) => !term || values.some((value) => normalize(value).includes(term)), [term]);

  const homeworkResults = useMemo(() => allHomework
    .filter((item: Homework) => (!selectedSubject || normalize(item.subject) === normalize(selectedSubject)) && matches([item.id, item.title, item.subject, item.description, item.note]))
    .sort((a: Homework, b: Homework) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()), [allHomework, selectedSubject, matches]);

  const contentResults = useMemo(() => contentPool
    .filter((item) => (!selectedSubject || normalize(item.subject) === normalize(selectedSubject)) && matches([item.id, item.title, item.subject, item.description]))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()), [contentPool, selectedSubject, matches]);

  const visibleHomework = scope === 'content' ? [] : homeworkResults;
  const visibleContent = scope === 'homework' ? [] : contentResults;
  const resultCount = visibleHomework.length + visibleContent.length;
  const hasFilter = Boolean(term || selectedSubject || scope !== 'all');
  const resultItems = useMemo(() => [
    ...visibleHomework.map((item) => ({ item, type: 'homework' as const })),
    ...visibleContent.map((item) => ({ item, type: 'content' as const })),
  ].sort((a, b) => {
    const dateA = a.type === 'homework' ? a.item.deadline : a.item.date;
    const dateB = b.type === 'homework' ? b.item.deadline : b.item.date;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  }), [visibleHomework, visibleContent]);

  useEffect(() => { setVisibleCount(16); }, [query, selectedSubject, scope]);

  useEffect(() => {
    if (hasFilter) logEvent('search', { metadata: { scope, subject: selectedSubject || 'all', results: resultCount } });
    // Log the filter change only; deliberately do not send the user's search terms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedSubject]);

  const selectSubject = (subject: string) => {
    setSelectedSubject((current) => normalize(current) === normalize(subject) ? '' : subject);
  };

  return (
    <main className="search-page">
      <section className="search-shell">
        <header className="search-heading">
          <div>
            <h1>Search</h1>
            <p>ค้นหาการบ้านและคลังเนื้อหาการเรียน</p>
          </div>
          <span className="search-heading-icon"><IconSearch className="w-5 h-5" /></span>
        </header>

        <div className="search-toolbar">
          <div className="search-input-wrap">
            <IconSearch className="search-input-icon" />
            <input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาชื่อเรื่อง คำสำคัญ หรือรหัส..." aria-label="ค้นหาเนื้อหาและการบ้าน" />
            {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="ล้างคำค้น"><IconX className="w-4 h-4" /></button>}
          </div>
          <div className="search-scope" role="group" aria-label="ขอบเขตการค้นหา">
            {([['all', 'ทั้งหมด'], ['homework', 'การบ้าน'], ['content', 'เนื้อหา']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setScope(value)} className={scope === value ? 'is-active' : ''} aria-pressed={scope === value}>{label}</button>
            ))}
          </div>
        </div>

        <div className="search-workspace">
          <aside className="search-filter-panel" aria-label="กรองตามวิชา">
            <div className="search-filter-header"><span>รายวิชา</span>{selectedSubject && <button type="button" onClick={() => setSelectedSubject('')}>ล้าง</button>}</div>
            <button type="button" className={`search-subject-option search-subject-option--all${!selectedSubject ? ' is-selected' : ''}`} onClick={() => setSelectedSubject('')} aria-pressed={!selectedSubject}>
              <span className="search-option-icon"><IconArchive className="w-4 h-4" /></span><span>ทุกวิชา</span>
            </button>
            <div className="search-filter-label">วิชาที่กำลังใช้งาน</div>
            <div className="search-subject-list">
              {activeSubjects.length ? activeSubjects.map((subject) => <SubjectOption key={subject} subject={subject} color={selectedColor(subject)} selected={normalize(selectedSubject) === normalize(subject)} onClick={() => selectSubject(subject)} />) : <span className="search-muted">ยังไม่มีวิชาที่ใช้งานอยู่</span>}
            </div>
            {otherSubjects.length > 0 && <>
              <div className="search-filter-label search-filter-label--other">วิชาอื่น ๆ</div>
              <div className="search-subject-list">{otherSubjects.map((subject) => <SubjectOption key={subject} subject={subject} color={selectedColor(subject)} selected={normalize(selectedSubject) === normalize(subject)} onClick={() => selectSubject(subject)} />)}</div>
            </>}
          </aside>

          <section className="search-results" aria-label="ผลการค้นหา">
            <div className="search-results-heading">
              <div><p>{hasFilter ? 'ผลการค้นหา' : 'รายการทั้งหมด'}</p><h2>{isLoading || loadingSubject ? 'กำลังค้นหา…' : `${resultCount} รายการ`}</h2></div>
              {hasFilter && <button className="search-clear" type="button" onClick={() => { setQuery(''); setScope('all'); setSelectedSubject(''); }}>ล้างตัวกรอง</button>}
            </div>
            {selectedSubject && <div className="search-active-filter">วิชา: {selectedSubject}<button type="button" onClick={() => setSelectedSubject('')} aria-label="ล้างวิชาที่เลือก"><IconX className="w-3 h-3" /></button></div>}
            <div className="search-result-grid">
              {resultItems.slice(0, visibleCount).map(({ item, type }, index) => <ResultCard key={`${type}-${item.id}`} item={item} type={type} color={selectedColor(item.subject)} index={index} />)}
              {!isLoading && !loadingSubject && resultCount === 0 && <div className="search-empty"><IconSearch className="w-8 h-8" /><strong>ไม่พบสิ่งที่คุณกำลังหา</strong><span>ลองเปลี่ยนคำค้นหรือเลือกวิชาอื่น</span></div>}
            </div>
            {resultCount > visibleCount && <button className="search-more" type="button" onClick={() => setVisibleCount((count) => count + 20)}>ดูเพิ่มเติม ({resultCount - visibleCount})</button>}
          </section>
        </div>
      </section>
    </main>
  );
}

function SubjectOption({ subject, color, selected, onClick }: { subject: string; color: string; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`search-subject-option${selected ? ' is-selected' : ''}`} aria-pressed={selected}><span className="search-option-dot" style={{ backgroundColor: color }} /><span>{subject}</span><IconChevronRight className="search-option-chevron" /></button>;
}

function ResultCard({ item, type, color, index }: { item: Homework | LearningContent; type: 'homework' | 'content'; color: string; index: number }) {
  const href = type === 'homework' ? `/#/view?id=${encodeURIComponent(item.id)}` : `/content#/view?id=${encodeURIComponent(item.id)}`;
  const isHomework = type === 'homework';
  const description = stripMarkup(item.description);
  const date = isHomework ? dateLabel((item as Homework).deadline) : dateLabel((item as LearningContent).date);
  return <motion.div className="search-result-item" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.2) }}>
    <Link href={href} className="search-result-card">
      <div className="search-result-icon" style={subjectBadgeStyle(color, '20')}>{isHomework ? <IconKanban className="w-5 h-5" /> : <IconArchive className="w-5 h-5" />}</div>
      <div className="search-result-copy"><div className="search-result-meta"><span style={{ color }}>{item.subject || 'ไม่ระบุวิชา'}</span><i>•</i><span>{isHomework ? 'การบ้าน' : 'เนื้อหาเรียน'}</span><i>•</i><span>{date}</span></div><h3>{item.title || 'ไม่มีชื่อเรื่อง'}</h3>{description && <p>{description}</p>}</div>
      <IconChevronRight className="search-result-arrow" />
    </Link>
  </motion.div>;
}
