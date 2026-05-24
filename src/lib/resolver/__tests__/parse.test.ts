import { describe, expect, it } from 'vitest';
import { parseInputData } from '../parse';

describe('parseInputData', () => {
  const baseShape = {
    users: [{ userId: 1, username: 'a', fullName: 'A' }],
    problems: [{ problemId: 10, name: 'P', points: 100 }]
  };

  it('parses string times to numbers, integerized', () => {
    // Times are floored to whole seconds. Penalty-equality rank-grouping in
    // ranking.ts uses strict `!==`, so fractional times would split
    // otherwise-tied contestants into separate ranks; real data is
    // second-resolution anyway, and flooring at the parse boundary makes
    // the invariant explicit.
    const raw = {
      ...baseShape,
      submissions: [
        {
          submissionId: 1,
          userId: 1,
          problemId: 10,
          time: '2342.178705',
          points: 50
        }
      ]
    };
    const parsed = parseInputData(raw);
    expect(parsed.submissions[0]!.time).toBe(2342);
    expect(typeof parsed.submissions[0]!.time).toBe('number');
  });

  it('floors fractional numeric times', () => {
    const raw = {
      ...baseShape,
      submissions: [
        {
          submissionId: 1,
          userId: 1,
          problemId: 10,
          time: 67.5,
          points: 100
        }
      ]
    };
    expect(parseInputData(raw).submissions[0]!.time).toBe(67);
  });

  it('truncates malformed numeric prefixes loudly instead of silently', () => {
    // Documents the fix from auditing parse.ts: parseFloat used to eat a
    // numeric prefix ("123abc" → 123) and pass the isFinite guard.
    // Switched to Number() so anything non-numeric throws.
    const raw = {
      ...baseShape,
      submissions: [
        {
          submissionId: 99,
          userId: 1,
          problemId: 10,
          time: '2342.1a705',
          points: 0
        }
      ]
    };
    expect(() => parseInputData(raw)).toThrow(
      /submission 99 has a non-numeric time/
    );
  });

  it('preserves users and problems arrays by reference shape', () => {
    const raw = { ...baseShape, submissions: [] };
    const parsed = parseInputData(raw);
    expect(parsed.users).toEqual(baseShape.users);
    expect(parsed.problems).toEqual(baseShape.problems);
  });

  it('handles a mixed batch of string and numeric times', () => {
    const raw = {
      ...baseShape,
      submissions: [
        { submissionId: 1, userId: 1, problemId: 10, time: '100', points: 0 },
        { submissionId: 2, userId: 1, problemId: 10, time: 200, points: 50 },
        {
          submissionId: 3,
          userId: 1,
          problemId: 10,
          time: '300.5',
          points: 100
        }
      ]
    };
    const parsed = parseInputData(raw);
    // 300.5 floors to 300 — see "floors fractional numeric times" above.
    expect(parsed.submissions.map((s) => s.time)).toEqual([100, 200, 300]);
  });

  it('returns empty submissions when given empty', () => {
    const parsed = parseInputData({ ...baseShape, submissions: [] });
    expect(parsed.submissions).toEqual([]);
  });

  it('throws on a non-numeric time', () => {
    const raw = {
      ...baseShape,
      submissions: [
        {
          submissionId: 42,
          userId: 1,
          problemId: 10,
          time: 'not-a-number',
          points: 0
        }
      ]
    };
    expect(() => parseInputData(raw)).toThrow(
      /submission 42 has a non-numeric time/
    );
  });

  it('throws on a NaN time', () => {
    const raw = {
      ...baseShape,
      submissions: [
        { submissionId: 1, userId: 1, problemId: 10, time: NaN, points: 0 }
      ]
    };
    expect(() => parseInputData(raw)).toThrow(/non-numeric time/);
  });

  it('throws on an Infinity time', () => {
    const raw = {
      ...baseShape,
      submissions: [
        {
          submissionId: 1,
          userId: 1,
          problemId: 10,
          time: Infinity,
          points: 0
        }
      ]
    };
    expect(() => parseInputData(raw)).toThrow(/non-numeric time/);
  });

  it('throws when submissions is missing entirely', () => {
    // Documents current behavior: parseInputData assumes a `submissions` array.
    // A missing one currently surfaces as a downstream TypeError on `.map`.
    // (We treat the surface here as a contract rather than a guard, so the
    // throw type is intentionally loose.)
    expect(() => parseInputData(baseShape as unknown)).toThrow();
  });
});
