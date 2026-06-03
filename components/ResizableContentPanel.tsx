'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

type ResizableContentPanelProps = {
  children: React.ReactNode;
  /** localStorage key */
  storageKey: string;
  defaultWidth: number;
  minWidth?: number;
  maxWidth?: number;
  enabled?: boolean;
  className?: string;
};

export default function ResizableContentPanel({
  children,
  storageKey,
  defaultWidth,
  minWidth = 360,
  maxWidth = 1400,
  enabled = true,
  className = '',
}: ResizableContentPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);
  const [hydrated, setHydrated] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) {
        setWidth(Math.min(maxWidth, Math.max(minWidth, parsed)));
      }
    }
    setHydrated(true);
  }, [storageKey, minWidth, maxWidth]);

  const clampWidth = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, w)),
    [minWidth, maxWidth]
  );

  const handleResizeStart = (e: React.MouseEvent) => {
    if (!enabled) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: width };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      const next = clampWidth(dragRef.current.startWidth + delta);
      setWidth(next);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setWidth((current) => {
        localStorage.setItem(storageKey, String(current));
        return current;
      });
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [enabled, clampWidth, storageKey]);

  if (!enabled) {
    return <div className={`mx-auto w-full ${className}`}>{children}</div>;
  }

  return (
    <div
      ref={panelRef}
      className={`group relative mx-auto w-full ${className}`}
      style={hydrated ? { maxWidth: width } : { maxWidth: defaultWidth }}
    >
      {children}
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="ปรับความกว้าง"
        title="ลากเพื่อปรับความกว้าง"
        onMouseDown={handleResizeStart}
        onDoubleClick={() => {
          setWidth(defaultWidth);
          localStorage.setItem(storageKey, String(defaultWidth));
        }}
        className="absolute bottom-4 right-4 z-20 hidden lg:flex items-center justify-center w-7 h-7 rounded-lg border border-slate-200/90 bg-white/95 text-slate-400 hover:text-sky-600 hover:border-sky-300 cursor-ew-resize select-none shadow-sm opacity-60 group-hover:opacity-100 transition-opacity"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
          <circle cx="10" cy="10" r="1.25" />
          <circle cx="6" cy="10" r="1.25" />
          <circle cx="10" cy="6" r="1.25" />
        </svg>
      </div>
    </div>
  );
}
