'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

const TABS = [
  {
    href: '/',
    label: 'Kanban',
    hint: 'การบ้าน',
    match: (path: string) => path === '/' || path === '/kanban' || path === '',
  },
  {
    href: '/content',
    label: 'Archive',
    hint: 'คลังเนื้อหา',
    match: (path: string) => path.startsWith('/content') || path.includes('/content'),
  },
] as const;

export default function HeaderNav() {
  const pathname = usePathname();

  return (
    <div className="sticky top-0 z-[1000] w-full border-b border-slate-200/90 bg-white/95 backdrop-blur-md shadow-sm">
      <div className="max-w-2xl mx-auto px-4 py-3 md:py-4">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 mb-2 md:mb-3">
          เลือกหน้า
        </p>
        <nav
          className="relative flex p-1.5 gap-1 rounded-2xl bg-slate-100/90 border border-slate-200/80 shadow-inner"
          aria-label="Main navigation"
        >
          {TABS.map((tab) => {
            const active = tab.match(pathname);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-3 md:py-3.5 px-4 rounded-xl transition-colors z-10 min-h-[3.25rem] ${
                  active ? 'text-sky-700' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="mainNavTab"
                    className="absolute inset-0 bg-white rounded-xl shadow-md border border-slate-200/90 -z-10"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <span className={`text-sm md:text-base tracking-tight ${active ? 'font-bold' : 'font-semibold'}`}>
                  {tab.label}
                </span>
                <span className={`text-[10px] md:text-xs ${active ? 'font-semibold text-sky-600/80' : 'font-medium text-slate-400'}`}>
                  {tab.hint}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
