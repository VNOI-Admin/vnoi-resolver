// Safe-area insets: pixels shaved off each edge of the AUDIENCE display
// because something physical covers it (a stage-curtain valance over the
// top of the hall LED wall, side drapes, a bottom edge cut by the stage
// floor). The audience scoreboard + award art render inside the remaining
// box; the bands outside are plain background, so whatever covers them is
// content-free. The operator's own view never pads — the obstruction is on
// the wall, not the laptop — the operator just owns the state and keys.
//
// Tuned live on the operator window while looking at the wall: the arrow is
// the direction the edge moves, Shift works the top/left edges, ⌥/Alt the
// bottom/right ones — pushing an edge inward grows its margin. Persisted per
// browser and synced to the audience window like the theme.
//
// AwardFit is the award image's object-fit: 'fill' stretches to the safe box
// (default — award art is authored for the full frame), 'contain' letterboxes
// it when the wall's shape would distort faces. Toggled with I.

export type SafeInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};
export type AwardFit = 'fill' | 'contain';

export const ZERO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const SAFE_INSETS_LS_KEY = 'vnoi-resolver:safe-insets';
export const AWARD_FIT_LS_KEY = 'vnoi-resolver:award-fit';
export const SAFE_INSET_STEP_PX = 10;
// Generous ceiling — a valance can swallow a lot of a short wall signal —
// but still low enough that the board never vanishes entirely.
export const SAFE_INSET_MAX_PX = 400;

export function clampInset(px: number): number {
  if (!Number.isFinite(px)) return 0;
  return Math.min(SAFE_INSET_MAX_PX, Math.max(0, Math.round(px)));
}

export function nudgeInset(
  insets: SafeInsets,
  edge: keyof SafeInsets,
  deltaPx: number
): SafeInsets {
  const next = clampInset(insets[edge] + deltaPx);
  // Same reference on a clamped no-op (key held at the 0/max stop) so React
  // bails out instead of re-broadcasting + re-persisting every autorepeat.
  return next === insets[edge] ? insets : { ...insets, [edge]: next };
}

export function loadSafeInsets(): SafeInsets {
  try {
    const raw = window.localStorage.getItem(SAFE_INSETS_LS_KEY);
    if (raw === null) return ZERO_INSETS;
    const p = JSON.parse(raw) as Partial<SafeInsets> | null;
    return {
      top: clampInset(Number(p?.top)),
      right: clampInset(Number(p?.right)),
      bottom: clampInset(Number(p?.bottom)),
      left: clampInset(Number(p?.left))
    };
  } catch {
    return ZERO_INSETS;
  }
}

export function saveSafeInsets(insets: SafeInsets): void {
  try {
    window.localStorage.setItem(SAFE_INSETS_LS_KEY, JSON.stringify(insets));
  } catch {
    // localStorage may be disabled; the insets still work in-memory.
  }
}

export function loadAwardFit(): AwardFit {
  try {
    return window.localStorage.getItem(AWARD_FIT_LS_KEY) === 'contain'
      ? 'contain'
      : 'fill';
  } catch {
    return 'fill';
  }
}

export function saveAwardFit(fit: AwardFit): void {
  try {
    window.localStorage.setItem(AWARD_FIT_LS_KEY, fit);
  } catch {
    // localStorage may be disabled; the toggle still works in-memory.
  }
}
