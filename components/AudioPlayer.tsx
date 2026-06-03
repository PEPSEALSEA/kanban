'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
  contentId: string;
  contentType?: 'learning_content' | 'homework';
  audioUrl?: string;
  driveId?: string;
  title?: string;
}

export default function AudioPlayer({ contentId, contentType = 'learning_content', audioUrl, driveId, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showStatus, setShowStatus] = useState<string>('');
  const [jumpInput, setJumpInput] = useState('');

  // 1. Resolve Final Source URL with local state for refreshing
  const [currentSrc, setCurrentSrc] = useState(audioUrl || (driveId ? `https://docs.google.com/uc?id=${driveId}&export=download` : ''));
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setCurrentSrc(audioUrl || (driveId ? `https://docs.google.com/uc?id=${driveId}&export=download` : ''));
  }, [audioUrl, driveId]);

  const handleAudioError = async () => {
    if (currentSrc.includes('api.telegram.org') && driveId && !isRefreshing) {
      console.log('Refreshing expired Telegram audio link...');
      const lastPos = audioRef.current?.currentTime || currentTime;
      setIsRefreshing(true);
      try {
        const { UPLOAD_SERVICE_URL } = await import('@/lib/config');
        const refreshUrl = `${UPLOAD_SERVICE_URL}?action=getFreshLink&fileId=${encodeURIComponent(driveId)}&refresh=true&contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`;
        
        const res = await fetch(refreshUrl);
        const data = (await res.json()) as any;
        if (data.success && data.url) {
          setCurrentSrc(data.url);
          setShowStatus('Link refreshed! Resuming...');
          
          // Wait for the audio element to load the new source
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = lastPos;
            }
            setShowStatus('Link refresh OK!');
            setTimeout(() => setShowStatus(''), 4000);
          }, 1500);
        }
      } catch (err) {
        console.error('Failed to refresh audio link:', err);
      } finally {
        setIsRefreshing(false);
      }
    }
  };

  // 2. Persistence: Remember where we left off
  useEffect(() => {
    if (!contentId || !audioRef.current) return;

    const savedPos = localStorage.getItem(`audio_pos_${contentId}`);
    if (savedPos && !isLoaded) {
      const pos = parseFloat(savedPos);
      audioRef.current.currentTime = pos;
      setCurrentTime(pos);
      setShowStatus(`Resumed from ${formatTime(pos)}`);
      setTimeout(() => setShowStatus(''), 3000);
    }
    setIsLoaded(true);
  }, [contentId, isLoaded]);

  // Periodic save to localStorage
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        localStorage.setItem(`audio_pos_${contentId}`, audioRef.current.currentTime.toString());
      }
    }, 5000); // Save every 5 seconds
    return () => clearInterval(interval);
  }, [contentId]);

  // 3. Audio Handlers
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const skip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime += seconds;
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current && duration) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = x / rect.width;
      audioRef.current.currentTime = pct * duration;
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    if (!audioRef.current || !jumpInput) return;
    
    let seconds = 0;
    if (jumpInput.includes(':')) {
      const parts = jumpInput.split(':');
      seconds = parseInt(parts[0] || '0') * 60 + parseInt(parts[1] || '0');
    } else {
      seconds = parseInt(jumpInput);
    }
    
    if (!isNaN(seconds) && seconds >= 0) {
      audioRef.current.currentTime = seconds;
      setJumpInput('');
    }
  };

  if (!currentSrc) return null;

  return (
    <div className="bg-white border-4 border-black p-6 shadow-[6px_6px_0px_0px_#000] relative overflow-hidden">
      {/* Refresh Overlay */}
      {isRefreshing && (
        <div className="absolute inset-0 z-10 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="sync-spinner mb-4"></div>
          <div className="text-sm font-black uppercase">Refreshing link...</div>
        </div>
      )}

      {/* Hidden Native Audio Element */}
      <audio 
        ref={audioRef}
        src={currentSrc}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={handleAudioError}
        preload="metadata"
      />

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="text-[10px] font-black uppercase bg-black text-white px-2 py-0.5 inline-block">SOURCE: {audioUrl?.includes('telegram') ? 'TELEGRAM ⚡' : 'DRIVE ☁️'}</div>
          {showStatus && <div className="text-xs font-black text-blue-600 mt-2 uppercase">{showStatus}</div>}
        </div>
        <a href={currentSrc} target="_blank" rel="noreferrer" className="text-xs font-black uppercase border-b-2 border-black hover:bg-yellow-300">Download ↗</a>
      </div>

      {/* Custom Progress Bar */}
      <div 
        onClick={handleProgressClick}
        className="w-full h-6 bg-gray-100 border-4 border-black cursor-pointer relative mb-6 overflow-hidden"
      >
        <div 
          className="absolute left-0 top-0 bottom-0 bg-yellow-300 border-r-4 border-black transition-[width] duration-100 linear"
          style={{ width: `${(currentTime / duration) * 100}%` }} 
        />
      </div>

      {/* Controls */}
      <div className="flex justify-between items-center">
        <div className="text-sm font-black w-12">{formatTime(currentTime)}</div>
        
        <div className="flex items-center gap-6">
          <button onClick={() => skip(-10)} className="neo-button px-3 py-1 text-xs">-10S</button>
          
          <button 
            onClick={togglePlay} 
            className="w-16 h-16 neo-button flex items-center justify-center text-2xl"
            style={{ borderRadius: '50%' }}
          >
            {isPlaying ? (
              <span className="font-black">||</span>
            ) : (
              <span className="ml-1 font-black">▶</span>
            )}
          </button>

          <button onClick={() => skip(10)} className="neo-button px-3 py-1 text-xs">+10S</button>
        </div>

        <div className="text-sm font-black w-12 text-right">{formatTime(duration)}</div>
      </div>

      {/* Jump To Time */}
      <form onSubmit={handleJump} className="mt-6 flex items-center justify-between border-t-2 border-black pt-4">
        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Jump To Time:</label>
        <div className="flex items-center gap-2">
          <input 
            type="text" 
            placeholder="e.g. 1:30 or 90" 
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="w-28 px-2 py-1 text-xs border-2 border-black font-bold focus:outline-none focus:bg-yellow-100"
          />
          <button type="submit" className="neo-button px-3 py-1 text-[10px] bg-sky-200">GO</button>
        </div>
      </form>
    </div>
  );
}
