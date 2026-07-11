import { describe, expect, it } from 'vitest';

import { lerpColor, tweenColorNow, type ColorTween } from '../colorTween';

const tween = (
  fromColor: number,
  toColor: number,
  start: number
): ColorTween => ({
  fromColor,
  toColor,
  start
});

describe('lerpColor', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
  });

  it('interpolates each channel independently', () => {
    // round(255 * 0.5) = 128 = 0x80 per channel
    expect(lerpColor(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(lerpColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});

describe('tweenColorNow', () => {
  it('returns the target colour when no tween is in flight', () => {
    expect(
      tweenColorNow(tween(0x123456, 0x123456, 0), 0xabcdef, 500, 9999)
    ).toBe(0xabcdef);
  });

  it('interpolates an active tween (and ignores the target arg)', () => {
    const t = tween(0x000000, 0xffffff, 1000);
    expect(tweenColorNow(t, 0x111111, 500, 1000)).toBe(0x000000); // elapsed 0
    expect(tweenColorNow(t, 0x111111, 500, 1500)).toBe(0xffffff); // elapsed = duration
  });

  it('applies the ease-out curve, not a linear ramp', () => {
    // easeOutCubic(0.5) = 1 - 0.5^3 = 0.875 → round(255*0.875)=223=0xdf
    const t = tween(0x000000, 0xffffff, 1000);
    expect(tweenColorNow(t, 0x000000, 500, 1250)).toBe(0xdfdfdf);
  });

  it('clamps elapsed beyond the duration to the end colour', () => {
    const t = tween(0x000000, 0xffffff, 1000);
    expect(tweenColorNow(t, 0x111111, 500, 999_999)).toBe(0xffffff);
  });

  // Both pill writers (the draw prop and the per-frame tick) paint through this
  // one function with the same args, so they cannot disagree — the regression
  // where a mid-tween redraw flashed the start colour is structurally gone.
});
