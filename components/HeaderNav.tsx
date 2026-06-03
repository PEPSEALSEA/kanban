'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function HeaderNav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/' || pathname === '/kanban' || pathname === '';
    return pathname.startsWith(path);
  };

  const linkClass = (active: boolean) =>
    `px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors ${
      active
        ? 'bg-sky-50 text-sky-700 border border-sky-200/80'
        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
    }`;

  return (
    <div className="sticky top-4 z-[1000] flex justify-center w-full mb-8 pointer-events-none">
      <nav className="pointer-events-auto flex gap-1 p-1 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-xl shadow-sm">
        <Link href="/" className={linkClass(isActive('/'))}>
          Kanban
        </Link>
        <Link href="/content" className={linkClass(isActive('/content'))}>
          Archive
        </Link>
      </nav>
    </div>
  );
}
