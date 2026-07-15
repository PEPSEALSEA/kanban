'use client';

import React from 'react';
import { useData } from './DataProvider';

export default function SyncToast() {
  const { isSyncing, error } = useData();

  if (!isSyncing && !error) return null;

  return (
    <div
      className={`sync-toast ${error ? 'sync-toast--error' : 'sync-toast--syncing'}`}
      role="status"
      aria-live="polite"
    >
      {isSyncing ? (
        <>
          <span className="sync-spinner" aria-hidden />
          <span className="sync-toast-text">Syncing</span>
        </>
      ) : (
        <>
          <span className="sync-toast-dot" aria-hidden />
          <span className="sync-toast-text">Sync error</span>
        </>
      )}
    </div>
  );
}
