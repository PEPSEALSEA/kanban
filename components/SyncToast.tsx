'use client';

import React from 'react';
import { useData } from './DataProvider';

export default function SyncToast() {
  const { isSyncing, error } = useData();

  if (!isSyncing && !error) return null;

  return (
    <div className="sync-toast" style={{ 
      border: error ? '1px solid rgba(244, 63, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.1)',
      background: error ? 'rgba(244, 63, 94, 0.1)' : 'rgba(15, 23, 42, 0.8)'
    }}>
      {isSyncing ? (
        <>
          <div className="sync-spinner"></div>
          <span>Updating data...</span>
        </>
      ) : error ? (
        <>
          <span style={{ color: 'var(--accent)' }}>⚠️ Sync Error</span>
        </>
      ) : null}
    </div>
  );
}
