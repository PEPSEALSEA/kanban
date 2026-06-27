'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminAnalyticsPanel, { type AnalyticsRow } from '@/components/AdminAnalyticsPanel';

export default function ExperimentalAdminAnalyticsPanel({ analytics }: { analytics: AnalyticsRow[] }) {
  return (
    <motion.div
      className="exp-analytics-panel"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="exp-analytics-panel__glow"
        aria-hidden
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      />
      <div className="exp-analytics-panel__inner">
        <AdminAnalyticsPanel analytics={analytics} />
      </div>
    </motion.div>
  );
}

export function AnimatedAdminTabContent({
  tabKey,
  children,
}: {
  tabKey: string;
  children: React.ReactNode;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={tabKey}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
