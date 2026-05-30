'use client';

import { useEffect, Suspense } from 'react';
import { useData } from '@/components/DataProvider';
import { usePathname, useSearchParams } from 'next/navigation';

function AnalyticsTrackerInner() {
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

export default function AnalyticsTracker() {
  return (
    <Suspense fallback={null}>
      <AnalyticsTrackerInner />
    </Suspense>
  );
}

