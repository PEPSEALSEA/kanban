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
  const base = workerOrigin || APP_BASE_URL;
  const jsonUrl = `${base}/content/${encodeURIComponent(id)}.json`;
  const txtUrl = `${base}/content/${encodeURIComponent(id)}.txt`;

  return {
    id,
    date: item.date || "",
    subject: item.subject || "",
    title: item.title || "",
    description: item.description || "",
    intro,
    cards,
    attachments,
    links,
    created_at: item.created_at || "",
    viewUrl,
    jsonUrl,
    txtUrl,
    exportedAt: new Date().toISOString(),
  };
}

type ContentExport = ReturnType<typeof buildContentExport>;

export function formatContentAsText(data: ContentExport): string {
  const lines: string[] = [
    data.title,
    `Subject: ${data.subject}`,
    `Date: ${data.date}`,
    `ID: ${data.id}`,
    `View: ${data.viewUrl}`,
    "",
  ];

  const body = data.intro || data.description;
  if (body) {
    lines.push(body, "");
  }

  for (const card of data.cards) {
    lines.push(`--- Card ${card.num} ---`, card.text, "");
  }

  if (data.links.length > 0) {
    lines.push("--- Links ---");
    data.links.forEach((link, i) => lines.push(`${i + 1}. ${link}`));
    lines.push("");
  }

  if (data.attachments.length > 0) {
    lines.push("--- Attachments ---");
    data.attachments.forEach((a, i) => lines.push(`${i + 1}. ${a.title}: ${a.url}`));
    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}
