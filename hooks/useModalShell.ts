'use client';

import type { CSSProperties } from 'react';
import { useUiVersion } from '@/components/UiVersionProvider';

export function useModalShell() {
  const { isExperimental } = useUiVersion();

  if (isExperimental) {
    return {
      isExperimental: true as const,
      overlayClassName: 'exp-modal-overlay',
      overlayStyle: undefined as CSSProperties | undefined,
      panelClassName: 'admin-card exp-modal-panel',
    };
  }

  return {
    isExperimental: false as const,
    overlayClassName: undefined,
    overlayStyle: {
      position: 'fixed' as const,
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    },
    panelClassName: 'admin-card',
  };
}
