'use client';

import { useEffect, useRef, Suspense } from 'react';
import { useData } from '@/components/DataProvider';
import { usePathname, useSearchParams } from 'next/navigation';
import { getOrCreateSessionId, getSessionDurationSec } from '@/lib/analytics';

const SCROLL_MILESTONES = [25, 50, 75, 100];
const SCROLL_THROTTLE_MS = 2500;

function AnalyticsTrackerInner() {
  const { logEvent } = useData();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sessionStarted = useRef(false);
  const milestonesHit = useRef<Set<number>>(new Set());
  const maxScrollPercent = useRef(0);
  const maxEstimatedLine = useRef(0);
  const lastScrollLog = useRef(0);

  const getContentId = () => {
    if (typeof window === 'undefined') return searchParams.get('id') || undefined;
    const hash = window.location.hash;
    if (hash.startsWith('#/view')) {
      const params = new URLSearchParams(hash.split('?')[1]);
      return params.get('id') || undefined;
    }
    return searchParams.get('id') || undefined;
  };

  const send = (eventType: string, metadata?: Record<string, string | number | boolean | null | undefined>) => {
    if (!logEvent) return;
    const contentId = getContentId();
    logEvent(eventType, {
      page_visited: typeof window !== 'undefined' ? window.location.href : '',
      content_id: contentId,
      session_id: getOrCreateSessionId(),
      metadata: {
        page: pathname,
        ...metadata,
      },
    });
  };

  // Session start (once per tab)
  useEffect(() => {
    if (sessionStarted.current) return;
    sessionStarted.current = true;
    getOrCreateSessionId();
    send('session_start');
  }, [logEvent]);

  // Page visit on navigation
  useEffect(() => {
    milestonesHit.current = new Set();
    maxScrollPercent.current = 0;
    maxEstimatedLine.current = 0;
    const contentId = getContentId();
    logEvent?.('visit', {
      page_visited: window.location.href,
      content_id: contentId,
      session_id: getOrCreateSessionId(),
      metadata: { page: pathname },
    });
  }, [pathname, searchParams, logEvent]);

  // Scroll & read depth
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;

      const percent = Math.min(100, Math.round((scrollTop / scrollHeight) * 100));
      if (percent > maxScrollPercent.current) {
        maxScrollPercent.current = percent;
        maxEstimatedLine.current = Math.max(
          maxEstimatedLine.current,
          Math.round(scrollTop / 28)
        );
      }

      const now = Date.now();
      if (now - lastScrollLog.current < SCROLL_THROTTLE_MS) return;

      for (const m of SCROLL_MILESTONES) {
        if (percent >= m && !milestonesHit.current.has(m)) {
          milestonesHit.current.add(m);
          lastScrollLog.current = now;
          send('scroll_milestone', {
            percent: m,
            estimated_line: maxEstimatedLine.current,
          });
          break;
        }
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname, logEvent]);

  // Session end when closing tab (duration + max read depth)
  useEffect(() => {
    const endSession = () => {
      send('session_end', {
        duration_sec: getSessionDurationSec(),
        max_scroll_percent: maxScrollPercent.current,
        estimated_line: maxEstimatedLine.current,
      });
    };

    window.addEventListener('pagehide', endSession);
    return () => window.removeEventListener('pagehide', endSession);
  }, [logEvent]);

  return null;
}

export default function AnalyticsTracker() {
  return (
    <Suspense fallback={null}>
      <AnalyticsTrackerInner />
    </Suspense>
  );
}
