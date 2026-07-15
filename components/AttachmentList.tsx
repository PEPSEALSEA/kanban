'use client';

import React, { useState } from 'react';
import { getFreshTelegramUrl } from '@/lib/telegram';
import { useData } from '@/components/DataProvider';
import { getOrCreateSessionId } from '@/lib/analytics';
import { API_URL, UPLOAD_SERVICE_URL } from '@/lib/config';

export type Attachment = {
  type: 'link_image' | 'link_work';
  url: string;
  title: string;
  fileId?: string;
};

function decodeDisplayName(raw?: string): string {
  let name = String(raw || '').trim();
  if (!name) return 'File Viewer';
  try {
    while (/%[0-9A-Fa-f]{2}/.test(name)) {
      const decoded = decodeURIComponent(name);
      if (decoded === name) break;
      name = decoded;
    }
  } catch {
    /* keep current */
  }
  return name;
}

function ensureFilenameExtension(filename: string, url: string, isImage: boolean): string {
  let name = decodeDisplayName(filename) || 'download';
  name = name.replace(/[/\\?%*:|"<>]/g, '_').trim();
  if (/\.[a-zA-Z0-9]{1,8}$/.test(name)) return name;

  const urlExt = url.match(/\.([a-zA-Z0-9]{1,8})(?:$|\?)/)?.[1];
  if (urlExt) return `${name}.${urlExt.toLowerCase()}`;
  return `${name}.${isImage ? 'jpg' : 'bin'}`;
}

export default function AttachmentList({ 
  attachments, 
  contentId, 
  contentType 
}: { 
  attachments: Attachment[]; 
  contentId?: string; 
  contentType?: 'learning_content' | 'homework';
}) {
  const { logEvent } = useData();
  const [localAttachments, setLocalAttachments] = useState<Attachment[]>(attachments);
  const [selectedPreview, setSelectedPreview] = useState<Attachment | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState<Record<string, boolean>>({});
  const [refreshAttempted, setRefreshAttempted] = useState<Record<string, boolean>>({});
  const [isDownloading, setIsDownloading] = useState(false);

  React.useEffect(() => {
    const sorted = [...attachments].sort((a, b) => 
      (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
    );
    setLocalAttachments(sorted);
  }, [attachments]);

  const handleImageError = async (targetImg: Attachment, force: boolean = false) => {
    let fileId = targetImg.fileId;
    if (!fileId && targetImg.url.includes('api.telegram.org')) {
      fileId = targetImg.title;
    }
    
    if (!fileId) {
      console.warn("Cannot refresh: Missing both fileId and filename for", targetImg.title);
      setIsPreviewLoading(false);
      return;
    }

    const uniqueKey = `${fileId}_${targetImg.url}`;

    if ((refreshAttempted[uniqueKey] && !force) || isRefreshing[uniqueKey]) {
      setIsPreviewLoading(false);
      return;
    }

    if (targetImg.url.includes('api.telegram.org')) {
      setIsRefreshing(prev => ({ ...prev, [uniqueKey]: true }));
      setRefreshAttempted(prev => ({ ...prev, [uniqueKey]: true }));
      
      try {
        let freshUrl = await getFreshTelegramUrl(fileId);

        if (!freshUrl) {
          console.log(`[Heal] Direct fetch failed for ${targetImg.title}, using GAS recovery...`);
          const refreshUrl = `${UPLOAD_SERVICE_URL}?action=getFreshLink&fileId=${encodeURIComponent(fileId)}&refresh=true&contentId=${encodeURIComponent(contentId || '')}&contentType=${encodeURIComponent(contentType || '')}`;
          const res = await fetch(refreshUrl);
          const data = (await res.json()) as any;
          if (data.success && data.url) {
            freshUrl = data.url;
            if (data.fileId) fileId = data.fileId;
          }
        } else {
          fetch(`${UPLOAD_SERVICE_URL}?action=getFreshLink&fileId=${encodeURIComponent(fileId)}&refresh=true&contentId=${encodeURIComponent(contentId || '')}&contentType=${encodeURIComponent(contentType || '')}`).catch(() => {});
        }
        
        if (freshUrl) {
          console.log(`Successfully refreshed link for ${targetImg.title}`);
          
          setLocalAttachments(prev => {
            const newArr = [...prev];
            const currentIdx = newArr.findIndex(a => 
              a.url === targetImg.url && 
              (a.fileId === targetImg.fileId || (targetImg.url.includes('api.telegram.org') && a.title === targetImg.title))
            );

            if (currentIdx !== -1) {
              const updated = { 
                ...newArr[currentIdx], 
                url: freshUrl!,
                fileId: fileId
              };
              newArr[currentIdx] = updated;
              
              setSelectedPreview(currentSelected => {
                if (currentSelected && currentSelected.url === targetImg.url) {
                  return updated;
                }
                return currentSelected;
              });
            }
            return newArr;
          });
        } else {
          console.error("All refresh methods failed for", targetImg.title);
          setIsPreviewLoading(false);
        }
      } catch (err) {
        console.error('Refresh error:', err);
        setIsPreviewLoading(false);
      } finally {
        setIsRefreshing(prev => ({ ...prev, [uniqueKey]: false }));
      }
    } else if (targetImg.url.includes('drive.google.com')) {
      console.warn("Google Drive link failed - likely bandwidth quota exceeded.");
      setIsPreviewLoading(false);
    } else {
      setIsPreviewLoading(false);
    }
  };

  const downloadAttachment = async (file: Attachment) => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      const filename = ensureFilenameExtension(
        file.title,
        file.url,
        file.type === 'link_image'
      );
      let fileId = file.fileId;

      if (!fileId && file.url.includes('api.telegram.org')) {
        fileId = file.title;
      }

      if (fileId) {
        const proxyUrl =
          `${API_URL}/api/file-download?fileId=${encodeURIComponent(fileId)}` +
          `&filename=${encodeURIComponent(filename)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) {
          throw new Error(`Download failed (${res.status})`);
        }
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const res = await fetch(file.url);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Download error:', err);
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  };
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = React.useRef(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomLevel((prev) => {
    const newZoom = Math.max(prev - 0.5, 1);
    if (newZoom === 1) setPosition({ x: 0, y: 0 });
    return newZoom;
  });
  
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  const closeModal = () => {
    setSelectedPreview(null);
    setIsPreviewLoading(true);
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (selectedPreview) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPreview]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    if (e.button !== 0) return;
    
    e.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || zoomLevel <= 1) return;
    e.preventDefault();
    setPosition({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y });
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  if (!attachments || attachments.length === 0) {
    return <div className="text-gray-500 text-sm italic">No attachments found.</div>;
  }

  const images = localAttachments.filter((a) => a.type === 'link_image');
  const files = localAttachments.filter((a) => a.type === 'link_work');

  const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  return (
    <div className="w-full flex flex-col gap-6">
      {files.length > 0 && (
        <div className="flex flex-col gap-4">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Documents & Files</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {files.map((file, idx) => (
              <div 
                key={idx} 
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all gap-4"
              >
                <div className="flex items-center gap-3 w-full overflow-hidden min-w-0">
                  <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center text-sky-500 shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <span className="font-semibold text-slate-700 text-sm truncate uppercase tracking-tight" title={decodeDisplayName(file.title)}>
                    {decodeDisplayName(file.title) || 'Untitled Document'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-[10px] font-bold text-slate-500 rounded-lg transition-colors"
                  >
                    VIEW
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadAttachment(file)}
                    disabled={isDownloading}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-[10px] font-bold text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    DL
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Image Gallery</h4>
            {images.some(img => refreshAttempted[`${img.fileId}_${img.url}`]) && (
              <button 
                onClick={() => {
                  images.forEach(img => {
                    const uk = `${img.fileId}_${img.url}`;
                    if (refreshAttempted[uk]) handleImageError(img, true);
                  });
                }}
                className="px-3 py-1 bg-red-50 text-red-500 text-[10px] font-bold rounded-full hover:bg-red-100 transition-colors"
              >
                REFRESH BROKEN
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((img, idx) => (
              <div 
                key={idx} 
                onClick={() => {
                  setSelectedPreview(img);
                  logEvent?.('view_image', {
                    content_id: contentId,
                    session_id: getOrCreateSessionId(),
                    metadata: { title: img.title, type: img.type },
                  });
                }}
                className="relative aspect-square bg-slate-50 border border-slate-100 rounded-2xl shadow-sm hover:shadow-md hover:translate-y-[-2px] transition-all cursor-pointer overflow-hidden group"
              >
                <img 
                  src={isRefreshing[`${img.fileId}_${img.url}`] ? TRANSPARENT_PIXEL : img.url} 
                  alt={decodeDisplayName(img.title) || 'Preview'} 
                  className="w-full h-full object-cover transition-all"
                  onError={() => handleImageError(img)}
                />
                <div className="absolute inset-x-0 bottom-0 bg-white/90 backdrop-blur-md border-t border-slate-100 p-3 transform translate-y-full group-hover:translate-y-0 transition-transform">
                  <p className="text-[9px] font-bold text-slate-600 uppercase truncate">
                    {decodeDisplayName(img.title) || `Image ${idx + 1}`}
                  </p>
                </div>
                
                {refreshAttempted[`${img.fileId}_${img.url}`] && !isRefreshing[`${img.fileId}_${img.url}`] && (
                  <div className="absolute inset-0 bg-white/95 flex flex-col items-center justify-center p-3 gap-2 z-20">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleImageError(img, true);
                      }}
                      className="px-4 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg"
                    >
                      REFRESH
                    </button>
                    <span className="text-[8px] font-bold uppercase text-red-500 tracking-wider">Failed to load</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedPreview && typeof document !== 'undefined' && require('react-dom').createPortal(
        <div 
          className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/90 backdrop-blur-3xl transition-opacity duration-300 animate-in fade-in"
          style={{
            background: `radial-gradient(circle at center, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.95) 100%)`
          }}
        >
          {isPreviewLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-[100001] pointer-events-none">
              <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            </div>
          )}
          <div className="absolute top-0 inset-x-0 p-3 sm:p-6 flex gap-2 sm:gap-3 items-start sm:items-center bg-gradient-to-b from-black/80 via-black/40 to-transparent z-[100002]">
            <div className="flex flex-col min-w-0 flex-1 overflow-hidden pr-2">
              <h3 className="text-white text-base sm:text-xl font-bold tracking-tight truncate drop-shadow-lg" title={decodeDisplayName(selectedPreview.title)}>
                {decodeDisplayName(selectedPreview.title) || 'File Viewer'}
              </h3>
              <p className="text-slate-400 text-[10px] sm:text-xs font-medium uppercase tracking-widest mt-0.5 opacity-80">
                {selectedPreview.type === 'link_image' ? 'Image Preview' : 'Document Preview'}
              </p>
            </div>
            
            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {selectedPreview.type === 'link_image' && (
                <div className="hidden sm:flex items-center bg-slate-800/40 rounded-xl backdrop-blur-xl border border-white/10 shadow-xl overflow-hidden">
                  <button 
                    onClick={handleZoomOut} 
                    className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                    disabled={zoomLevel <= 1}
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                  </button>
                  <div className="px-2 sm:px-4 text-white text-xs sm:text-sm font-bold w-14 sm:w-20 text-center border-x border-white/5 select-none tabular-nums">
                    {Math.round(zoomLevel * 100)}%
                  </div>
                  <button 
                    onClick={handleResetZoom} 
                    className="px-2 sm:px-3 py-2 text-white hover:bg-white/10 transition-all text-[10px] sm:text-xs font-black disabled:opacity-30 disabled:cursor-not-allowed border-r border-white/5" 
                    title="Reset Zoom" 
                    disabled={zoomLevel === 1}
                  >
                    1:1
                  </button>
                  <button 
                    onClick={handleZoomIn} 
                    className="p-2 sm:p-2.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                    disabled={zoomLevel >= 4}
                  >
                    <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => downloadAttachment(selectedPreview)}
                disabled={isDownloading}
                className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all backdrop-blur-xl border border-white/20 shrink-0 disabled:opacity-50"
                title="Download"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" /></svg>
              </button>
    
              <button 
                type="button"
                onClick={closeModal} 
                className="p-2.5 bg-red-500/10 hover:bg-red-500/80 text-red-500 hover:text-white rounded-xl transition-all backdrop-blur-xl border border-red-500/20 shrink-0"
                title="Close (Esc)"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
    
          <div 
            className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden pt-20" 
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseMove={handleMouseMove}
          >
            <div
              className="absolute inset-0 z-0"
              onClick={closeModal}
              onTouchEnd={(e) => {
                e.preventDefault();
                closeModal();
              }}
            />
            
            {selectedPreview.type === 'link_image' ? (
              <img 
                src={isRefreshing[`${selectedPreview.fileId}_${selectedPreview.url}`] ? TRANSPARENT_PIXEL : selectedPreview.url} 
                alt={decodeDisplayName(selectedPreview.title)} 
                onMouseDown={handleMouseDown}
                onClick={(e) => e.stopPropagation()}
                onLoad={() => setIsPreviewLoading(false)}
                onError={() => handleImageError(selectedPreview)}
                className={`max-w-full max-h-full w-auto h-auto object-contain drop-shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 animate-in zoom-in-95 duration-300 ease-out transition-opacity ${isPreviewLoading ? 'opacity-0' : 'opacity-100'}`}
                style={{ 
                  transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
                  cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'auto',
                  transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
                }}
                draggable={false}
              />
            ) : (
              <div className="relative z-10 w-[95%] h-[90%] bg-white rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                <iframe 
                  src={`https://docs.google.com/viewer?url=${encodeURIComponent(selectedPreview.url)}&embedded=true`}
                  className="w-full h-full border-none"
                  onLoad={() => setIsPreviewLoading(false)}
                  title={decodeDisplayName(selectedPreview.title)}
                />
              </div>
            )}

            {refreshAttempted[`${selectedPreview.fileId}_${selectedPreview.url}`] && !isRefreshing[`${selectedPreview.fileId}_${selectedPreview.url}`] && (
              <div className="absolute inset-0 flex items-center justify-center z-[100003] pointer-events-none">
                <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex flex-col items-center gap-4 pointer-events-auto shadow-2xl">
                  <div className="p-3 bg-red-500/20 text-red-400 rounded-full">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold">Failed to load preview</p>
                    <p className="text-slate-400 text-sm">The link may have expired or Google quota was hit.</p>
                  </div>
                  <button 
                    onClick={() => handleImageError(selectedPreview, true)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 active:scale-95"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Refresh File Link
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
