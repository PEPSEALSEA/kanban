'use client';

import React, { useRef } from 'react';
import { useDeviceDetection } from '@/hooks/useDeviceDetection';

type AttachmentFileInputProps = {
  multiple?: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
  style?: React.CSSProperties;
  showCamera?: boolean;
  compact?: boolean;
  buttonClassName?: string;
};

const MOBILE_BTN_STYLE: React.CSSProperties = {
  flex: 1,
  padding: '0.55rem 0.5rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--admin-border)',
  background: 'var(--admin-bg-soft)',
  color: 'var(--admin-text-main)',
  fontSize: '0.72rem',
  fontWeight: 600,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '0.2rem',
};

const COMPACT_BTN_CLASS =
  'rounded-lg border px-2 py-2 text-xs font-semibold disabled:opacity-50';

export default function AttachmentFileInput({
  multiple = true,
  disabled = false,
  onChange,
  accept,
  style,
  showCamera = true,
  compact = false,
  buttonClassName,
}: AttachmentFileInputProps) {
  const { isMobile } = useDeviceDetection();
  const galleryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const desktopRef = useRef<HTMLInputElement>(null);

  const resetAndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e);
    e.target.value = '';
  };

  const compactClass = buttonClassName || COMPACT_BTN_CLASS;

  const openPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    if (disabled) return;
    ref.current?.click();
  };

  if (!isMobile) {
    return (
      <input
        ref={desktopRef}
        type="file"
        multiple={multiple}
        accept={accept}
        onChange={resetAndChange}
        disabled={disabled}
        style={{ fontSize: '0.8rem', ...style }}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: compact ? '0.35rem' : '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={disabled}
          className={compact ? compactClass : undefined}
          style={compact ? undefined : MOBILE_BTN_STYLE}
          onClick={() => openPicker(galleryRef)}
        >
          {compact ? '🖼️' : (
            <>
              <span style={{ fontSize: '1.1rem' }}>🖼️</span>
              <span>Gallery</span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={disabled}
          className={compact ? compactClass : undefined}
          style={compact ? undefined : MOBILE_BTN_STYLE}
          onClick={() => openPicker(fileRef)}
        >
          {compact ? '📄' : (
            <>
              <span style={{ fontSize: '1.1rem' }}>📄</span>
              <span>PDF / Files</span>
            </>
          )}
        </button>
        {showCamera && (
          <button
            type="button"
            disabled={disabled}
            className={compact ? compactClass : undefined}
            style={compact ? undefined : MOBILE_BTN_STYLE}
            onClick={() => openPicker(cameraRef)}
          >
            {compact ? '📷' : (
              <>
                <span style={{ fontSize: '1.1rem' }}>📷</span>
                <span>Camera</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={galleryRef}
        type="file"
        multiple={multiple}
        accept="image/*"
        onChange={resetAndChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <input
        ref={fileRef}
        type="file"
        multiple={multiple}
        accept="application/pdf,.pdf,image/*,application/*"
        onChange={resetAndChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />
      <input
        ref={cameraRef}
        type="file"
        multiple={multiple}
        accept="image/*"
        capture="environment"
        onChange={resetAndChange}
        disabled={disabled}
        style={{ display: 'none' }}
      />
    </div>
  );
}
