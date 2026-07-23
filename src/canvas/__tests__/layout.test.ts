import { describe, expect, it } from 'vitest';

import {
  BOARD_MIN_CLAMP_WIDTH,
  boardContentWidth,
  computeLayout
} from '../layout';

describe('boardContentWidth', () => {
  it('keeps full-bleed on 16:9 and narrower viewports (no regression)', () => {
    expect(boardContentWidth(1920, 1080)).toBe(1920);
    expect(boardContentWidth(1512, 982)).toBe(1512); // MacBook logical
    expect(boardContentWidth(1280, 800)).toBe(1280);
    expect(boardContentWidth(1024, 1366)).toBe(1024); // portrait
  });

  it('pillarboxes wider-than-16:9 viewports to a 16:9 content frame', () => {
    // 3440×1440 ultrawide: 1440 * 16/9 = 2560.
    expect(boardContentWidth(3440, 1440)).toBe(2560);
    // 2:1: 2560×1280 → 1280 * 16/9 ≈ 2276.
    expect(boardContentWidth(2560, 1280)).toBe(Math.round((1280 * 16) / 9));
  });

  it('floors the clamp so a short wall signal never squeezes the board', () => {
    // ~2.4:1 hall wall, 1920×790: 790 * 16/9 ≈ 1404 < floor → 1600.
    expect(boardContentWidth(1920, 790)).toBe(BOARD_MIN_CLAMP_WIDTH);
    expect(boardContentWidth(1920, 400)).toBe(BOARD_MIN_CLAMP_WIDTH);
  });

  it('never exceeds the viewport, even under the floor', () => {
    expect(boardContentWidth(1200, 500)).toBe(1200);
    expect(boardContentWidth(800, 300)).toBe(800);
  });

  it('drives computeLayout to a totalWidth that fits the clamped frame', () => {
    const w = boardContentWidth(1920, 790);
    const layout = computeLayout(w, 8);
    expect(layout.totalWidth).toBe(w);
    // Pills stay inside the name column at the clamped width.
    const last = layout.problems[7]!;
    expect(last.x + last.w).toBeLessThanOrEqual(layout.name.x + layout.name.w);
  });
});
