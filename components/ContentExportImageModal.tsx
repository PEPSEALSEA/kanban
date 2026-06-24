'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { toCanvas } from 'html-to-image';
import ContentExportPreview from '@/components/ContentExportPreview';
import type { ParsedContentDescription } from '@/lib/parseContentDescription';

type ContentForExport = {
  date: string;
  subject: string;
  title: string;
};

interface ContentExportImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: ContentForExport;
  parsed: ParsedContentDescription;
  subjectColors: Record<string, string>;
  mounted: boolean;
}

type ExportSettings = {
  width: number;
  scale: 1 | 2 | 3;
  maxPageHeight: number;
};

type RenderedSize = {
  width: number;
  height: number;
};

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 50) || 'content-export';
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PNG blob.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function splitCanvas(canvas: HTMLCanvasElement, chunkHeight: number): Promise<Blob[]> {
  const blobs: Blob[] = [];
  const height = canvas.height;
  const width = canvas.width;

  let offset = 0;
  while (offset < height) {
    const currentHeight = Math.min(chunkHeight, height - offset);
    const partCanvas = document.createElement('canvas');
    partCanvas.width = width;
    partCanvas.height = currentHeight;
    const ctx = partCanvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to create canvas context.');
    }

    ctx.drawImage(canvas, 0, offset, width, currentHeight, 0, 0, width, currentHeight);
    blobs.push(await canvasToBlob(partCanvas));
    offset += currentHeight;
  }

  return blobs;
}

