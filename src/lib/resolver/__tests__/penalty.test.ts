import { describe, expect, it } from 'vitest';
import { calculatePenalty } from '../penalty';
import { ProblemAttemptStatus } from '../types';
import type { InternalUser, InputSubmission, SubmissionById } from '../types';

function sub(
  submissionId: number,
  problemId: number,
  time: number,
  points: number
): InputSubmission {
  return { submissionId, problemId, userId: 1, time, points };
}

function user(overrides: Partial<InternalUser> = {}): InternalUser {
  return {
    userId: 1,
    username: 'u',
    fullName: 'u',
    points: {},
    status: {},
    scoreClass: {},
    lastAlteringScoreSubmissionIdByProblemId: {},
    lastAlteringScoreSubmissionId: -1,
    submissionIdsByProblemId: {},
    pendingSubmissionIds: [],
    penalty: 0,
    ...overrides
  };
}

describe('calculatePenalty', () => {
  it('returns 0 when the user never altered their score', () => {
    expect(calculatePenalty(user(), {})).toBe(0);
  });

  it('returns time of last altering submission when no incorrect attempts', () => {
    const submissionById: SubmissionById = {
      10: sub(10, 1, 500, 100)
    };
    const u = user({
      lastAlteringScoreSubmissionId: 10,
      lastAlteringScoreSubmissionIdByProblemId: { 1: 10 },
      submissionIdsByProblemId: { 1: [10] },
      points: { 1: 100 },
      status: { 1: ProblemAttemptStatus.ACCEPTED }
    });
    expect(calculatePenalty(u, submissionById)).toBe(500);
  });

  it('adds 300s per incorrect attempt before the last altering submission', () => {
    const submissionById: SubmissionById = {
      1: sub(1, 1, 100, 0),
      2: sub(2, 1, 200, 0),
      3: sub(3, 1, 300, 100)
    };
    const u = user({
      lastAlteringScoreSubmissionId: 3,
      lastAlteringScoreSubmissionIdByProblemId: { 1: 3 },
      submissionIdsByProblemId: { 1: [1, 2, 3] },
      points: { 1: 100 }
    });
    expect(calculatePenalty(u, submissionById)).toBe(300 + 300 * 2);
  });

  it('ignores incorrect attempts on problems with zero final score', () => {
    const submissionById: SubmissionById = {
      1: sub(1, 1, 100, 50),
      2: sub(2, 2, 200, 0),
      3: sub(3, 2, 250, 0)
    };
    const u = user({
      lastAlteringScoreSubmissionId: 1,
      lastAlteringScoreSubmissionIdByProblemId: { 1: 1, 2: 3 },
      submissionIdsByProblemId: { 1: [1], 2: [2, 3] },
      points: { 1: 50, 2: 0 }
    });
    expect(calculatePenalty(u, submissionById)).toBe(100);
  });

  it('counts only attempts before the last altering submission', () => {
    const submissionById: SubmissionById = {
      1: sub(1, 1, 100, 0),
      2: sub(2, 1, 200, 50),
      3: sub(3, 1, 300, 50)
    };
    const u = user({
      lastAlteringScoreSubmissionId: 2,
      lastAlteringScoreSubmissionIdByProblemId: { 1: 2 },
      submissionIdsByProblemId: { 1: [1, 2, 3] },
      points: { 1: 50 }
    });
    expect(calculatePenalty(u, submissionById)).toBe(200 + 300 * 1);
  });
});
