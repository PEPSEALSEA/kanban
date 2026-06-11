export type AudioItem = {
  url: string;
  fileId: string;
  filename: string;
};

export function parseAudioItems(audioUrl?: string, audioFileId?: string): AudioItem[] {
  const urlStr = (audioUrl || '').trim();
  const fileIdStr = (audioFileId || '').trim();
  if (!urlStr && !fileIdStr) return [];

  if (urlStr.includes(',')) {
    const fileIds = fileIdStr ? fileIdStr.split(',') : [];
    return urlStr.split(',').filter(Boolean).map((entry, i) => {
      const parts = entry.split('#');
      const url = parts[0].replace(/[{}]/g, '').trim();
      const filename = parts.length >= 2 ? decodeURIComponent(parts[1]) : `Audio ${i + 1}`;
      const fileId = parts.length >= 3
        ? decodeURIComponent(parts[2]).replace(/[{}]/g, '').trim()
        : (fileIds[i] || '').replace(/[{}]/g, '').split('#')[0].trim();
      return { url, fileId, filename };
    });
  }

  if (urlStr.includes('#')) {
    const parts = urlStr.split('#');
    return [{
      url: parts[0].replace(/[{}]/g, '').trim(),
      filename: parts[1] ? decodeURIComponent(parts[1]) : 'Audio',
      fileId: parts[2]
        ? decodeURIComponent(parts[2]).replace(/[{}]/g, '').trim()
        : fileIdStr.replace(/[{}]/g, '').split('#')[0].trim(),
    }];
  }

  return [{
    url: urlStr.replace(/[{}]/g, '').split('#')[0].trim(),
    filename: 'Audio',
    fileId: fileIdStr.replace(/[{}]/g, '').split('#')[0].trim(),
  }];
}

export function makeAudioEntry(url: string, filename: string, fileId: string): string {
  return `${url}#${encodeURIComponent(filename)}#${fileId}`;
}

export function audioItemsToStorage(items: string[]): { audio_url: string; audio_file_id: string } {
  const audio_url = items.join(',');
  const audio_file_id = items.map((item) => {
    const parts = item.split('#');
    if (parts.length >= 3) return decodeURIComponent(parts[2]);
    return parts[0].replace(/[{}]/g, '').split('#')[0].trim();
  }).filter(Boolean).join(',');
  return { audio_url, audio_file_id };
}

export function audioItemsFromContent(audioUrl?: string, audioFileId?: string): string[] {
  return parseAudioItems(audioUrl, audioFileId).map((item) =>
    makeAudioEntry(item.url, item.filename, item.fileId)
  );
}
