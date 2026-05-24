import { describe, expect, it } from 'vitest';
import type { InputData, ResolverEvent } from '../../lib/resolver';
import {
  buildLookupCtx,
  describeEvent,
  formatElapsed,
  formatRankDelta,
  summariseNow
} from '../format';

const sampleData: InputData = {
  users: [
    { userId: 1, username: 'alice', fullName: 'Alice Nguyen' },
    { userId: 2, username: 'bob', fullName: 'Bob Tran' }
  ],
  problems: [
    { problemId: 10, name: 'Min Path', points: 1000 },
    { problemId: 11, name: 'Tree Sum', points: 800 }
  ],
  submissions: [
    {
      submissionId: 100,
      userId: 1,
      problemId: 10,
      time: 1234,
      points: 700
    },
    {
      submissionId: 101,
      userId: 1,
      problemId: 11,
      time: 2300,
      points: 0
    }
  ]
};

describe('formatElapsed', () => {
  it('renders MM:SS under an hour', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(59_000)).toBe('00:59');
    expect(formatElapsed(60_000)).toBe('01:00');
    expect(formatElapsed(125_000)).toBe('02:05');
    expect(formatElapsed(59 * 60_000 + 59_000)).toBe('59:59');
  });

  it('switches to H:MM:SS over an hour', () => {
    expect(formatElapsed(60 * 60_000)).toBe('1:00:00');
    expect(formatElapsed(2 * 60 * 60_000 + 5 * 60_000 + 7_000)).toBe('2:05:07');
  });

  it('clamps negative input to zero', () => {
    expect(formatElapsed(-1_000)).toBe('00:00');
  });
});

describe('formatRankDelta', () => {
  it('arrow up for rank improvement', () => {
    expect(formatRankDelta('15', '8')).toBe('15 → 8 ▲7');
  });
  it('arrow down for rank loss', () => {
    expect(formatRankDelta('5', '12')).toBe('5 → 12 ▼7');
  });
  it('collapses to just the rank when unchanged', () => {
    // No arrow, no duplicate number — "10 → 10" is visual noise.
    expect(formatRankDelta('10', '10')).toBe('10');
  });
  it('em-dash on empty input', () => {
    expect(formatRankDelta('', '10')).toBe('—');
    expect(formatRankDelta('10', '')).toBe('—');
  });
  it('lenient parse still computes delta when tie markers are present', () => {
    // `parseInt('1=', 10)` is 1 — the trailing tie marker doesn't block
    // the numeric comparison, so we still get a meaningful direction.
    expect(formatRankDelta('1=', '2')).toBe('1= → 2 ▼1');
  });
  it('falls back to plain arrow when ranks have no leading digits', () => {
    expect(formatRankDelta('abc', '5')).toBe('abc → 5');
  });
});

describe('describeEvent', () => {
  const ctx = buildLookupCtx(sampleData);

  it('mark_user includes both names', () => {
    const desc = describeEvent(
      { kind: 'mark_user', userId: 1, rowIndex: 0 },
      ctx
    );
    expect(desc.long).toContain('Alice Nguyen');
    expect(desc.long).toContain('alice');
  });

  it('mark_problem carries expected points', () => {
    const desc = describeEvent(
      {
        kind: 'mark_problem',
        userId: 1,
        problemId: 10,
        submissionId: 100
      },
      ctx
    );
    expect(desc.long).toContain('Alice Nguyen');
    expect(desc.long).toContain('Min Path');
    expect(desc.expectedPoints).toBe(700);
    expect(desc.problemPoints).toBe(1000);
  });

  it('resolve flags non-zero as dramatic, zero as not', () => {
    const dramatic = describeEvent(
      { kind: 'resolve', userId: 1, submissionId: 100 },
      ctx
    );
    expect(dramatic.dramatic).toBe(true);

    const fizzle = describeEvent(
      { kind: 'resolve', userId: 1, submissionId: 101 },
      ctx
    );
    expect(fizzle.dramatic).toBe(false);
  });

  it('show_award is always dramatic and quotes the rank', () => {
    const desc = describeEvent(
      { kind: 'show_award', rank: '3', imageSrc: 'data:...' },
      ctx
    );
    expect(desc.dramatic).toBe(true);
    expect(desc.long).toContain('3');
  });

  it('end is dramatic with a clear label', () => {
    const desc = describeEvent({ kind: 'end' }, ctx);
    expect(desc.dramatic).toBe(true);
    expect(desc.long.toLowerCase()).toContain('final');
  });

  it('unknown user id degrades gracefully without throwing', () => {
    const desc = describeEvent(
      { kind: 'mark_user', userId: 99, rowIndex: 0 },
      ctx
    );
    expect(desc.long).toContain('99');
  });
});

describe('summariseNow', () => {
  const ctx = buildLookupCtx(sampleData);

  // Realistic prefix: camera lands on Alice, marks her Problem 10, resolves
  // it. Cursor sits at 3 (after the resolve).
  const events: ResolverEvent[] = [
    { kind: 'mark_user', userId: 1, rowIndex: 1 },
    {
      kind: 'mark_problem',
      userId: 1,
      problemId: 10,
      submissionId: 100
    },
    { kind: 'resolve', userId: 1, submissionId: 100 }
  ];

  it('returns the latest mark_user as the active user', () => {
    const s = summariseNow(events, 3, ctx);
    expect(s.activeUserId).toBe(1);
  });

  it('returns the latest resolve as lastResolve description', () => {
    const s = summariseNow(events, 3, ctx);
    // The latest resolve event is the Problem 10 resolve at submissionId 100
    // (700 points). Its description carries the points readout.
    expect(s.lastResolve?.expectedPoints).toBe(700);
    expect(s.lastResolve?.long).toContain('Min Path');
  });

  it('cursor at 0 means no history', () => {
    const s = summariseNow(events, 0, ctx);
    expect(s.activeUserId).toBeNull();
    expect(s.lastResolve).toBeNull();
  });

  it('end clears active user', () => {
    const withEnd: ResolverEvent[] = [...events, { kind: 'end' }];
    const s = summariseNow(withEnd, withEnd.length, ctx);
    expect(s.activeUserId).toBeNull();
  });
});
