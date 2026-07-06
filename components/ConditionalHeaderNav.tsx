'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useUiVersion } from '@/components/UiVersionProvider';
import ClassicHeaderNav from '@/components/ui/classic/HeaderNav';

export default function ConditionalHeaderNav() {
  const { isExperimental, isReady } = useUiVersion();
  const pathname = usePathname();

  // Admin pages ship their own dedicated navigation (sidebar / mobile nav),
  // so the global site nav would just duplicate/clash with it.
  if (pathname?.startsWith('/admin')) return null;

  if (!isReady || isExperimental) return null;
  return <ClassicHeaderNav />;
}
