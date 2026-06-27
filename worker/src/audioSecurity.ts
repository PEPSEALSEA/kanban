type AudioAccessLevel = 'none' | 'playback' | 'full';

export function resolveAudioAccessLevel(
  email: string | undefined,
  permittedEmails: string[],
  isAdmin: (e: string) => boolean
): AudioAccessLevel {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return 'none';
  if (isAdmin(normalized)) return 'full';
  if (permittedEmails.some((e) => e.trim().toLowerCase() === normalized)) return 'playback';
  return 'none';
}

/** Strip Telegram URLs; keep only #filename#fileId metadata for client parsing. */
export function sanitizeAudioUrlField(audioUrl?: string, audioFileId?: string): string {
  const urlStr = (audioUrl || '').trim();
  const fileIdStr = (audioFileId || '').trim();
  if (!urlStr && !fileIdStr) return '';

  const entries: string[] = [];

  if (urlStr.includes(',')) {
    const fileIds = fileIdStr ? fileIdStr.split(',') : [];
    urlStr.split(',').filter(Boolean).forEach((entry, i) => {
      const parts = entry.split('#');
      const filename = parts.length >= 2 ? parts[1] : `Audio ${i + 1}`;
      const fileId = parts.length >= 3
        ? parts[2]
        : (fileIds[i] || '').replace(/[{}]/g, '').trim();
      if (fileId) entries.push(`#${filename}#${fileId}`);
    });
    return entries.join(',');
  }

  if (urlStr.includes('#')) {
    const parts = urlStr.split('#');
    const filename = parts[1] || 'Audio';
    const fileId = parts[2] || fileIdStr.replace(/[{}]/g, '').split('#')[0].trim();
    if (fileId) return `#${filename}#${fileId}`;
    return '';
  }

  if (fileIdStr) {
    const fileId = fileIdStr.replace(/[{}]/g, '').split('#')[0].trim();
    if (fileId) return `#Audio#${fileId}`;
  }

  return '';
}

export function sanitizeLearningContentItem(
  item: Record<string, string>,
  level: AudioAccessLevel
): Record<string, string> {
  const hasAudio = Boolean((item.audio_url || '').trim() || (item.audio_file_id || '').trim());
  const withFlag = { ...item, has_audio: hasAudio ? '1' : '' };

  if (level === 'full') return withFlag;
  if (level === 'none') {
  }
  return {
    ...withFlag,
    audio_url: sanitizeAudioUrlField(item.audio_url, item.audio_file_id),
    audio_file_id: item.audio_file_id || '',
  };
}

export function sanitizeLearningContentList(
  items: Record<string, string>[],
  level: AudioAccessLevel
): Record<string, string>[] {
  return items.map((item) => sanitizeLearningContentItem(item, level));
}
