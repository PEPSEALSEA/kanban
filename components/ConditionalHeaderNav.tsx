'use client';

import React from 'react';
import { useUiVersion } from '@/components/UiVersionProvider';
import ClassicHeaderNav from '@/components/ui/classic/HeaderNav';

export default function ConditionalHeaderNav() {
  const { isExperimental, isReady } = useUiVersion();

  if (!isReady || isExperimental) return null;
  return <ClassicHeaderNav />;
}
