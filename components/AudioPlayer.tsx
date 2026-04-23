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

  // 1. Resolve Final Source URL with local state for refreshing
  const [currentSrc, setCurrentSrc] = useState(audioUrl || (driveId ? `https://docs.google.com/uc?id=${driveId}&export=download` : ''));
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setCurrentSrc(audioUrl || (driveId ? `https://docs.google.com/uc?id=${driveId}&export=download` : ''));
  }, [audioUrl, driveId]);

  const handleAudioError = async () => {
    if (currentSrc.includes('api.telegram.org') && driveId && !isRefreshing) {
      console.log('Refreshing expired Telegram audio link...');
      setIsRefreshing(true);
      try {
        const UPLOAD_WEB_APP_URL = "https://script.google.com/macros/s/AKfycby7FOqHLZN24sWCwl7XP4maUSi_iCxEFcg6REG-F8qp2C33aJL0US1Ye8XTZ7qUBDC8fw/exec";
        // Encode driveId and pass content context for DB sync
        const refreshUrl = `${UPLOAD_WEB_APP_URL}?action=getFreshLink&fileId=${encodeURIComponent(driveId)}&refresh=true&contentId=${encodeURIComponent(contentId)}&contentType=${encodeURIComponent(contentType)}`;
        
        const res = await fetch(refreshUrl);
        const data = await res.json();
        if (data.success && data.url) {
          setCurrentSrc(data.url);
          setShowStatus('Link refreshed! Please play again.');
          setTimeout(() => setShowStatus(''), 3000);
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

  if (!currentSrc) return null;

  return (
    <div className="glass audio-player-card" style={{ padding: '1.5rem', borderRadius: '1.5rem', background: 'rgba(255,255,255,0.03)' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.65rem', fontWeight: 800, opacity: 0.5, letterSpacing: '1px' }}>PLAYER SOURCE: {audioUrl?.includes('telegram') ? 'TELEGRAM ⚡' : 'DRIVE ☁️'}</div>
          {showStatus && <div style={{ fontSize: '0.7rem', color: '#818cf8', marginTop: '2px' }}>{showStatus}</div>}
        </div>
        <a href={currentSrc} target="_blank" rel="noreferrer" style={{ fontSize: '0.7rem', color: '#94a3b8', textDecoration: 'none' }}>↗ Download</a>
      </div>

      {/* Custom Progress Bar */}
      <div 
        onClick={handleProgressClick}
        style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', cursor: 'pointer', position: 'relative', marginBottom: '1rem' }}
      >
        <div style={{ 
          position: 'absolute', left: 0, top: 0, bottom: 0, 
          width: `${(currentTime / duration) * 100}%`, 
          background: 'linear-gradient(90deg, #818cf8, #f43f5e)', 
          borderRadius: '4px',
          transition: 'width 0.1s linear'
        }} />
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.8rem', opacity: 0.6, width: '50px' }}>{formatTime(currentTime)}</div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button onClick={() => skip(-10)} className="btn-skip" style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.8 }}>-10s</button>
          
          <button 
            onClick={togglePlay} 
            className="btn-play"
            style={{ 
              width: '50px', height: '50px', borderRadius: '25px', 
              background: '#fff', border: 'none', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'transform 0.2s'
            }}
          >
            {isPlaying ? (
              <div style={{ display: 'flex', gap: '4px' }}>
                <div style={{ width: '4px', height: '16px', background: '#000', borderRadius: '2px' }} />
                <div style={{ width: '4px', height: '16px', background: '#000', borderRadius: '2px' }} />
              </div>
            ) : (
              <div style={{ marginLeft: '4px', width: '0', height: '0', borderTop: '8px solid transparent', borderBottom: '8px solid transparent', borderLeft: '12px solid #000' }} />
            )}
          </button>

          <button onClick={() => skip(10)} className="btn-skip" style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', opacity: 0.8 }}>+10s</button>
        </div>

        <div style={{ fontSize: '0.8rem', opacity: 0.6, width: '50px', textAlign: 'right' }}>{formatTime(duration)}</div>
      </div>
    </div>
  );
}
