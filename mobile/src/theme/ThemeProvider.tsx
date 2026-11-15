import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

/** A display preference only. Nothing about a child or an account is ever kept here. */
export const THEME_PREF_KEY = 'pref.theme';

interface ThemeContextValue {
  theme: Theme;
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: lightTheme,
  preference: 'system',
  setPreference: () => undefined,
});

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'system' || v === 'light' || v === 'dark';

export function ThemeProvider({
  children,
  initialPreference = 'system',
}: {
  children: ReactNode;
  initialPreference?: ThemePreference;
}) {
  const system = useColorScheme();
  const [preference, setPreferenceState] =
    useState<ThemePreference>(initialPreference);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(THEME_PREF_KEY)
      .then((stored) => {
        if (!cancelled && isPreference(stored)) setPreferenceState(stored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    AsyncStorage.setItem(THEME_PREF_KEY, value).catch(() => undefined);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme = preference === 'system' ? (system ?? 'light') : preference;
    return {
      theme: scheme === 'dark' ? darkTheme : lightTheme,
      preference,
      setPreference,
    };
  }, [preference, system, setPreference]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext).theme;
export const useThemePreference = () => {
  const { preference, setPreference } = useContext(ThemeContext);
  return { preference, setPreference };
};
