const APP_BASE_URL = "https://pepsealsea.github.io/kanban";

type ContentCard = { num: string; text: string };

export function parseContentDescription(desc?: string) {
  const source = desc ?? "";
  const regex = /\[Card\s*(\d+):\s*([\s\S]*?)\]/g;
  const cards: ContentCard[] = [];
  let intro = source;

  const matches = Array.from(source.matchAll(regex));
  if (matches.length > 0) {
    const firstMatchIndex = source.indexOf(matches[0][0]);
    intro = source.substring(0, firstMatchIndex).trim();
    matches.forEach((match) => {
      cards.push({ num: match[1], text: match[2].trim() });
    });
  }

  return { intro, cards };
}

export function parseAudioItems(audioUrl?: string, audioFileId?: string) {
  const urlStr = (audioUrl || "").trim();
  const fileIdStr = (audioFileId || "").trim();
  if (!urlStr && !fileIdStr) return [];

  if (urlStr.includes(",")) {
    const fileIds = fileIdStr ? fileIdStr.split(",") : [];
    return urlStr.split(",").filter(Boolean).map((entry, i) => {
      const parts = entry.split("#");
      const url = parts[0].replace(/[{}]/g, "").trim();
      const filename = parts.length >= 2 ? decodeURIComponent(parts[1]) : `Audio ${i + 1}`;
      const fileId = parts.length >= 3
        ? decodeURIComponent(parts[2]).replace(/[{}]/g, "").trim()
        : (fileIds[i] || "").replace(/[{}]/g, "").split("#")[0].trim();
      return { url, fileId, filename };
    });
  }

  if (urlStr.includes("#")) {
    const parts = urlStr.split("#");
    return [{
      url: parts[0].replace(/[{}]/g, "").trim(),
      filename: parts[1] ? decodeURIComponent(parts[1]) : "Audio",
      fileId: parts[2]
        ? decodeURIComponent(parts[2]).replace(/[{}]/g, "").trim()
        : fileIdStr.replace(/[{}]/g, "").split("#")[0].trim(),
    }];
  }

  return [{
    url: urlStr.replace(/[{}]/g, "").split("#")[0].trim(),
    filename: "Audio",
    fileId: fileIdStr.replace(/[{}]/g, "").split("#")[0].trim(),
  }];
}

function parseAttachmentEntry(url: string) {
  const parts = url.split("#");
  const decodedUrl = parts[0];
  let title = "Attachment";
  let fileId: string | undefined;

  if (parts.length >= 2) title = decodeURIComponent(parts[1]);
  if (parts.length >= 3) fileId = decodeURIComponent(parts[2]);

  return { url: decodedUrl, title, fileId };
}

export function buildContentExport(item: Record<string, string>, workerOrigin?: string) {
  const { intro, cards } = parseContentDescription(item.description);
  const id = String(item.id || "");

  const attachments = (item.attachments || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseAttachmentEntry);

  const links = (item.links || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const viewUrl = `${APP_BASE_URL}/content#/view?id=${encodeURIComponent(id)}`;
  const jsonUrl = workerOrigin
    ? `${workerOrigin}/content/${encodeURIComponent(id)}.json`
    : `${APP_BASE_URL}/content/${encodeURIComponent(id)}.json`;

  return {
    id,
    date: item.date || "",
    subject: item.subject || "",
    title: item.title || "",
    description: item.description || "",
    intro,
    cards,
    audio: parseAudioItems(item.audio_url, item.audio_file_id),
    attachments,
    links,
    created_at: item.created_at || "",
    viewUrl,
    jsonUrl,
    exportedAt: new Date().toISOString(),
  };
}
