'use client';

import React from 'react';
import { useData } from './DataProvider';

export default function SyncToast() {
  const { isSyncing, error } = useData();

  if (!isSyncing && !error) return null;

  return (
    <div className="sync-toast" style={{ 
      background: error ? '#fecaca' : '#fde047',
      borderColor: '#000'
    }}>
      {isSyncing ? (
        <>
          <div className="sync-spinner"></div>
          <span className="font-black uppercase text-xs">Updating data...</span>
        </>
      ) : error ? (
        <>
          <span className="font-black uppercase text-xs">⚠️ Sync Error</span>
        </>
      ) : null}
    </div>
  );
}
