import { describe, expect, it } from 'vitest';

import type { HoldClass, ResolverEvent } from '../../lib/resolver';
import {
  nextAwardCursor,
  prevAwardCursor,
  nextMoveCursor,
  prevMoveCursor
} from '../seek';

// Synthetic event log: indices 0..7. Awards at 2 and 5.
const events: ResolverEvent[] = [
  { kind: 'mark_user', userId: 1, rowIndex: 7 },
  { kind: 'resolve', userId: 1, submissionId: 10 },
  { kind: 'show_award', rank: '8', imageSrc: 'a' },
  { kind: 'mark_user', userId: 2, rowIndex: 6 },
  { kind: 'resolve', userId: 2, submissionId: 11 },
  { kind: 'show_award', rank: '7', imageSrc: 'b' },
  { kind: 'mark_user', userId: 3, rowIndex: 5 },
  { kind: 'end' }
];

// Rank-changes (SOLVED_MOVE) at indices 1 and 4; everything else some other
// class.
const eventClass: HoldClass[] = [
  'SELECT_TEAM',
  'SOLVED_MOVE',
  'DEFAULT',
  'SELECT_TEAM',
  'SOLVED_MOVE',
  'DEFAULT',
  'SELECT_TEAM',
  'DEFAULT'
];

describe('seek: awards', () => {
  it('nextAwardCursor finds the first award strictly after the cursor', () => {
    expect(nextAwardCursor(events, 0)).toBe(2);
    expect(nextAwardCursor(events, 2)).toBe(5); // skips the one we're sitting on
    expect(nextAwardCursor(events, 3)).toBe(5);
  });

  it('nextAwardCursor returns null past the last award', () => {
    expect(nextAwardCursor(events, 5)).toBeNull();
    expect(nextAwardCursor(events, 7)).toBeNull();
  });

  it('prevAwardCursor finds the last award strictly before the cursor', () => {
    expect(prevAwardCursor(events, 7)).toBe(5);
    expect(prevAwardCursor(events, 5)).toBe(2); // skips the one we're sitting on
    expect(prevAwardCursor(events, 3)).toBe(2);
  });

  it('prevAwardCursor returns null before the first award', () => {
    expect(prevAwardCursor(events, 2)).toBeNull();
    expect(prevAwardCursor(events, 0)).toBeNull();
  });
});

describe('seek: rank changes', () => {
  it('nextMoveCursor finds the first SOLVED_MOVE strictly after the cursor', () => {
    expect(nextMoveCursor(eventClass, 0)).toBe(1);
    expect(nextMoveCursor(eventClass, 1)).toBe(4);
    expect(nextMoveCursor(eventClass, 3)).toBe(4);
  });

  it('nextMoveCursor returns null past the last move', () => {
    expect(nextMoveCursor(eventClass, 4)).toBeNull();
    expect(nextMoveCursor(eventClass, 7)).toBeNull();
  });

  it('prevMoveCursor finds the last SOLVED_MOVE strictly before the cursor', () => {
    expect(prevMoveCursor(eventClass, 7)).toBe(4);
    expect(prevMoveCursor(eventClass, 4)).toBe(1);
    expect(prevMoveCursor(eventClass, 3)).toBe(1);
  });

  it('prevMoveCursor returns null before the first move', () => {
    expect(prevMoveCursor(eventClass, 1)).toBeNull();
    expect(prevMoveCursor(eventClass, 0)).toBeNull();
  });
});

describe('seek: empty / degenerate', () => {
  it('returns null on an empty log', () => {
    expect(nextAwardCursor([], 0)).toBeNull();
    expect(prevAwardCursor([], 0)).toBeNull();
    expect(nextMoveCursor([], 0)).toBeNull();
    expect(prevMoveCursor([], 0)).toBeNull();
  });
});
