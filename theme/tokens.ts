/**
 * Regent design-system tokens (iOS).
 *
 * Single source of truth for color, type, spacing, radius, and motion, derived
 * from the canonical brand tokens in
 * design-system/design_system_tokens.json (platform brand) + STYLE.md. The
 * source uses oklch; React Native cannot parse oklch, so the neutral scale and
 * accents are converted to sRGB hex here (conversion verified against the
 * STYLE.md hex bands, e.g. dark bg oklch(14.5% 0 0) -> #0a0a0a, light bg
 * oklch(98.5% 0 0) -> #fafafa).
 *
 * Hard cutover: this replaces the old static constants/Colors.ts palette as the
 * token layer. Identity lives in the accent, artwork, and marks — the ground is
 * a hueless neutral scale, never tinted toward a product hue.
 */

export type ThemeName = 'light' | 'dark';

/** Semantic color roles. Every screen consumes these, never raw hex. */
export type ThemeColors = {
  // Grounds and surfaces (near-black in dark; warm-free near-white in light).
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  // Foreground.
  text: string;
  textMuted: string;
  // One accent per surface (platform = regent blue).
  accent: string;
  onAccent: string;
  // Status — state only, never identity.
  success: string;
  error: string;
  warning: string;
  info: string;
  // Hairline separators mixed from the foreground (structure vs interactive edge).
  hairline: string;
  hairlineStrong: string;
  // Tinted status washes derived per theme (accent/status at low alpha).
  accentWash: string;
  successWash: string;
  errorWash: string;
  warningWash: string;
  // Glass card treatment over artwork.
  glassSurface: string;
  glassBorder: string;
  // Stronger stroke for opaque glass (Reduce Transparency) and contrast edges.
  contrastStroke: string;
};

/** "#rrggbb" -> "r, g, b" for rgba() washes. */
export function hexToRgb(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

// Platform-brand neutral scale + accents, sRGB hex from the oklch source.
const DARK: ThemeColors = {
  bg: '#0a0a0a',
  surface: '#101010',
  surfaceElevated: '#171717',
  border: '#333333',
  text: '#f5f5f5',
  textMuted: '#a1a1a1',
  accent: '#4ba8e0',
  onAccent: '#0a0a0a',
  success: '#69ba7c',
  error: '#f2897c',
  warning: '#ebb25f',
  info: '#4ba8e0',
  // Hairlines: foreground (#f5f5f5) at 14% / 26%.
  hairline: 'rgba(245, 245, 245, 0.14)',
  hairlineStrong: 'rgba(245, 245, 245, 0.26)',
  accentWash: 'rgba(75, 168, 224, 0.16)',
  successWash: 'rgba(105, 186, 124, 0.16)',
  errorWash: 'rgba(242, 137, 124, 0.16)',
  warningWash: 'rgba(235, 178, 95, 0.16)',
  // Glass: elevated surface at ~92% over artwork, subtle border.
  glassSurface: 'rgba(23, 23, 23, 0.92)',
  glassBorder: 'rgba(51, 51, 51, 0.55)',
  contrastStroke: 'rgba(245, 245, 245, 0.4)',
};

const LIGHT: ThemeColors = {
  bg: '#fafafa',
  surface: '#f5f5f5',
  surfaceElevated: '#fdfdfd',
  border: '#d1d1d1',
  text: '#1b1b1b',
  textMuted: '#585858',
  accent: '#005f92',
  onAccent: '#fafafa',
  success: '#005e26',
  error: '#9e231e',
  warning: '#8a5700',
  info: '#005f92',
  // Hairlines: foreground (#1b1b1b) at 14% / 26%.
  hairline: 'rgba(27, 27, 27, 0.14)',
  hairlineStrong: 'rgba(27, 27, 27, 0.26)',
  accentWash: 'rgba(0, 95, 146, 0.10)',
  successWash: 'rgba(0, 94, 38, 0.10)',
  errorWash: 'rgba(158, 35, 30, 0.10)',
  warningWash: 'rgba(138, 87, 0, 0.10)',
  glassSurface: 'rgba(253, 253, 253, 0.92)',
  glassBorder: 'rgba(209, 209, 209, 0.55)',
  contrastStroke: 'rgba(27, 27, 27, 0.4)',
};

export const THEME_COLORS: Record<ThemeName, ThemeColors> = { light: LIGHT, dark: DARK };

/**
 * Font roles (design_system_stripped_liveview_ios.md): title = Geist Pixel
 * Circle (headers, display numbers), ui = Geist Pixel Square (body, labels).
 * Keep the logical role names stable even though the bundle registration names
 * are the two pixel faces already loaded in the app.
 */
export const FONTS = {
  /** Titles, headlines, display numbers. */
  title: 'GeistPixel-Circle',
  /** App body, labels, captions. */
  ui: 'GeistPixel-Square',
} as const;

/** Type scale (px), from --type-*-size / --type-*-line. */
export const TYPE = {
  display: { size: 40, line: 48 },
  title: { size: 24, line: 32 },
  headline: { size: 18, line: 26 },
  body: { size: 16, line: 24 },
  label: { size: 14, line: 20 },
  caption: { size: 13, line: 18 },
  code: { size: 14, line: 20 },
} as const;

/** Spacing scale (px), from --space-*. */
export const SPACE = {
  s0: 0,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 24,
  s6: 32,
  s7: 48,
} as const;

/** Radius scale (px), from --radius-*. */
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 9999,
} as const;

/**
 * Motion tokens, from --duration-* / --ease-*. Animate only transform and
 * opacity; enters use easeOut, on-screen moves use easeInOut; pressables scale
 * to activeScale on press. Keyboard-triggered UI never animates.
 */
export const MOTION = {
  durationFast: 140,
  durationBase: 200,
  durationSlow: 280,
  // react-native-reanimated / Easing bezier control points.
  easeOut: [0.23, 1, 0.32, 1] as const,
  easeInOut: [0.77, 0, 0.175, 1] as const,
  activeScale: 0.97,
} as const;
