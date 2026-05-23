import { describe, expect, it } from 'vitest';
import { buildInitialState, rankUsers, type InputData } from '..';

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
    expect(state.users[2].points[10]).toBe(0);
    expect(state.users[2].penalty).toBe(0);
    expect(state.users[2].pendingSubmissionIds).toEqual([]);
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
    expect(state.users[1].pendingSubmissionIds).toEqual([1]);
    expect(state.users[1].points[10]).toBe(0);
  });

  it('handles a frozenTime past every submission (nothing pending)', () => {
    const input = makeInput();
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: Number.POSITIVE_INFINITY
    });
    expect(state.users[1].pendingSubmissionIds).toEqual([]);
    expect(state.users[1].points[10]).toBe(100);
  });

  it('handles an empty submission list', () => {
    const input = makeInput({ submissions: [] });
    const state = buildInitialState({
      inputData: input,
      userIds: [1, 2],
      frozenTime: 1000
    });
    expect(state.users[1].points[10]).toBe(0);
    expect(state.users[2].points[10]).toBe(0);
    expect(state.currentRowIndex).toBe(1); // users.length - 1
  });
});
