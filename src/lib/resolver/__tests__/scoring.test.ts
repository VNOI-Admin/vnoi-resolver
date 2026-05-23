import { describe, expect, it } from 'vitest';
import { getScoreClass } from '../scoring';

describe('getScoreClass', () => {
  it('classifies zero as score_0', () => {
    expect(getScoreClass(0, 100)).toBe('score_0');
  });

  it('classifies full credit as score_100', () => {
    expect(getScoreClass(100, 100)).toBe('score_100');
  });

  it('maps mid-range ratios to the right 10% bucket', () => {
    expect(getScoreClass(5, 100)).toBe('score_0_10');
    expect(getScoreClass(15, 100)).toBe('score_10_20');
    expect(getScoreClass(50, 100)).toBe('score_50_60');
    expect(getScoreClass(55, 100)).toBe('score_50_60');
    expect(getScoreClass(99, 100)).toBe('score_90_100');
  });

  it('places exact decade boundaries in the upper bucket', () => {
    // 30/100 = 0.3 → floor(3) = 3 → score_30_40 (not score_20_30).
    expect(getScoreClass(30, 100)).toBe('score_30_40');
    expect(getScoreClass(70, 100)).toBe('score_70_80');
  });

  it('handles fractional ratios near 100%', () => {
    expect(getScoreClass(99.999, 100)).toBe('score_90_100');
  });

  it('clamps userPoints > problemPoints to score_90_100', () => {
    expect(getScoreClass(120, 100)).toBe('score_90_100');
  });

  it('returns score_0 for zero-on-zero (problem with no max defined)', () => {
    expect(getScoreClass(0, 0)).toBe('score_0');
  });

  it('treats non-zero score on a zero-max problem as full credit', () => {
    expect(getScoreClass(50, 0)).toBe('score_100');
  });
});
