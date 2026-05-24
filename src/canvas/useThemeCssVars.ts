import { useLayoutEffect } from 'react';

import { THEMES, type ThemeKey } from './theme';

// Bridge Pixi theme → HTML chrome. Every non-canvas CSS rule reads from a
// fixed set of CSS variables on :root; this hook keeps them in lockstep.
// Also paints document.body.background so any gap the canvas leaves
// (mid-tween, mask edges, DPR rounding) shows the theme colour through.
//
// useLayoutEffect (not useEffect) so the CSS vars are committed BEFORE
// the first paint. With useEffect the Suspense fallback during the lazy
// load of Scoreboard.tsx would flash in default-theme colors for one
// frame before the vars caught up.
export function useThemeCssVars(themeKey: ThemeKey): void {
  useLayoutEffect(() => {
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const root = document.documentElement.style;
    const theme = THEMES[themeKey];
    document.body.style.background = hex(theme.colors.bg);
    root.setProperty('--ui-surface', hex(theme.colors.bg));
    root.setProperty('--ui-surface-elevated', hex(theme.colors.bgStripe));
    root.setProperty('--ui-text', hex(theme.colors.text));
    root.setProperty('--ui-text-muted', hex(theme.colors.textMuted));
    root.setProperty('--ui-accent', hex(theme.colors.accent));
    root.setProperty('--ui-border', hex(theme.colors.border));
  }, [themeKey]);
}
