import { describe, expect, it } from 'vitest';
import { parseInputData } from '../parse';

describe('parseInputData', () => {
  const baseShape = {
    users: [{ userId: 1, username: 'a', fullName: 'A' }],
    problems: [{ problemId: 10, name: 'P', points: 100 }]
  };

  it('parses string times to numbers', () => {
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
    expect(parsed.submissions[0].time).toBeCloseTo(2342.178705);
    expect(typeof parsed.submissions[0].time).toBe('number');
  });

  it('leaves numeric times untouched', () => {
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
    expect(parseInputData(raw).submissions[0].time).toBe(67.5);
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
    expect(parsed.submissions.map((s) => s.time)).toEqual([100, 200, 300.5]);
  });

  it('returns empty submissions when given empty', () => {
    const parsed = parseInputData({ ...baseShape, submissions: [] });
    expect(parsed.submissions).toEqual([]);
  });
});
