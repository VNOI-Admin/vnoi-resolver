import { describe, expect, it } from 'vitest';
import {
  ProblemAttemptStatus,
  applyEvent,
  buildInitialState,
  keyBy,
  rankUsers,
  type InputData
} from '..';

function makeInput(overrides: Partial<InputData> = {}): InputData {
  return {
    users: [
      { userId: 1, username: 'alice', fullName: 'Alice' },
      { userId: 2, username: 'bob', fullName: 'Bob' }
    ],
    problems: [{ problemId: 10, name: 'A', points: 100 }],
    submissions: [
      { submissionId: 1, userId: 1, problemId: 10, time: 100, points: 100 }
    ],
    ...overrides
  };
}

describe('edge-case datasets', () => {
  it('handles a user with no submissions at all', () => {
    const input = makeInput();
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 60_000
    });
    // Bob (userId=2) has no submissions but must still appear with zero score.
    expect(state.users[2]).toBeDefined();
    expect(state.users[2]!.points[10]).toBe(0);
    expect(state.users[2]!.penalty).toBe(0);
    expect(state.users[2]!.pendingSubmissionIds).toEqual([]);
  });

  it('produces a ranking when every contestant is unofficial', () => {
    const input = makeInput();
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 60_000
    });
    const ranked = rankUsers(state, ['alice', 'bob']);
    expect(ranked).toHaveLength(2);
    // All ranks empty since every user is unofficial.
    expect(ranked.map((r) => r.rank)).toEqual(['', '']);
  });

  it('handles a frozenTime of 0 (everything pending)', () => {
    const input = makeInput();
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 0
    });
    // The one altering submission for alice is pending.
    expect(state.users[1]!.pendingSubmissionIds).toEqual([1]);
    expect(state.users[1]!.points[10]).toBe(0);
  });

  it('handles a frozenTime past every submission (nothing pending)', () => {
    const input = makeInput();
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: Number.POSITIVE_INFINITY
    });
    expect(state.users[1]!.pendingSubmissionIds).toEqual([]);
    expect(state.users[1]!.points[10]).toBe(100);
  });

  it('handles an empty submission list', () => {
    const input = makeInput({ submissions: [] });
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 1000
    });
    expect(state.users[1]!.points[10]).toBe(0);
    expect(state.users[2]!.points[10]).toBe(0);
    expect(state.currentRowIndex).toBe(1); // users.length - 1
  });

  it('keeps a problem pending when post-freeze attempts never beat the pre-freeze partial (vnoicup26 F)', () => {
    // The real shape that slipped through: 750/3000 partial before the
    // freeze, then only WAs after it. The official board freezes this as
    // "750? [4]" — the resolver must mark it pending and reveal a no-change
    // moment, not silently resolve it at build time.
    const input = makeInput({
      submissions: [
        { submissionId: 1, userId: 1, problemId: 10, time: 100, points: 75 },
        { submissionId: 2, userId: 1, problemId: 10, time: 300, points: 0 },
        { submissionId: 3, userId: 1, problemId: 10, time: 400, points: 0 }
      ]
    });
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 200
    });
    const alice = state.users[1]!;
    // Frozen board: pre-freeze best still counts, but the problem is pending.
    expect(alice.points[10]).toBe(75);
    expect(alice.status[10]! & ProblemAttemptStatus.PENDING).not.toBe(0);
    // The reveal target is the LAST post-freeze attempt (applying it is a
    // points no-op — the "750? stays 750" moment).
    expect(alice.pendingSubmissionIds).toEqual([3]);

    const ctx = {
      submissionById: keyBy(input.submissions, (s) => s.submissionId),
      pointByProblemId: { 10: 100 }
    };
    const after = applyEvent(
      state,
      { kind: 'resolve', userId: 1, submissionId: 3 },
      ctx
    );
    const resolved = after.users[1]!;
    expect(resolved.points[10]).toBe(75);
    expect(resolved.pendingSubmissionIds).toEqual([]);
    expect(resolved.status[10]! & ProblemAttemptStatus.PENDING).toBe(0);
  });

  it('keeps a problem pending when the post-freeze partial is lower than the pre-freeze best', () => {
    // Same class as the all-WA case: 25 after the freeze cannot beat the 75
    // scored before it, but the attempt still exists — pending, no-change
    // reveal, final score stays 75.
    const input = makeInput({
      submissions: [
        { submissionId: 1, userId: 1, problemId: 10, time: 100, points: 75 },
        { submissionId: 2, userId: 1, problemId: 10, time: 300, points: 25 }
      ]
    });
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 200
    });
    const alice = state.users[1]!;
    expect(alice.points[10]).toBe(75);
    expect(alice.pendingSubmissionIds).toEqual([2]);

    const ctx = {
      submissionById: keyBy(input.submissions, (s) => s.submissionId),
      pointByProblemId: { 10: 100 }
    };
    const after = applyEvent(
      state,
      { kind: 'resolve', userId: 1, submissionId: 2 },
      ctx
    );
    expect(after.users[1]!.points[10]).toBe(75);
    expect(after.users[1]!.pendingSubmissionIds).toEqual([]);
  });

  it('keeps a fully-solved problem pending when the user resubmits after the freeze', () => {
    // Deliberate consequence of "any post-freeze attempt ⇒ pending": even a
    // problem already at full points freezes as "100?" if the user resubmits
    // during the freeze — the official boards show the same, and the reveal
    // spends a (guaranteed no-change) beat on it.
    const input = makeInput({
      submissions: [
        { submissionId: 1, userId: 1, problemId: 10, time: 100, points: 100 },
        { submissionId: 2, userId: 1, problemId: 10, time: 300, points: 100 }
      ]
    });
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 200
    });
    const alice = state.users[1]!;
    expect(alice.points[10]).toBe(100);
    expect(alice.status[10]! & ProblemAttemptStatus.PENDING).not.toBe(0);
    expect(alice.pendingSubmissionIds).toEqual([2]);

    const ctx = {
      submissionById: keyBy(input.submissions, (s) => s.submissionId),
      pointByProblemId: { 10: 100 }
    };
    const after = applyEvent(
      state,
      { kind: 'resolve', userId: 1, submissionId: 2 },
      ctx
    );
    expect(after.users[1]!.points[10]).toBe(100);
    expect(after.users[1]!.pendingSubmissionIds).toEqual([]);
    expect(after.users[1]!.penalty).toBe(state.users[1]!.penalty);
  });

  it('treats submission at time === frozenTime as pending (strict < boundary)', () => {
    // Two altering submissions for alice on different problems:
    //   sub 1 at t=100  → public (t < 200)
    //   sub 2 at t=200  → pending  (t === frozenTime, not yet public)
    // This pins build.ts:129 to strict `<`. If it ever flips to `<=`, the
    // second submission would leak into the public state and this test fails.
    const input = makeInput({
      problems: [
        { problemId: 10, name: 'A', points: 100 },
        { problemId: 20, name: 'B', points: 100 }
      ],
      submissions: [
        { submissionId: 1, userId: 1, problemId: 10, time: 100, points: 100 },
        { submissionId: 2, userId: 1, problemId: 20, time: 200, points: 100 }
      ]
    });
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 200
    });
    // Pre-freeze submission resolved into the public score.
    expect(state.users[1]!.points[10]).toBe(100);
    // Submission exactly at the freeze boundary is held back.
    expect(state.users[1]!.points[20]).toBe(0);
    expect(state.users[1]!.pendingSubmissionIds).toEqual([2]);
  });
});
