// Theme system. Three named ceremony themes, switchable at runtime via the
// `useTheme` hook + `ThemeProvider` (set up in App.tsx). The user can cycle
// themes with the `T` keyboard shortcut; choice persists in localStorage.
//
// Adding a new theme: extend `Themes`, drop it into `THEMES`, ensure every
// color key in `Theme.colors` is present.

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
    textRank: number;
    pillPending: number;
    // Score gradient 0% → 100%, ordered low to high.
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
  // Marked-row tint. Each theme picks a colour + alpha that BRIGHTENS the row
  // against its own background: a saturated accent on dark themes, a
  // highlighter-pen colour on light themes. Plain `accent at 0.32` darkens a
  // light surface — the opposite of what "highlight" should communicate.
  markedRow: { color: number; alpha: number };
  // Bound mapper — saves Pill/Row from having to redefine the lookup table.
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

// ─── Terminal ────────────────────────────────────────────────────────────
// CRT-phosphor mood. Dark navy + cyan accent + Tailwind score ramp. Digital
// medium counterpart to Newsprint (print) and Studio (broadcast) — completes
// the "three display media" family.
const TERMINAL: Theme = buildTheme(
  'Terminal',
  {
    bg: 0x0b1220,
    bgStripe: 0x111a2e,
    border: 0x1f2a3f,
    accent: 0x22d3ee, // cyan-400
    text: 0xe2e8f0,
    textMuted: 0x94a3b8,
    textRank: 0xf8fafc,
    pillPending: 0x8b5cf6, // violet-500
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
  // Cyan accent at 0.32 alpha brightens a dark-navy row — reads as a glowing
  // highlight.
  { color: 0x22d3ee, alpha: 0.32 }
);

// ─── Newsprint ───────────────────────────────────────────────────────────
// Sports-page printed on clean paper. Breaks the dark+saturated family hard:
// light surface, single confident cobalt accent, muted ink-tone score
// gradient. Paper white (not yellow cream) — barely tinted toward the cobalt
// accent so it reads as "off-white paper" rather than "aged" or "warm".
// OKLCH-anchored hex values.
const NEWSPRINT: Theme = buildTheme(
  'Newsprint',
  {
    bg: 0xf9fafc, // paper-white, faint cool lean (oklch ≈ 0.985 0.005 255)
    bgStripe: 0xedeff4, // subtle stripe (oklch ≈ 0.95 0.008 255)
    border: 0xc4c8d6, // faded grey-blue rule
    accent: 0x1a4ec0, // deep ink cobalt — the headline colour (oklch ≈ 0.42 0.17 255)
    text: 0x1f2433, // printer's ink, indigo-tinted near-black (not pure)
    textMuted: 0x6d738b, // cool gray
    textRank: 0x181b2a, // deep ink for rank prominence
    pillPending: 0x8b3df0, // electric violet — punches against white paper
    // Bright, OKLCH-balanced score gradient. Saturated enough to pop on the
    // white surface; lightness capped ≤ 0.73 so white pill labels stay legible
    // across the whole ramp (the perennial yellow-with-white-text problem).
    score_0: 0xee2939, // crimson
    score_0_10: 0xee5e1a, // vivid orange
    score_10_20: 0xee801f, // warm orange
    score_20_30: 0xd8932a, // amber
    score_30_40: 0xc7a128, // golden yellow
    score_40_50: 0xa5a920, // olive
    score_50_60: 0x6bb22b, // yellow-green
    score_60_70: 0x36b134, // apple green
    score_70_80: 0x1ba946, // rich green
    score_80_90: 0x149b45, // deeper green
    score_90_100: 0x128943, // forest
    score_100: 0x0baa53 // vivid emerald
  },
  // Highlighter-pen yellow on white paper. Cobalt-accent overlay on this
  // surface would DARKEN the row (accent lightness 0.42 < surface 0.985) —
  // the opposite of a highlight. Bright yellow brightens it.
  { color: 0xfde047, alpha: 0.55 }
);

// ─── Studio ──────────────────────────────────────────────────────────────
// Primetime broadcast / dark studio set. Pure-black BG with a warm orange
// accent breaks the cool family of the other two themes (navy+cyan,
// paper+cobalt). Pending becomes violet for palette contrast. Score gradient
// stays vivid — bright pills against near-black read like sports broadcast
// telemetry. OKLCH-anchored hex values.
const STUDIO: Theme = buildTheme(
  'Studio',
  {
    bg: 0x000000, // pure black, no tint
    bgStripe: 0x121212, // near-black neutral stripe
    border: 0x2e2e2e, // neutral mid-gray border
    accent: 0xff7a25, // bright primetime orange (oklch ≈ 0.72 0.22 50)
    text: 0xf5f5f5, // neutral near-white
    textMuted: 0x9a9a9a, // neutral gray
    textRank: 0xfafafa, // bright off-white for rank prominence
    pillPending: 0x9a4dd9, // violet — complementary to orange accent
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
  // Bright orange at 0.32 alpha brightens the near-black row — primetime glow.
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

// ─── Context ─────────────────────────────────────────────────────────────

const ThemeContext = createContext<Theme>(NEWSPRINT);

export function ThemeProvider({
  theme,
  children
}: {
  theme: Theme;
  children: ReactNode;
}) {
  // createElement instead of JSX so this module stays a plain .ts file.
  return createElement(ThemeContext.Provider, { value: theme }, children);
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

// ─── Static typography constants (theme-independent) ─────────────────────

export const TEXT = {
  family:
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  size: 14,
  rankSize: 17,
  pillSize: 13,
  denomSize: 10,
  headerSize: 13
} as const;
