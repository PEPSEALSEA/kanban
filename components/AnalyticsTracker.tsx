'use client';

import { useEffect } from 'react';
import { useData } from '@/components/DataProvider';
import { usePathname, useSearchParams } from 'next/navigation';

export default function AnalyticsTracker() {
  const { logEvent } = useData();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (logEvent) {
      const contentId = searchParams.get('id') || undefined;
      logEvent('visit', { 
        page_visited: window.location.href, 
        content_id: contentId 
      });
    }
  }, [pathname, searchParams, logEvent]);

  return null;
}
