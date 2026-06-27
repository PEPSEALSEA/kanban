'use client';

import React from 'react';
import { useUiVersion } from '@/components/UiVersionProvider';

export default function UiVersionSwitcher() {
  const { version, toggleVersion, isReady } = useUiVersion();

  if (!isReady) return null;

  const isExperimental = version === 'experimental';

  return (
    <div className="ui-version-switcher">
      <button
        type="button"
        onClick={toggleVersion}
        className={`ui-version-switcher__btn ${isExperimental ? 'ui-version-switcher__btn--active' : ''}`}
        aria-pressed={isExperimental}
        title={isExperimental ? 'Switch to Classic UI' : 'Switch to New UI (Experimental)'}
      >
        <span className="ui-version-switcher__dot" aria-hidden />
        New UI
      </button>
    </div>
  );
}
