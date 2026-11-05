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

/** #rgb, #rrggbb, hsl(...) and rgb(...) to [r,g,b] (0-255); null for anything else (var(), named colours). */
function parseColor(color: string): [number, number, number] | null {
  const c = color.trim();
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const raw = hex[1].length === 3 ? hex[1].split('').map((ch) => ch + ch).join('') : hex[1];
    return [parseInt(raw.slice(0, 2), 16), parseInt(raw.slice(2, 4), 16), parseInt(raw.slice(4, 6), 16)];
  }
  const rgb = c.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hsl = c.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/i);
  if (hsl) {
    const h = Number(hsl[1]) % 360;
    const s = Number(hsl[2]) / 100;
    const l = Number(hsl[3]) / 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  }
  return null;
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/**
 * Subject colours are chosen freely in the Subjects sheet, so a pale one (light yellow, mint) is unreadable as
 * text on the white cards. Keep the hue but darken it until it reaches a ~3.5:1 contrast against white.
 * Accepts hex, hsl() and rgb(); anything else is returned unchanged. Use for text; keep the original colour for fills and borders.
 */
export function readableTextColor(color: string, minContrast = 3.5): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const contrast = (c: [number, number, number]) => 1.05 / (luminance(c) + 0.05);
  if (contrast(rgb) >= minContrast) return color;
  let k = 1;
  let out = rgb;
  while (contrast(out) < minContrast && k > 0) {
    k = Math.max(0, k - 0.04);
    out = [Math.round(rgb[0] * k), Math.round(rgb[1] * k), Math.round(rgb[2] * k)];
  }
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function subjectBadgeStyle(color: string, alphaSuffix: ColorAlphaSuffix = '20') {
  return {
    backgroundColor: colorWithAlpha(color, alphaSuffix),
    color: readableTextColor(color),
  } as const;
}

export const hexWithAlpha = colorWithAlpha;
