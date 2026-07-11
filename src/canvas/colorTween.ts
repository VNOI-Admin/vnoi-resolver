// Pure colour-tween math for pills, separated from the Pixi component so BOTH
// writers (the declarative draw prop and the per-frame tick) compute colour
// through ONE function — they can't drift and flash the wrong colour on a
// redraw mid-tween. No Pixi imports, so it unit-tests in plain node.

import { easeOutCubic } from './easing';

export type ColorTween = { fromColor: number; toColor: number; start: number };

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

// The colour the pill should show right now. When no tween is in flight
// (fromColor === toColor) it's just the current target; otherwise it's the
// eased interpolation at `now`. Called by both the draw prop and the tick.
export function tweenColorNow(
  tween: ColorTween,
  targetColor: number,
  durationMs: number,
  now: number
): number {
  if (tween.fromColor === tween.toColor) return targetColor;
  const t = Math.min(1, (now - tween.start) / durationMs);
  return lerpColor(tween.fromColor, tween.toColor, easeOutCubic(t));
}
