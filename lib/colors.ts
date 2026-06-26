const HEX_ALPHA = {
  '15': 0x15 / 255,
  '20': 0x20 / 255,
  '22': 0x22 / 255,
  '30': 0x30 / 255,
  '44': 0x44 / 255,
} as const;

type HexAlphaSuffix = keyof typeof HEX_ALPHA;

export function hexWithAlpha(color: string, alphaSuffix: HexAlphaSuffix): string {
  const hex = color.trim();
  if (!hex.startsWith('#')) return color;

  const raw = hex.slice(1);
  const full =
    raw.length === 3
      ? raw.split('').map((c) => c + c).join('')
      : raw.length === 6
        ? raw
        : null;

  if (!full) return color;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${HEX_ALPHA[alphaSuffix]})`;
}
