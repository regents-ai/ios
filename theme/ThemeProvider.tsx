/**
 * Theme provider + useTheme hook.
 *
 * The whole app reads colors through useTheme() so a scheme or preference
 * change re-themes every subscribed screen with no per-component wiring.
 *
 * Appearance preference (Sean's decisions): 'light' | 'dark' | 'system',
 * default 'system' (follow the OS). The choice is persisted to AsyncStorage.
 * Effective scheme = preference === 'system' ? useColorScheme() : preference.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
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

/** The user's appearance choice. 'system' follows the OS color scheme. */
export type AppearancePreference = 'light' | 'dark' | 'system';

const APPEARANCE_KEY = 'regents:appearance';

export type Theme = {
  name: ThemeName;
  colors: ThemeColors;
  fonts: typeof FONTS;
  type: typeof TYPE;
  space: typeof SPACE;
  radius: typeof RADIUS;
  motion: typeof MOTION;
  /** The stored preference (may be 'system'). */
  appearance: AppearancePreference;
  /** Set and persist the appearance preference. */
  setAppearance: (next: AppearancePreference) => void;
};

const ThemeContext = createContext<Theme | null>(null);

function isAppearancePreference(value: unknown): value is AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<AppearancePreference>('system');

  // Rehydrate the persisted preference on mount.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APPEARANCE_KEY)
      .then((stored) => {
        if (active && isAppearancePreference(stored)) {
          setAppearanceState(stored);
        }
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  const theme = useMemo<Theme>(() => {
    // Effective scheme: 'system' follows the OS; light/dark are explicit.
    const name: ThemeName = appearance === 'system' ? (scheme === 'light' ? 'light' : 'dark') : appearance;
    const setAppearance = (next: AppearancePreference) => {
      setAppearanceState(next);
      void AsyncStorage.setItem(APPEARANCE_KEY, next).catch(() => null);
    };

    return {
      name,
      colors: THEME_COLORS[name],
      fonts: FONTS,
      type: TYPE,
      space: SPACE,
      radius: RADIUS,
      motion: MOTION,
      appearance,
      setAppearance,
    };
  }, [appearance, scheme]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** Read the active theme. Must be used within ThemeProvider. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }
  return theme;
}
