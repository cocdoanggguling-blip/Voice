import type { ReaderTheme } from '../types/reader';

export const DEFAULT_UI_COLOR = '#06b6d4';

export interface UiColorPreset {
  id: string;
  label: string;
  color: string;
}

export const UI_COLOR_PRESETS: UiColorPreset[] = [
  { id: 'cyan', label: 'Cyan (Default)', color: '#06b6d4' },
  { id: 'teal', label: 'Teal Laut', color: '#00838f' },
  { id: 'sky', label: 'Biru Langit', color: '#0284c7' },
  { id: 'cobalt', label: 'Biru Kobalt', color: '#2563eb' },
  { id: 'indigo', label: 'Indigo', color: '#4f46e5' },
  { id: 'violet', label: 'Ungu', color: '#9333ea' },
  { id: 'emerald', label: 'Zamrud', color: '#059669' },
  { id: 'rose', label: 'Merah Muda', color: '#e11d48' },
  { id: 'amber', label: 'Emas', color: '#d97706' },
];

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export function normalizeHexColor(
  input?: string | null,
  fallback: string = DEFAULT_UI_COLOR
): string {
  if (!input || typeof input !== 'string') return fallback;
  const trimmed = input.trim().toLowerCase();
  const shortMatch = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const fullMatch = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  if (fullMatch) {
    return `#${fullMatch[1].toLowerCase()}`;
  }
  return fallback;
}

export function hexToRgb(hex: string): RgbColor {
  const clean = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RgbColor): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const lig = Math.max(0, Math.min(1, l));

  if (sat === 0) {
    const val = Math.round(lig * 255);
    return { r: val, g: val, b: val };
  }

  const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
  const p = 2 * lig - q;
  const hk = hue / 360;

  const hueToChannel = (tInput: number) => {
    let t = tInput;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return {
    r: Math.round(hueToChannel(hk + 1 / 3) * 255),
    g: Math.round(hueToChannel(hk) * 255),
    b: Math.round(hueToChannel(hk - 1 / 3) * 255),
  };
}

export function hslToHex(hsl: HslColor): string {
  return rgbToHex(hslToRgb(hsl));
}

export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const linearize = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function getContrastRatio(hexA: string, hexB: string): number {
  const lumA = getRelativeLuminance(hexA);
  const lumB = getRelativeLuminance(hexB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getReadableTextColor(bgHex: string): '#ffffff' | '#07171c' {
  const whiteContrast = getContrastRatio('#ffffff', bgHex);
  if (whiteContrast >= 4.5) return '#ffffff';
  const darkContrast = getContrastRatio('#07171c', bgHex);
  return darkContrast >= whiteContrast ? '#07171c' : '#ffffff';
}

export function mixHexColors(hexA: string, hexB: string, weightA: number): string {
  const w = Math.max(0, Math.min(1, weightA));
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r * w + b.r * (1 - w),
    g: a.g * w + b.g * (1 - w),
    b: a.b * w + b.b * (1 - w),
  });
}

export function isLightThemeSurface(
  readerTheme: ReaderTheme,
  customBg?: string
): boolean {
  if (readerTheme === 'light' || readerTheme === 'sepia') return true;
  if (readerTheme === 'custom' && customBg) {
    return getRelativeLuminance(normalizeHexColor(customBg, '#faf6ee')) > 0.38;
  }
  return false;
}

