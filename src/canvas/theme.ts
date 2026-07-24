// Three ceremony themes, cycled with T, persisted to localStorage.
// To add: extend THEMES with every color key in Theme.colors.

import {
  createContext,
  useContext,
  type ReactNode,
  createElement
} from 'react';

export type Theme = {
  name: string;
  colors: {
    bg: number;
    bgStripe: number;
    border: number;
    accent: number;
    text: number;
    textMuted: number;
    // Semantic pill palette. Deliberately FLAT, not a per-percentage
    // gradient: from ceremony distance a 12-bucket score ramp reads as
    // noise (the same 1500 points showed lime on one problem and olive on
    // another, purely because the problems' maxima differed). Four colours
    // carry all the meaning the audience needs: solved / partial / failed /
    // pending — untried renders as a ghost outline, no fill colour.
    pillPending: number;
    pillFail: number;
    pillPartial: number;
    pillSolved: number;
  };
  // Each theme picks colour + alpha that BRIGHTENS its row against its own
  // background. Accent-at-0.32 darkens light surfaces, so light themes pick
  // a highlighter-pen yellow instead.
  markedRow: { color: number; alpha: number };
  pillColorForClass(scoreClass: string, isPending: boolean): number;
};

// scoring.ts still emits the fine-grained score_N_M classes; themes just
// collapse every intermediate bucket onto one partial colour.
const MID_BUCKET_RE = /^score_\d+_\d+$/;

function buildTheme(
  name: string,
  colors: Theme['colors'],
  markedRow: Theme['markedRow']
): Theme {
  return {
    name,
    colors,
    markedRow,
    pillColorForClass(scoreClass, isPending) {
      if (isPending) return colors.pillPending;
      if (scoreClass === 'score_100') return colors.pillSolved;
      if (MID_BUCKET_RE.test(scoreClass)) return colors.pillPartial;
      // score_0 and anything unknown: fail red (defensive fallback).
      return colors.pillFail;
    }
  };
}

// Terminal: dark navy + cyan.
const TERMINAL: Theme = buildTheme(
  'Terminal',
  {
    bg: 0x0b1220,
    bgStripe: 0x111a2e,
    border: 0x1f2a3f,
    accent: 0x22d3ee,
    text: 0xe2e8f0,
    textMuted: 0x94a3b8,
    pillPending: 0x8b5cf6,
    pillFail: 0xef4444,
    pillPartial: 0xfbbf24,
    pillSolved: 0x10b981
  },
  { color: 0x22d3ee, alpha: 0.32 }
);

// Newsprint: paper-white with cobalt accent. Pill lightness capped so white
// pill labels stay legible (the perennial yellow-with-white-text problem).
const NEWSPRINT: Theme = buildTheme(
  'Newsprint',
  {
    bg: 0xf9fafc,
    bgStripe: 0xedeff4,
    border: 0xc4c8d6,
    accent: 0x1a4ec0,
    text: 0x1f2433,
    textMuted: 0x6d738b,
    pillPending: 0x8b3df0,
    pillFail: 0xee2939,
    pillPartial: 0xd8932a,
    pillSolved: 0x0baa53
  },
  // Highlighter yellow, not cobalt — cobalt-on-white would DARKEN the row
  // (lightness 0.42 < surface 0.985), opposite of "highlight".
  { color: 0xfde047, alpha: 0.55 }
);

// Studio: pure black + warm orange, primetime broadcast feel.
const STUDIO: Theme = buildTheme(
  'Studio',
  {
    bg: 0x000000,
    bgStripe: 0x121212,
    border: 0x2e2e2e,
    accent: 0xff7a25,
    text: 0xf5f5f5,
    textMuted: 0x9a9a9a,
    pillPending: 0x9a4dd9,
    pillFail: 0xff3838,
    pillPartial: 0xffb800,
    pillSolved: 0x00e673
  },
  { color: 0xff7a25, alpha: 0.32 }
);

export const THEMES = {
  newsprint: NEWSPRINT,
  terminal: TERMINAL,
  studio: STUDIO
} as const;

export type ThemeKey = keyof typeof THEMES;
export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];
export const DEFAULT_THEME_KEY: ThemeKey = 'newsprint';

export function cycleThemeKey(current: ThemeKey): ThemeKey {
  const idx = THEME_KEYS.indexOf(current);
  return THEME_KEYS[(idx + 1) % THEME_KEYS.length]!;
}

// Shared by operator (writes on cycle, reads on mount) and audience (reads
// for its best-guess paint before init arrives).
export const THEME_LS_KEY = 'vnoi-resolver:theme';

// Falls back to DEFAULT_THEME_KEY on missing, unknown (renamed theme from
// a previous deploy), or private-mode-storage-throws.
export function loadThemeKey(): ThemeKey {
  try {
    const saved = window.localStorage.getItem(THEME_LS_KEY);
    if (saved && saved in THEMES) return saved as ThemeKey;
  } catch {
    // localStorage can throw (private mode, quota).
  }
  return DEFAULT_THEME_KEY;
}

const ThemeContext = createContext<Theme>(NEWSPRINT);

export function ThemeProvider({
  theme,
  children
}: {
  theme: Theme;
  children: ReactNode;
}) {
  // createElement so this module stays a plain .ts file.
  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export const TEXT = {
  family:
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  // The one webfont in the stack (bundled via @fontsource in index.tsx);
  // fonts.ts waits on THIS family — the rest are always-present system
  // fallbacks that document.fonts.load can't meaningfully wait for.
  loadFamily: 'Inter'
} as const;