export default function ContentExportImageModal({
  isOpen,
  onClose,
  content,
  parsed,
  subjectColors,
  mounted,
}: ContentExportImageModalProps) {
  const [settings, setSettings] = useState<ExportSettings>({
    width: 896,
    scale: 2,
    maxPageHeight: 2200,
  });
  const [previewIndex, setPreviewIndex] = useState(0);
  const [pageBlobs, setPageBlobs] = useState<Blob[]>([]);
  const [renderSize, setRenderSize] = useState<RenderedSize>({ width: 0, height: 0 });
  const [isRendering, setIsRendering] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exportRef = useRef<HTMLDivElement>(null);
  const renderTokenRef = useRef(0);

  const copySupported = typeof navigator !== 'undefined' && !!navigator.clipboard && typeof ClipboardItem !== 'undefined';

  const pageUrls = useMemo(() => pageBlobs.map((blob) => URL.createObjectURL(blob)), [pageBlobs]);

  useEffect(() => {
    return () => {
      pageUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pageUrls]);

  useEffect(() => {
    setPreviewIndex((prev) => Math.min(prev, Math.max(pageBlobs.length - 1, 0)));
  }, [pageBlobs.length]);

  const buildPreview = useCallback(async () => {
    if (!isOpen || !exportRef.current) return;

    renderTokenRef.current += 1;
    const token = renderTokenRef.current;

    setIsRendering(true);
    setError(null);

    try {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      await new Promise((resolve) => setTimeout(resolve, 80));

      const canvas = await toCanvas(exportRef.current, {
        pixelRatio: settings.scale,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });

      const blobs = await splitCanvas(canvas, settings.maxPageHeight * settings.scale);
      if (token !== renderTokenRef.current) return;

      setRenderSize({ width: canvas.width, height: canvas.height });
      setPageBlobs(blobs);
    } catch (err) {
      if (token !== renderTokenRef.current) return;
      const message = err instanceof Error ? err.message : 'Unknown export error.';
      const hint = /tainted|cors/i.test(message)
        ? 'Image export blocked by CORS in markdown attachments.'
        : message;
      setError(hint);
      setPageBlobs([]);
    } finally {
      if (token === renderTokenRef.current) {
        setIsRendering(false);
      }
    }
  }, [isOpen, settings.maxPageHeight, settings.scale]);

  useEffect(() => {
    if (!isOpen) return;
    const timeoutId = window.setTimeout(() => {
      void buildPreview();
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [buildPreview, isOpen, settings.width, parsed, content]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const handleDownload = useCallback(async () => {
    if (pageBlobs.length === 0) return;
    setIsDownloading(true);
    try {
      const base = slugifyTitle(content.title);
      for (let i = 0; i < pageBlobs.length; i += 1) {
        const url = URL.createObjectURL(pageBlobs[i]);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}-p${i + 1}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
    } finally {
      setIsDownloading(false);
    }
  }, [content.title, pageBlobs]);

  const handleCopy = useCallback(async () => {
    if (!copySupported || pageBlobs.length === 0) return;
    setIsCopying(true);
    setError(null);
    try {
      const blob = pageBlobs[previewIndex];
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to copy image.';
      setError(message);
    } finally {
      setIsCopying(false);
    }
  }, [copySupported, pageBlobs, previewIndex]);

  const currentPreviewUrl = pageUrls[previewIndex] || null;

  return (
    <>
      <div className="fixed left-[-99999px] top-0 pointer-events-none">
        <ContentExportPreview
          ref={exportRef}
          content={content}
          parsed={parsed}
          subjectColors={subjectColors}
          mounted={mounted}
          width={settings.width}
        />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[1100] p-4 md:p-6 flex items-center justify-center"
            onClick={onClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="neo-card w-full max-w-7xl rounded-3xl p-5 md:p-7 border-none shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex justify-between items-center gap-4 mb-5">
                <div>
                  <h2 className="text-xl md:text-2xl font-bold text-slate-800">Export as PNG</h2>
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mt-1">
                    Subject, date, title and content only
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition-colors"
                  aria-label="Close export dialog"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] gap-5">
                <div className="rounded-2xl border border-slate-200/70 bg-white/80 p-5 space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Canvas Width</label>
                      <span className="text-sm font-semibold text-slate-700">{settings.width}px</span>
                    </div>
                    <input
                      type="range"
                      min={320}
                      max={1200}
                      step={8}
                      value={settings.width}
                      onChange={(e) => setSettings((prev) => ({ ...prev, width: Number(e.target.value) }))}
                      className="w-full"
                    />
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <button type="button" className="neo-button px-2 py-2 text-[11px]" onClick={() => setSettings((prev) => ({ ...prev, width: 375 }))}>Mobile</button>
                      <button type="button" className="neo-button px-2 py-2 text-[11px]" onClick={() => setSettings((prev) => ({ ...prev, width: 768 }))}>Tablet</button>
                      <button type="button" className="neo-button px-2 py-2 text-[11px]" onClick={() => setSettings((prev) => ({ ...prev, width: 896 }))}>Desktop</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 block">Resolution</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[1, 2, 3].map((scale) => (
                        <button
                          key={scale}
                          type="button"
                          className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                            settings.scale === scale
                              ? 'bg-slate-800 text-white border-slate-800'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                          }`}
                          onClick={() => setSettings((prev) => ({ ...prev, scale: scale as 1 | 2 | 3 }))}
                        >
                          {scale}x
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Max Page Height</label>
                      <span className="text-sm font-semibold text-slate-700">{settings.maxPageHeight}px</span>
                    </div>
                    <input
                      type="range"
                      min={1500}
                      max={4000}
                      step={100}
                      value={settings.maxPageHeight}
                      onChange={(e) => setSettings((prev) => ({ ...prev, maxPageHeight: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={isRendering || isDownloading || pageBlobs.length === 0}
                      className="neo-button px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isDownloading ? 'Downloading...' : `Download PNG (${pageBlobs.length || 0})`}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!copySupported || isRendering || isCopying || pageBlobs.length === 0}
                      className="neo-button px-4 py-3 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      title={!copySupported ? 'Clipboard API is not supported on this browser.' : undefined}
                    >
                      {isCopying ? 'Copying...' : 'Copy Current Page'}
                    </button>
                  </div>

                  {error && (
                    <div className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3">
                      {error}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 md:p-5 min-h-[420px] flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                      {renderSize.width > 0 ? `${renderSize.width} x ${renderSize.height}px` : 'Generating preview...'}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="neo-button px-3 py-1 text-xs disabled:opacity-50"
                        disabled={previewIndex === 0}
                        onClick={() => setPreviewIndex((prev) => Math.max(prev - 1, 0))}
                      >
                        Prev
                      </button>
                      <span className="text-xs font-semibold text-slate-600 min-w-14 text-center">
                        {pageBlobs.length > 0 ? `${previewIndex + 1}/${pageBlobs.length}` : '0/0'}
                      </span>
                      <button
                        type="button"
                        className="neo-button px-3 py-1 text-xs disabled:opacity-50"
                        disabled={previewIndex >= pageBlobs.length - 1}
                        onClick={() => setPreviewIndex((prev) => Math.min(prev + 1, Math.max(pageBlobs.length - 1, 0)))}
                      >
                        Next
                      </button>
                    </div>
                  </div>

                  <div className="relative flex-1 rounded-xl border border-slate-200 bg-white overflow-auto p-3 md:p-5 flex items-start justify-center">
                    {currentPreviewUrl ? (
                      <img
                        src={currentPreviewUrl}
                        alt={`Export preview page ${previewIndex + 1}`}
                        className="max-w-full h-auto shadow-md rounded"
                      />
                    ) : (
                      <div className="w-full h-full text-sm text-slate-500 flex items-center justify-center">
                        {isRendering ? 'Rendering preview...' : 'No preview available'}
                      </div>
                    )}

                    {isRendering && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-[1px] flex items-center justify-center text-sm font-semibold text-slate-600">
                        Rendering preview...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
