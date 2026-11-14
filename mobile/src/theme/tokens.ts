/**
 * Design tokens. The colours are copied from `web/src/styles.css` (the `:root` block for light,
 * `.app-dark` for dark) so the web and mobile apps look like one product. If a colour changes
 * there, change it here too.
 *
 * Status colours always come with a written label in the UI; colour is never the only cue.
 */

export interface ColorTokens {
  background: string;
  foreground: string;
  foreground2: string;
  card: string;
  muted: string;
  mutedForeground: string;
  faint: string;
  /** Hover and selected backgrounds. */
  accent: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  primarySoft: string;
  ring: string;
  link: string;
  amber: string;
  amberSoft: string;
  amberInk: string;
  good: string;
  goodSoft: string;
  goodFill: string;
  warn: string;
  warnSoft: string;
  bad: string;
  badSoft: string;
  badFill: string;
  info: string;
  infoSoft: string;
  /** Behind a bottom sheet. */
  scrim: string;
  /** Shadow colour for raised cards. */
  shadow: string;
}

export const lightColors: ColorTokens = {
  background: '#f2f5f6',
  foreground: '#15222b',
  foreground2: '#3a4853',
  card: '#ffffff',
  muted: '#f6f8f9',
  mutedForeground: '#5c6a75',
  faint: '#a3adb5',
  accent: '#edf0f2',
  border: '#e2e7eb',
  borderStrong: '#cfd7dd',
  primary: '#0e5e61',
  primaryHover: '#0a4b4e',
  primaryForeground: '#ffffff',
  primarySoft: '#e2f0ef',
  ring: '#1f8589',
  link: '#0e5e61',
  amber: '#e3a52b',
  amberSoft: '#fcf0d6',
  amberInk: '#3b2600',
  good: '#17703f',
  goodSoft: '#e1f3e8',
  goodFill: '#22804b',
  warn: '#8a5300',
  warnSoft: '#fcefd3',
  bad: '#b1261d',
  badSoft: '#fbe5e2',
  badFill: '#c73e32',
  info: '#1d5c9b',
  infoSoft: '#e3edf9',
  scrim: 'rgba(12, 19, 22, 0.45)',
  shadow: '#0c1316',
};

export const darkColors: ColorTokens = {
  background: '#0c1316',
  foreground: '#e5ecef',
  foreground2: '#c0cbd1',
  card: '#131c20',
  muted: '#182328',
  mutedForeground: '#93a2ab',
  faint: '#52626b',
  accent: '#1d292e',
  border: '#223138',
  borderStrong: '#2f414a',
  primary: '#5cc2ba',
  primaryHover: '#7fd0c9',
  primaryForeground: '#06201f',
  primarySoft: 'rgba(92, 194, 186, 0.14)',
  ring: '#6fd3ca',
  link: '#5cc2ba',
  amber: '#efb342',
  amberSoft: 'rgba(239, 179, 66, 0.15)',
  amberInk: '#f6d48f',
  good: '#6ad19a',
  goodSoft: 'rgba(106, 209, 154, 0.13)',
  goodFill: '#23804c',
  warn: '#f1c060',
  warnSoft: 'rgba(241, 192, 96, 0.13)',
  bad: '#f39388',
  badSoft: 'rgba(243, 147, 136, 0.13)',
  badFill: '#c4453a',
  info: '#8ab9ee',
  infoSoft: 'rgba(138, 185, 238, 0.13)',
  scrim: 'rgba(0, 0, 0, 0.6)',
  shadow: '#000000',
};

/** 4-point spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

/** Smallest comfortable touch target, in points. */
export const MIN_TOUCH = 44;

/** Font family names as registered by `useFonts` (see fonts.ts). */
export const fontFamily = {
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemi: 'Figtree_600SemiBold',
  bodyBold: 'Figtree_700Bold',
  heading: 'Nunito_700Bold',
  headingHeavy: 'Nunito_800ExtraBold',
} as const;

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'small'
  | 'smallStrong'
  | 'caption'
  | 'label';

interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
}

/** Type scale. Headings use Nunito, everything else Figtree. Sizes scale with the phone's font setting. */
export const typeScale: Record<TextVariant, TypeStyle> = {
  display: { fontFamily: fontFamily.headingHeavy, fontSize: 30, lineHeight: 36 },
  title: { fontFamily: fontFamily.headingHeavy, fontSize: 24, lineHeight: 30 },
  heading: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 25 },
  subheading: { fontFamily: fontFamily.heading, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: fontFamily.bodySemi, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fontFamily.body, fontSize: 14, lineHeight: 20 },
  smallStrong: { fontFamily: fontFamily.bodySemi, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fontFamily.body, fontSize: 12, lineHeight: 16 },
  label: {
    fontFamily: fontFamily.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
  },
};

/** Largest the system font setting may scale text, so layouts do not break. */
export const MAX_FONT_SCALE = 1.5;

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ColorTokens;
}

export const lightTheme: Theme = { scheme: 'light', colors: lightColors };
export const darkTheme: Theme = { scheme: 'dark', colors: darkColors };
