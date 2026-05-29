'use client';

import { useEffect, useRef } from 'react';
import { useData } from '@/components/DataProvider';

export default function AnalyticsTracker() {
  const { logEvent } = useData();
  const hasLogged = useRef(false);

  useEffect(() => {
    if (!hasLogged.current && logEvent) {
      logEvent('visit');
      hasLogged.current = true;
    }
  }, [logEvent]);

  return null;
}
