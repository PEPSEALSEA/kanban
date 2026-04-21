'use client';

import React, { useState } from 'react';

export type Attachment = {
  type: 'link_image' | 'link_work';
  url: string;
  title: string;
};

export default function AttachmentList({ attachments }: { attachments: Attachment[] }) {
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = React.useRef(false);
  const dragStartRef = React.useRef({ x: 0, y: 0 });

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomLevel((prev) => {
    const newZoom = Math.max(prev - 0.5, 1);
    if (newZoom === 1) setPosition({ x: 0, y: 0 }); // reset pan on full zoom out
    return newZoom;
  });
  
  const handleResetZoom = () => {
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
  };

  const closeModal = () => {
    setSelectedImage(null);
    setZoomLevel(1);
    setPosition({ x: 0, y: 0 });
    isDraggingRef.current = false;
    setIsDragging(false);
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (selectedImage) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedImage]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomLevel <= 1) return;
    // We only drag with the left mouse button
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

  const images = attachments.filter((a) => a.type === 'link_image');
  const files = attachments.filter((a) => a.type === 'link_work');

  return (
    <div className="w-full flex flex-col gap-6">
      {/* File Documents Section */}
      {files.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Documents & Files</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {files.map((file, idx) => (
              <div 
                key={idx} 
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-300 transition-all gap-4"
              >
                <div className="flex items-center gap-3 w-full overflow-hidden">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <span className="font-medium text-slate-700 truncate" title={file.title}>
                    {file.title || 'Untitled Document'}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    View
                  </a>
                  <a
                    href={file.url}
                    download
                    className="px-3 py-1.5 text-sm font-medium text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Images Section */}
      {images.length > 0 && (
        <div className="flex flex-col gap-3">
          <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Image Gallery</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {images.map((img, idx) => (
              <div 
                key={idx} 
                onClick={() => setSelectedImage(img)}
                className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer border border-slate-200 bg-slate-100 shadow-sm hover:shadow-md hover:ring-2 ring-indigo-400 transition-all"
              >
                <img 
                  src={img.url} 
                  alt={img.title || 'Preview'} 
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-6 pointer-events-none">
                  <p className="text-white text-xs font-medium truncate drop-shadow-md">
                    {img.title || `Image ${idx + 1}`}
                  </p>
                </div>
                {/* Overlay Icon */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <svg className="w-8 h-8 text-white drop-shadow-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fullscreen Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-3xl transition-opacity duration-300 animate-in fade-in">
          {/* Top Navbar for Modal */}
          <div className="absolute top-0 inset-x-0 p-6 flex justify-between items-center bg-gradient-to-b from-black/80 via-black/40 to-transparent z-[10000]">
            <div className="flex flex-col">
              <h3 className="text-white text-xl font-bold tracking-tight truncate pr-4 drop-shadow-lg">
                {selectedImage.title || 'Image Viewer'}
              </h3>
              <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mt-0.5 opacity-80">
                Preview Mode
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Zoom Controls */}
              <div className="flex items-center bg-slate-800/40 rounded-xl backdrop-blur-xl border border-white/10 mr-4 shadow-xl overflow-hidden">
                <button 
                  onClick={handleZoomOut} 
                  className="p-2.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                  disabled={zoomLevel <= 1}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                </button>
                <div className="px-4 text-white text-sm font-bold w-20 text-center border-x border-white/5 select-none tabular-nums">
                  {Math.round(zoomLevel * 100)}%
                </div>
                <button 
                  onClick={handleResetZoom} 
                  className="px-3 py-2 text-white hover:bg-white/10 transition-all text-xs font-black disabled:opacity-30 disabled:cursor-not-allowed border-r border-white/5" 
                  title="Reset Zoom" 
                  disabled={zoomLevel === 1}
                >
                  1:1
                </button>
                <button 
                  onClick={handleZoomIn} 
                  className="p-2.5 text-slate-300 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                  disabled={zoomLevel >= 4}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>

              {/* Close Button */}
              <button 
                onClick={closeModal} 
                className="p-2.5 bg-red-500/10 hover:bg-red-500/80 text-red-500 hover:text-white rounded-xl transition-all backdrop-blur-xl border border-red-500/20"
                title="Close (Esc)"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Interactive Image Container */}
          <div 
            className="absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden" 
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onMouseMove={handleMouseMove}
          >
            {/* Clickable bounding box for closing modal (only triggers if image isn't dragged/clicked) */}
            <div className="absolute inset-0 z-0" onMouseUp={closeModal} />
            
            <img 
              src={selectedImage.url} 
              alt={selectedImage.title} 
              onMouseDown={handleMouseDown}
              className="w-full h-full object-contain drop-shadow-[0_0_50px_rgba(0,0,0,0.5)] relative z-10 animate-in zoom-in-95 duration-300 ease-out"
              style={{ 
                transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
                cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'auto',
                transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)'
              }}
              draggable={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}
