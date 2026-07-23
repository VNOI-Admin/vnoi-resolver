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
    pillPending: number;
    // Score gradient, low → high.
    score_0: number;
    score_0_10: number;
    score_10_20: number;
    score_20_30: number;
    score_30_40: number;
    score_40_50: number;
    score_50_60: number;
    score_60_70: number;
    score_70_80: number;
    score_80_90: number;
    score_90_100: number;
    score_100: number;
  };
  // Each theme picks colour + alpha that BRIGHTENS its row against its own
  // background. Accent-at-0.32 darkens light surfaces, so light themes pick
  // a highlighter-pen yellow instead.
  markedRow: { color: number; alpha: number };
  pillColorForClass(scoreClass: string, isPending: boolean): number;
};

function buildTheme(
  name: string,
  colors: Theme['colors'],
  markedRow: Theme['markedRow']
): Theme {
  const byClass: Record<string, number> = {
    score_0: colors.score_0,
    score_0_10: colors.score_0_10,
    score_10_20: colors.score_10_20,
    score_20_30: colors.score_20_30,
    score_30_40: colors.score_30_40,
    score_40_50: colors.score_40_50,
    score_50_60: colors.score_50_60,
    score_60_70: colors.score_60_70,
    score_70_80: colors.score_70_80,
    score_80_90: colors.score_80_90,
    score_90_100: colors.score_90_100,
    score_100: colors.score_100
  };
  return {
    name,
    colors,
    markedRow,
    pillColorForClass(scoreClass, isPending) {
      if (isPending) return colors.pillPending;
      return byClass[scoreClass] ?? colors.score_0;
    }
  };
}

// Terminal: dark navy + cyan, Tailwind score ramp.
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
    score_0: 0xef4444,
    score_0_10: 0xf97316,
    score_10_20: 0xfb923c,
    score_20_30: 0xfbbf24,
    score_30_40: 0xfacc15,
    score_40_50: 0xeab308,
    score_50_60: 0xa3e635,
    score_60_70: 0x84cc16,
    score_70_80: 0x4ade80,
    score_80_90: 0x22c55e,
    score_90_100: 0x16a34a,
    score_100: 0x10b981
  },
  { color: 0x22d3ee, alpha: 0.32 }
);

// Newsprint: paper-white with cobalt accent. Score gradient lightness
// capped ≤ 0.73 so white pill labels stay legible across the whole ramp
// (the perennial yellow-with-white-text problem).
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
    score_0: 0xee2939,
    score_0_10: 0xee5e1a,
    score_10_20: 0xee801f,
    score_20_30: 0xd8932a,
    score_30_40: 0xc7a128,
    score_40_50: 0xa5a920,
    score_50_60: 0x6bb22b,
    score_60_70: 0x36b134,
    score_70_80: 0x1ba946,
    score_80_90: 0x149b45,
    score_90_100: 0x128943,
    score_100: 0x0baa53
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
    score_0: 0xff3838,
    score_0_10: 0xff6b1a,
    score_10_20: 0xff8c1a,
    score_20_30: 0xffb800,
    score_30_40: 0xffd000,
    score_40_50: 0xf0e000,
    score_50_60: 0xa0e835,
    score_60_70: 0x76d428,
    score_70_80: 0x3fc864,
    score_80_90: 0x1eb472,
    score_90_100: 0x14a366,
    score_100: 0x00e673
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
