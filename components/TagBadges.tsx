import React from 'react';
import { isTermTag, parseTags } from '@/lib/terms';

// Small pills for a row's tags: the term (sky) and the course code (slate).
export default function TagBadges({ tags, className = '' }: { tags?: string; className?: string }) {
  const list = parseTags(tags);
  if (list.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {list.map((tag) => (
        <span
          key={tag}
          className={`text-[10px] font-bold tracking-wide px-1.5 py-0.5 rounded-md border ${
            isTermTag(tag)
              ? 'bg-sky-50 text-sky-600 border-sky-100'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}
        >
          {tag}
        </span>
      ))}
    </span>
  );
}
