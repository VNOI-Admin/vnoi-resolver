import { describe, expect, it } from 'vitest';

import {
  isTweenDone,
  isTweening,
  retarget,
  tweenProgress,
  tweenValue
} from '../tween';

const linear = (x: number) => x;
const D = 1000;

describe('idleTween / isTweening', () => {
  it('an idle tween holds a constant value and is not tweening', () => {
    const t = { from: 42, to: 42, start: 0 };
    expect(isTweening(t)).toBe(false);
    expect(tweenValue(t, 0, D, linear)).toBe(42);
    expect(tweenValue(t, 999999, D, linear)).toBe(42);
    expect(isTweenDone(t, 0, D)).toBe(true);
  });
});

describe('tweenValue / tweenProgress', () => {
  it('interpolates linearly across the duration', () => {
    const t = { from: 0, to: 100, start: 1000 };
    expect(tweenValue(t, 1000, D, linear)).toBe(0);
    expect(tweenValue(t, 1500, D, linear)).toBe(50);
    expect(tweenValue(t, 2000, D, linear)).toBe(100);
  });

  it('clamps progress to [0, 1] outside the window', () => {
    const t = { from: 0, to: 100, start: 1000 };
    expect(tweenProgress(t, 500, D)).toBe(0); // before start
    expect(tweenProgress(t, 9999, D)).toBe(1); // long after
    expect(tweenValue(t, 9999, D, linear)).toBe(100);
  });

  it('applies the easing function', () => {
    const ease = (x: number) => x * x;
    const t = { from: 0, to: 100, start: 0 };
    expect(tweenValue(t, 500, D, ease)).toBe(25); // 0.5^2 * 100
  });
});

describe('isTweenDone', () => {
  it('is done once elapsed reaches the duration', () => {
    const t = { from: 0, to: 100, start: 1000 };
    expect(isTweenDone(t, 1999, D)).toBe(false);
    expect(isTweenDone(t, 2000, D)).toBe(true);
  });
});

describe('retarget', () => {
  it('does NOT jump the value at the hand-off instant (the bug class)', () => {
    // Mid-flight, re-aim somewhere new. The new tween, evaluated at the same
    // `now`, must show exactly the value that was on screen — no visible snap.
    const t = { from: 0, to: 100, start: 1000 };
    const now = 1400; // 40% through
    const shown = tweenValue(t, now, D, linear); // 40
    const re = retarget(shown, 500, now);
    expect(tweenValue(re, now, D, linear)).toBe(shown);
    expect(re.start).toBe(now); // clock restarted
    expect(re.to).toBe(500);
  });

  it('re-anchors the clock so a duration change does not snap past the end', () => {
    // Speed-slider case: same target, new (shorter) duration mid-flight. Resume
    // from the shown value so progress restarts at 0 under the new duration.
    const t = { from: 0, to: 100, start: 1000 };
    const now = 1400;
    const re = retarget(tweenValue(t, now, D, linear), 100, now);
    expect(tweenValue(re, now, 200, linear)).toBe(40);
    expect(tweenValue(re, now + 200, 200, linear)).toBe(100);
  });

  it('starts a fresh flight from the given resting value', () => {
    const re = retarget(70, 130, 5000);
    expect(tweenValue(re, 5000, D, linear)).toBe(70);
    expect(tweenValue(re, 5500, D, linear)).toBe(100);
    expect(isTweening(re)).toBe(true);
  });
});
