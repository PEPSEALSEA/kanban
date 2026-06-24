'use client';

import React, { forwardRef } from 'react';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import type { ParsedContentDescription } from '@/lib/parseContentDescription';

type ContentForExport = {
  date: string;
  subject: string;
  title: string;
};

interface ContentExportPreviewProps {
  content: ContentForExport;
  parsed: ParsedContentDescription;
  subjectColors: Record<string, string>;
  mounted: boolean;
  width: number;
}

const ContentExportPreview = forwardRef<HTMLDivElement, ContentExportPreviewProps>(
  ({ content, parsed, subjectColors, mounted, width }, ref) => {
    const subjectColor = subjectColors[content.subject] || subjectColors.Other || '#94a3b8';

    return (
      <div
        ref={ref}
        className="export-image-root"
        style={{ width: `${width}px` }}
      >
        <div className="flex flex-wrap items-center gap-4 mb-8">
          <span
            className="text-[10px] font-bold uppercase px-3 py-1 rounded-full"
            style={{ backgroundColor: `${subjectColor}15`, color: subjectColor }}
          >
            {content.subject}
          </span>
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {mounted
              ? new Date(content.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })
              : ''}
          </span>
        </div>

        <h1 className="text-3xl font-bold mb-12 tracking-tight text-slate-800 leading-tight">
          {content.title}
        </h1>

        {parsed.intro && (
          <div className="bg-slate-50/50 rounded-2xl border border-slate-100 p-8 leading-relaxed mb-12 text-slate-700">
            <MarkdownRenderer content={parsed.intro} />
          </div>
        )}

        {parsed.cards.length > 0 && (
          <div className="flex flex-col gap-8">
            {parsed.cards.map((card, idx) => (
              <div key={idx} className="split-card">
                <div className="split-number">{card.num}</div>
                <div className="text-lg font-black leading-relaxed">
                  <MarkdownRenderer content={card.text} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
);

ContentExportPreview.displayName = 'ContentExportPreview';

export default ContentExportPreview;
