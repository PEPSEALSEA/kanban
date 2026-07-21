export type ContentCard = {
  num: string;
  text: string;
};

export type ParsedContentDescription = {
  intro: string;
  cards: ContentCard[];
};

export function extractH1Title(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (!match) return null;
  const title = match[1].trim();
  return title || null;
}

export function parseContentDescription(desc?: string): ParsedContentDescription {
  const source = desc ?? '';
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
