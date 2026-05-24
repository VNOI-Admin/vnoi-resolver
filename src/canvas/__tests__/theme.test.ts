import { describe, expect, it } from 'vitest';
import {
  THEMES,
  THEME_KEYS,
  DEFAULT_THEME_KEY,
  cycleThemeKey,
  type Theme
} from '../theme';

// Every key required by Theme.colors. Kept here as a literal so adding a new
// colour field to Theme without populating it in every theme blows up loudly.
const REQUIRED_COLOR_KEYS: (keyof Theme['colors'])[] = [
  'bg',
  'bgStripe',
  'border',
  'accent',
  'text',
  'textMuted',
  'textRank',
  'pillPending',
  'score_0',
  'score_0_10',
  'score_10_20',
  'score_20_30',
  'score_30_40',
  'score_40_50',
  'score_50_60',
  'score_60_70',
  'score_70_80',
  'score_80_90',
  'score_90_100',
  'score_100'
];

const isValidColor = (n: unknown): boolean =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 0xffffff;

describe('theme registry', () => {
  it.each(THEME_KEYS)('%s defines every required colour key', (key) => {
    const theme = THEMES[key];
    for (const ck of REQUIRED_COLOR_KEYS) {
      expect(
        isValidColor(theme.colors[ck]),
        `${key}.colors.${ck} should be a 0xRRGGBB int`
      ).toBe(true);
    }
  });

  it.each(THEME_KEYS)('%s has a name', (key) => {
    expect(THEMES[key].name).toBeTruthy();
  });

  it.each(THEME_KEYS)('%s has a valid markedRow overlay', (key) => {
    const mr = THEMES[key].markedRow;
    expect(isValidColor(mr.color)).toBe(true);
    expect(mr.alpha).toBeGreaterThan(0);
    expect(mr.alpha).toBeLessThanOrEqual(1);
  });

  it.each(THEME_KEYS)('%s.pillColorForClass returns a valid colour', (key) => {
    const theme = THEMES[key];
    // Pending always returns pillPending.
    expect(theme.pillColorForClass('whatever', true)).toBe(
      theme.colors.pillPending
    );
    // Each known score class maps to its bucket.
    expect(theme.pillColorForClass('score_100', false)).toBe(
      theme.colors.score_100
    );
    expect(theme.pillColorForClass('score_0', false)).toBe(
      theme.colors.score_0
    );
    // Unknown class falls back to score_0 (defensive, see buildTheme).
    expect(theme.pillColorForClass('not_a_class', false)).toBe(
      theme.colors.score_0
    );
  });

  it('DEFAULT_THEME_KEY is a valid theme', () => {
    expect(THEME_KEYS).toContain(DEFAULT_THEME_KEY);
  });

  it('cycleThemeKey rotates through all themes and wraps around', () => {
    let key = THEME_KEYS[0]!;
    const seen = new Set<string>();
    for (let i = 0; i < THEME_KEYS.length; i++) {
      seen.add(key);
      key = cycleThemeKey(key);
    }
    expect(seen.size).toBe(THEME_KEYS.length);
    // After N cycles, we're back at the start.
    expect(key).toBe(THEME_KEYS[0]);
  });

  it('cycleThemeKey on an unknown key returns the first registered theme', () => {
    // Defensive: a stale localStorage value of a since-renamed theme shouldn't
    // crash. THEME_KEYS.indexOf(unknown) = -1, (-1 + 1) % N = 0 → first theme.
    const next = cycleThemeKey('not-a-theme' as never);
    expect(next).toBe(THEME_KEYS[0]);
  });
});
