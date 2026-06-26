const HEX_ALPHA = {
  '15': 0x15 / 255,
  '20': 0x20 / 255,
  '22': 0x22 / 255,
  '30': 0x30 / 255,
  '44': 0x44 / 255,
} as const;

export type ColorAlphaSuffix = keyof typeof HEX_ALPHA;

function hexToRgba(hex: string, alpha: number): string | null {
  const raw = hex.slice(1);
  const full =
    raw.length === 3
      ? raw.split('').map((c) => c + c).join('')
      : raw.length === 6
        ? raw
        : null;

  if (!full) return null;

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function colorWithAlpha(color: string, alphaSuffix: ColorAlphaSuffix): string {
  const c = color.trim();
  const alpha = HEX_ALPHA[alphaSuffix];

  if (c.startsWith('#')) {
    return hexToRgba(c, alpha) ?? c;
  }

  const hsl = c.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (hsl) {
    return `hsla(${hsl[1]}, ${hsl[2]}%, ${hsl[3]}%, ${alpha})`;
  }

  const rgb = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) {
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  }

  return `color-mix(in srgb, ${c} ${Math.round(alpha * 100)}%, transparent)`;
}

export function subjectBadgeStyle(color: string, alphaSuffix: ColorAlphaSuffix = '20') {
  return {
    backgroundColor: colorWithAlpha(color, alphaSuffix),
    color,
  } as const;
}

export const hexWithAlpha = colorWithAlpha;
