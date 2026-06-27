'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useData } from '@/components/DataProvider';
import { useUiVersion } from '@/components/UiVersionProvider';

interface AudioPlayerProps {
  contentId: string;
  contentType?: 'learning_content' | 'homework';
  audioUrl?: string;
  driveId?: string;
  title?: string;
}

function AudioPlayerInner({
  contentId,
  contentType = 'learning_content',
  audioUrl,
  driveId,
  title,
}: AudioPlayerProps) {
  const { isExperimental } = useUiVersion();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showStatus, setShowStatus] = useState<string>('');
  const [jumpInput, setJumpInput] = useState('');

  const directUrl = audioUrl?.replace(/[{}]/g, '').split('#')[0].trim() || '';
  const [currentSrc, setCurrentSrc] = useState(directUrl.startsWith('http') ? directUrl : '');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchSecuredAudioLink = async () => {
    if (!driveId) return '';
    const { API_URL } = await import('@/lib/config');
    const { authHeaders } = await import('@/lib/auth');
    const params = new URLSearchParams({
      action: 'getFreshLink',
      fileId: driveId.replace(/[{}]/g, '').split('#')[0].trim(),
      contentId,
      contentType,
    });
    const res = await fetch(`${API_URL}?${params}`, { headers: authHeaders() });
    const data = (await res.json()) as { success?: boolean; url?: string; data?: { url?: string } };
    return data.data?.url || data.url || '';
  };

  useEffect(() => {
    const httpUrl = audioUrl?.replace(/[{}]/g, '').split('#')[0].trim() || '';
    if (httpUrl.startsWith('http')) {
      setCurrentSrc(httpUrl);
      return;
    }

    if (!driveId) {
      setCurrentSrc('');
      return;
    }

    let cancelled = false;
    setIsRefreshing(true);
    fetchSecuredAudioLink()
      .then((url) => {
        if (!cancelled && url) setCurrentSrc(url);
      })
      .catch((err) => console.error('Failed to load audio link:', err))
      .finally(() => {
        if (!cancelled) setIsRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audioUrl, driveId, contentId, contentType]);

  const handleAudioError = async () => {
    if (driveId && !isRefreshing) {
      const lastPos = audioRef.current?.currentTime || currentTime;
      setIsRefreshing(true);
      try {
        const url = await fetchSecuredAudioLink();
        if (url) {
          setCurrentSrc(url);
          setShowStatus('Link refreshed — resuming…');
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = lastPos;
            }
            setShowStatus('');
          }, 1500);
        }
      } catch (err) {
        console.error('Failed to refresh audio link:', err);
      } finally {
        setIsRefreshing(false);
      }
    }
  };

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

  useEffect(() => {
    const interval = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        localStorage.setItem(`audio_pos_${contentId}`, audioRef.current.currentTime.toString());
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [contentId]);

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

  const progressPct = duration ? (currentTime / duration) * 100 : 0;

  if (isExperimental) {
    return (
      <div className="exp-audio-player">
        {isRefreshing && (
          <div className="exp-audio-player__overlay">
            <div className="exp-audio-player__spinner" />
            <span>Refreshing link…</span>
          </div>
        )}

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

        <div className="exp-audio-player__header">
          <div className="exp-audio-player__meta">
            {title && <p className="exp-audio-player__title">{title}</p>}
            <span className="exp-audio-player__source">
              {audioUrl?.includes('telegram') ? 'Telegram' : 'Drive'}
            </span>
            {showStatus && <p className="exp-audio-player__status">{showStatus}</p>}
          </div>
          <a href={currentSrc} target="_blank" rel="noreferrer" className="exp-audio-player__download">
            Download
          </a>
        </div>

        <div className="exp-audio-player__progress" onClick={handleProgressClick}>
          <div className="exp-audio-player__progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="exp-audio-player__controls">
          <span className="exp-audio-player__time">{formatTime(currentTime)}</span>

          <div className="exp-audio-player__buttons">
            <button type="button" onClick={() => skip(-10)} className="exp-audio-player__skip">
              −10s
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="exp-audio-player__play"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '‖' : '▶'}
            </button>
            <button type="button" onClick={() => skip(10)} className="exp-audio-player__skip">
              +10s
            </button>
          </div>

          <span className="exp-audio-player__time exp-audio-player__time--end">{formatTime(duration)}</span>
        </div>

        <form onSubmit={handleJump} className="exp-audio-player__jump">
          <label className="exp-audio-player__jump-label">Jump to time</label>
          <div className="exp-audio-player__jump-row">
            <input
              type="text"
              placeholder="1:30 or 90"
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              className="exp-input exp-audio-player__jump-input"
            />
            <button type="submit" className="exp-btn exp-btn--secondary exp-btn--sm">
              Go
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="neo-card rounded-2xl p-5 md:p-6 relative overflow-hidden border border-slate-200/80 shadow-sm">
      {isRefreshing && (
        <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-slate-200 border-t-sky-500 rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Refreshing link…</span>
        </div>
      )}

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

      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          {title && <p className="text-sm font-semibold text-slate-800 mb-1 line-clamp-2">{title}</p>}
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {audioUrl?.includes('telegram') ? 'Telegram' : 'Drive'}
          </span>
          {showStatus && <p className="text-xs font-medium text-sky-600 mt-1">{showStatus}</p>}
        </div>
        <a
          href={currentSrc}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-slate-500 hover:text-sky-600 transition-colors shrink-0"
        >
          Download
        </a>
      </div>

      <div
        onClick={handleProgressClick}
        className="w-full h-2 bg-slate-100 rounded-full cursor-pointer mb-5 overflow-hidden"
      >
        <div
          className="h-full bg-sky-500 rounded-full transition-[width] duration-100"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="flex justify-between items-center gap-4">
        <span className="text-xs font-semibold text-slate-500 tabular-nums w-10">{formatTime(currentTime)}</span>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => skip(-10)} className="neo-button px-3 py-1.5 text-xs rounded-lg">
            −10s
          </button>
          <button
            type="button"
            onClick={togglePlay}
            className="w-12 h-12 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-sm hover:bg-sky-600 transition-colors"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <span className="text-sm font-bold">‖</span> : <span className="text-sm ml-0.5">▶</span>}
          </button>
          <button type="button" onClick={() => skip(10)} className="neo-button px-3 py-1.5 text-xs rounded-lg">
            +10s
          </button>
        </div>

        <span className="text-xs font-semibold text-slate-500 tabular-nums w-10 text-right">{formatTime(duration)}</span>
      </div>

      <form
        onSubmit={handleJump}
        className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3"
      >
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Jump to time</label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="1:30 or 90"
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            className="w-24 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-200"
          />
          <button type="submit" className="neo-button px-3 py-1.5 text-xs rounded-lg">
            Go
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AudioPlayer(props: AudioPlayerProps) {
  const { canAccessAudio } = useData();

  const hasAudio = Boolean(
    props.driveId?.replace(/[{}]/g, '').split('#')[0].trim() ||
    props.audioUrl?.replace(/[{}]/g, '').trim()
  );

  if (!hasAudio || !canAccessAudio) return null;

  return <AudioPlayerInner {...props} />;
}
