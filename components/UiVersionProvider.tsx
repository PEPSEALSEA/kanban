'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getUiVersionFromCookie,
  setUiVersionCookie,
  type UiVersion,
} from '@/lib/ui-version';

type UiVersionContextValue = {
  version: UiVersion;
  isExperimental: boolean;
  setVersion: (version: UiVersion) => void;
  toggleVersion: () => void;
  isReady: boolean;
};

const UiVersionContext = createContext<UiVersionContextValue | null>(null);

export function UiVersionProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersionState] = useState<UiVersion>('classic');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setVersionState(getUiVersionFromCookie());
    setIsReady(true);
  }, []);

  const setVersion = useCallback((next: UiVersion) => {
    setVersionState(next);
    setUiVersionCookie(next);
  }, []);

  const toggleVersion = useCallback(() => {
    setVersionState((current) => {
      const next: UiVersion = current === 'classic' ? 'experimental' : 'classic';
      setUiVersionCookie(next);
      return next;
    });
  }, []);

  return (
    <UiVersionContext.Provider
      value={{
        version,
        isExperimental: version === 'experimental',
        setVersion,
        toggleVersion,
        isReady,
      }}
    >
      {children}
    </UiVersionContext.Provider>
  );
}

export function useUiVersion() {
  const ctx = useContext(UiVersionContext);
  if (!ctx) {
    throw new Error('useUiVersion must be used within UiVersionProvider');
  }
  return ctx;
}