export function buildUiThemeVars(
  rawUiColor: string | undefined,
  readerTheme: ReaderTheme,
  customBg?: string
): Record<string, string> {
  const baseHex = normalizeHexColor(rawUiColor, DEFAULT_UI_COLOR);
  const hsl = rgbToHsl(hexToRgb(baseHex));
  const isNeutral = hsl.s < 0.12;
  const lightSurface = isLightThemeSurface(readerTheme, customBg);

  // Header & Footer Primary Bar (--nv-teal): rich saturated color with crisp >=4.5:1 white text
  let barLightness = Math.max(0.2, Math.min(0.32, hsl.l));
  if (readerTheme === 'amoled') {
    barLightness = Math.max(0.16, Math.min(0.24, barLightness));
  }
  const barSat = isNeutral ? hsl.s : Math.max(0.62, Math.min(0.95, hsl.s));
  let barColor = hslToHex({ h: hsl.h, s: barSat, l: barLightness });

  // Guarantee white text contrast >= 4.5 on barColor (especially for yellow/green hues)
  for (let step = 0; step < 8 && getContrastRatio('#ffffff', barColor) < 4.5; step++) {
    barLightness = Math.max(0.14, barLightness - 0.03);
    barColor = hslToHex({ h: hsl.h, s: barSat, l: barLightness });
  }

  const barDeepColor = mixHexColors(
    barColor,
    '#000000',
    readerTheme === 'amoled' ? 0.64 : 0.78
  );
  const barTextColor = getReadableTextColor(barColor);

  // High-contrast bright highlight inside dark/colored AppBar/Footer (e.g. IMPOR, BACA, underline, seekbar)
  const barHighlight = isNeutral
    ? '#e2e8f0'
    : hslToHex({
        h: hsl.h,
        s: Math.max(0.75, Math.min(0.98, hsl.s)),
        l: 0.68,
      });
  const barHighlightText = getReadableTextColor(barHighlight);

  // Adaptive UI Accent for cards/dialogs/switches/chips (works cleanly on BOTH dark & light reading themes)
  let surfaceAccent: string;
  if (lightSurface) {
    let accentL = Math.max(0.26, Math.min(0.36, hsl.l));
    const accentS = isNeutral ? hsl.s : Math.max(0.68, Math.min(0.95, hsl.s));
    surfaceAccent = hslToHex({ h: hsl.h, s: accentS, l: accentL });
    for (let step = 0; step < 6 && getContrastRatio('#ffffff', surfaceAccent) < 4.5; step++) {
      accentL = Math.max(0.18, accentL - 0.03);
      surfaceAccent = hslToHex({ h: hsl.h, s: accentS, l: accentL });
    }
  } else {
    const accentS = isNeutral ? hsl.s : Math.max(0.74, Math.min(0.96, hsl.s));
    surfaceAccent = hslToHex({
      h: hsl.h,
      s: accentS,
      l: Math.max(0.56, Math.min(0.66, hsl.l > 0.56 ? hsl.l : 0.6)),
    });
  }
  const surfaceAccentText = getReadableTextColor(surfaceAccent);

  const sectionCyan = lightSurface
    ? surfaceAccent
    : isNeutral
      ? '#cbd5e1'
      : hslToHex({ h: hsl.h, s: Math.max(0.76, hsl.s), l: 0.65 });

  // Chrome & sheet row harmonization
  const vars: Record<string, string> = {
    '--nv-teal': barColor,
    '--nv-teal-deep': barDeepColor,
    '--nv-teal-text': barTextColor,
    '--nv-gold': surfaceAccent,
    '--nv-cyan': sectionCyan,
    '--nv-ui-accent': surfaceAccent,
    '--nv-ui-accent-text': surfaceAccentText,
    '--nv-ui-bar-highlight': barHighlight,
    '--nv-ui-bar-highlight-text': barHighlightText,
  };

  if (readerTheme === 'dark' || readerTheme === 'twilight') {
    const accentRgb = hexToRgb(surfaceAccent);
    vars['--nv-chrome-bg'] = mixHexColors(baseHex, '#0b1014', 0.12);
    vars['--nv-chrome-card'] = mixHexColors(baseHex, '#151c22', 0.15);
    vars['--nv-chrome-border'] = 'rgba(200, 224, 232, 0.14)';
    vars['--nv-sheet-row-active'] = mixHexColors(baseHex, '#2c3035', 0.22);
    vars['--nv-accent'] = surfaceAccent;
    vars['--nv-accent-soft'] = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25)`;
  } else if (readerTheme === 'amoled') {
    const accentRgb = hexToRgb(surfaceAccent);
    vars['--nv-chrome-bg'] = '#000000';
    vars['--nv-chrome-card'] = mixHexColors(baseHex, '#0c1014', 0.09);
    vars['--nv-sheet-row-active'] = mixHexColors(baseHex, '#22242a', 0.2);
    vars['--nv-accent'] = surfaceAccent;
    vars['--nv-accent-soft'] = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.25)`;
  } else if (readerTheme === 'light' || readerTheme === 'sepia') {
    const accentRgb = hexToRgb(surfaceAccent);
    vars['--nv-chrome-bg'] = mixHexColors(
      baseHex,
      readerTheme === 'sepia' ? '#efe6d0' : '#f1f5f7',
      0.06
    );
    vars['--nv-chrome-card'] = readerTheme === 'sepia' ? '#faf4e4' : '#ffffff';
    vars['--nv-sheet-row-active'] = mixHexColors(
      baseHex,
      readerTheme === 'sepia' ? '#f5ecd7' : '#ffffff',
      0.16
    );
    vars['--nv-accent'] = surfaceAccent;
    vars['--nv-accent-soft'] = `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.2)`;
  }

  return vars;
}
