import { describe, expect, it } from 'vitest';

import { HOLD_MS } from '../../lib/resolver';
import { autoplayDelayMs, nextWake } from '../scheduler';

const hold = [HOLD_MS.FAILED, HOLD_MS.SOLVED_MOVE, HOLD_MS.SELECT_TEAM];

describe('autoplayDelayMs', () => {
  it('fires immediately at cursor 0 (no prior event to hold for)', () => {
    expect(autoplayDelayMs(0, hold, 1)).toBe(0);
  });

  it('holds for the event whose aftermath is on screen (cursor - 1)', () => {
    expect(autoplayDelayMs(1, hold, 1)).toBe(HOLD_MS.FAILED);
    expect(autoplayDelayMs(2, hold, 1)).toBe(HOLD_MS.SOLVED_MOVE);
    expect(autoplayDelayMs(3, hold, 1)).toBe(HOLD_MS.SELECT_TEAM);
  });

  it('scales inversely with playback speed', () => {
    expect(autoplayDelayMs(2, hold, 2)).toBe(HOLD_MS.SOLVED_MOVE / 2);
    expect(autoplayDelayMs(2, hold, 0.5)).toBe(HOLD_MS.SOLVED_MOVE * 2);
  });

  it('falls back to DEFAULT when the index is out of range', () => {
    expect(autoplayDelayMs(99, hold, 1)).toBe(HOLD_MS.DEFAULT);
    expect(autoplayDelayMs(1, [], 1)).toBe(HOLD_MS.DEFAULT);
  });
});

describe('nextWake', () => {
  it('on resume (prev null) anchors to now + the on-screen event hold', () => {
    const w = nextWake(null, 2, hold, 1, 1000);
    expect(w).toEqual({
      scheduledCursor: 2,
      wakeMs: 1000 + HOLD_MS.SOLVED_MOVE
    });
  });

  it('on resume at cursor 0 fires immediately (no prior hold)', () => {
    expect(nextWake(null, 0, hold, 1, 5000)).toEqual({
      scheduledCursor: 0,
      wakeMs: 5000
    });
  });

  it('advances the target by exactly one hold when the cursor moves', () => {
    const prev = { scheduledCursor: 1, wakeMs: 2000 };
    const w = nextWake(prev, 2, hold, 1, 9999);
    // Accrues onto the existing target, NOT onto `now` — slop doesn't compound.
    expect(w).toEqual({
      scheduledCursor: 2,
      wakeMs: 2000 + HOLD_MS.SOLVED_MOVE
    });
  });

  it('does NOT advance on a same-cursor re-invocation (the speed-drag guard)', () => {
    // This is the regression guard: a speed change re-runs the effect with the
    // same cursor; the target must stay put, not race seconds ahead.
    const prev = { scheduledCursor: 2, wakeMs: 2000 };
    const after = nextWake(prev, 2, hold, 5, 123456);
    expect(after).toBe(prev);
  });
});
