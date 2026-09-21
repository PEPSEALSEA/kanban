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

  useEffect(() => {
    if (hasFilter) logEvent('search', { metadata: { scope, subject: selectedSubject || 'all', results: resultCount } });
    // Log the filter change only; deliberately do not send the user's search terms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, selectedSubject]);

  const selectSubject = (subject: string) => {
    setSelectedSubject((current) => normalize(current) === normalize(subject) ? '' : subject);
    inputRef.current?.focus();
  };

  return (
    <main className="search-page">
      <section className="search-hero">
        <div className="search-hero-orb search-hero-orb--one" />
        <div className="search-hero-orb search-hero-orb--two" />
        <div className="search-hero-content">
          <p className="search-eyebrow">STUDYFLOW SEARCH</p>
          <h1>ค้นหาให้เจอ<br /><span>แล้วไปต่อทันที</span></h1>
          <p className="search-hero-description">ค้นหาการบ้านและเนื้อหาเรียนในที่เดียว เลือกวิชาก่อนเพื่อให้ผลลัพธ์ตรงขึ้น</p>
          <div className="search-input-wrap">
            <IconSearch className="search-input-icon" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาชื่อเรื่อง, คำสำคัญ หรือรหัส..."
              aria-label="ค้นหาเนื้อหาและการบ้าน"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="ล้างคำค้น"><IconX className="w-4 h-4" /></button>}
          </div>
        </div>
      </section>

      <section className="search-shell">
        <div className="search-controls">
          <div className="search-scope" role="group" aria-label="ขอบเขตการค้นหา">
            {([['all', 'ทั้งหมด'], ['homework', 'การบ้าน'], ['content', 'เนื้อหาเรียน']] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setScope(value)} className={scope === value ? 'is-active' : ''}>{label}</button>
            ))}
          </div>
          {hasFilter && <button className="search-clear" type="button" onClick={() => { setQuery(''); setScope('all'); setSelectedSubject(''); }}>ล้างตัวกรอง</button>}
        </div>

        <div className="search-subject-area">
          <div className="search-subject-heading"><span>วิชาที่กำลังใช้งาน</span><small>เลือกเพื่อกรองผลลัพธ์</small></div>
          <div className="search-chip-row">
            {activeSubjects.length ? activeSubjects.map((subject) => <SubjectChip key={subject} subject={subject} color={selectedColor(subject)} selected={normalize(selectedSubject) === normalize(subject)} onClick={() => selectSubject(subject)} />) : <span className="search-muted">ยังไม่มีวิชาที่ใช้งานอยู่</span>}
          </div>
          {otherSubjects.length > 0 && <>
            <div className="search-subject-heading search-subject-heading--other"><span>วิชาอื่น ๆ</span></div>
            <div className="search-chip-row">
              {otherSubjects.map((subject) => <SubjectChip key={subject} subject={subject} color={selectedColor(subject)} selected={normalize(selectedSubject) === normalize(subject)} onClick={() => selectSubject(subject)} />)}
            </div>
          </>}
        </div>

        <div className="search-results-heading">
          <div><p>ผลลัพธ์{selectedSubject ? ` · ${selectedSubject}` : ''}</p><h2>{isLoading || loadingSubject ? 'กำลังค้นหา…' : hasFilter ? `${resultCount} รายการ` : 'เลือกวิชาหรือเริ่มพิมพ์ค้นหา'}</h2></div>
          {hasFilter && <span className="search-result-note">การบ้านและเนื้อหาเรียน</span>}
        </div>

        {!hasFilter ? <SearchStart /> : (
          <div className="search-result-grid">
            {visibleHomework.map((item: Homework, index) => <ResultCard key={`hw-${item.id}`} item={item} type="homework" color={selectedColor(item.subject)} index={index} />)}
            {visibleContent.map((item, index) => <ResultCard key={`content-${item.id}`} item={item} type="content" color={selectedColor(item.subject)} index={visibleHomework.length + index} />)}
            {!loadingSubject && resultCount === 0 && <div className="search-empty"><IconSearch className="w-9 h-9" /><strong>ไม่พบสิ่งที่คุณกำลังหา</strong><span>ลองเปลี่ยนคำค้น หรือเลือกวิชาอื่นดู</span></div>}
          </div>
        )}
      </section>
    </main>
  );
}

function SubjectChip({ subject, color, selected, onClick }: { subject: string; color: string; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`search-subject-chip${selected ? ' is-selected' : ''}`} style={selected ? { backgroundColor: color, borderColor: color } : subjectBadgeStyle(color, '18')}><span>{subject.slice(0, 1)}</span>{subject}</button>;
}

function SearchStart() {
  return <div className="search-start"><div className="search-start-icon"><IconSearch className="w-7 h-7" /></div><div><strong>เริ่มจากวิชาที่เรียนอยู่</strong><p>เลือกวิชาด้านบน หรือพิมพ์คำที่ต้องการค้นหาได้เลย</p></div></div>;
}

function ResultCard({ item, type, color, index }: { item: Homework | LearningContent; type: 'homework' | 'content'; color: string; index: number }) {
  const href = type === 'homework' ? `/#/view?id=${encodeURIComponent(item.id)}` : `/content#/view?id=${encodeURIComponent(item.id)}`;
  const isHomework = type === 'homework';
  const description = stripMarkup(item.description);
  const date = isHomework ? dateLabel((item as Homework).deadline) : dateLabel((item as LearningContent).date);
  return <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.025, 0.2) }}>
    <Link href={href} className="search-result-card">
      <div className="search-result-icon" style={subjectBadgeStyle(color, '18')}>{isHomework ? <IconKanban className="w-5 h-5" /> : <IconArchive className="w-5 h-5" />}</div>
      <div className="search-result-copy"><div className="search-result-meta"><span style={{ color }}>{item.subject || 'ไม่ระบุวิชา'}</span><i>•</i><span>{isHomework ? 'การบ้าน' : 'เนื้อหาเรียน'}</span><i>•</i><span>{date}</span></div><h3>{item.title || 'ไม่มีชื่อเรื่อง'}</h3>{description && <p>{description}</p>}</div>
      <IconChevronRight className="search-result-arrow" />
    </Link>
  </motion.div>;
}
