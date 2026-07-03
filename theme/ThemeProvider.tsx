/**
 * Theme provider + useTheme hook.
 *
 * Resolves the active theme from the OS color scheme (useColorScheme). The
 * whole app reads colors through useTheme() so a scheme change re-themes every
 * subscribed screen with no per-component wiring.
 *
 * DECISION FOR SEAN — manual override: this ships following the OS ('system'
 * mode) only. The wiring point for a manual light/dark/system setting is marked
 * below (setAppearance / appearance). A settings toggle would call
 * setAppearance and persist the choice; that is intentionally NOT enabled yet
 * because the default-appearance decision (system vs dark-first, given the
 * near-black brand ground) is Sean's to make.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import {
  FONTS,
  MOTION,
  RADIUS,
  SPACE,
  THEME_COLORS,
  TYPE,
  type ThemeColors,
  type ThemeName,
} from '@/theme/tokens';

export type Theme = {
  name: ThemeName;
  colors: ThemeColors;
  fonts: typeof FONTS;
  type: typeof TYPE;
  space: typeof SPACE;
  radius: typeof RADIUS;
  motion: typeof MOTION;
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();

  // MANUAL-OVERRIDE WIRING POINT (Sean's decision):
  // Today the resolved appearance follows the OS ('system'). To ship a manual
  // toggle, replace this with a stored preference of 'light' | 'dark' | 'system'
  // and resolve: preference === 'system' ? scheme : preference.
  const appearance: ThemeName = scheme === 'light' ? 'light' : 'dark';

  const theme = useMemo<Theme>(
    () => ({
      name: appearance,
      colors: THEME_COLORS[appearance],
      fonts: FONTS,
      type: TYPE,
      space: SPACE,
      radius: RADIUS,
      motion: MOTION,
    }),
    [appearance],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Read the active theme. Must be used under ThemeProvider. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }
  return theme;
}
