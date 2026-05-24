import { describe, expect, it } from 'vitest';
import { rankUsers } from '../ranking';
import { InternalState, InternalUser, ProblemAttemptStatus } from '../types';

function makeUser(
  userId: number,
  username: string,
  points: { [problemId: number]: number },
  penalty: number
): InternalUser {
  return {
    userId,
    username,
    fullName: username,
    points,
    status: {},
    scoreClass: {},
    lastAlteringScoreSubmissionIdByProblemId: {},
    lastAlteringScoreSubmissionId: 0,
    submissionIdsByProblemId: {},
    pendingSubmissionIds: [],
    penalty
  };
}

function makeState(users: InternalUser[]): InternalState {
  return {
    shownImage: false,
    imageSrc: null,
    currentRowIndex: users.length - 1,
    markedUserId: -1,
    markedProblemId: -1,
    users: Object.fromEntries(users.map((u) => [u.userId, u]))
  };
}

describe('rankUsers', () => {
  it('sorts by total desc then penalty asc', () => {
    const state = makeState([
      makeUser(1, 'a', { 1: 100 }, 600),
      makeUser(2, 'b', { 1: 200 }, 900),
      makeUser(3, 'c', { 1: 200 }, 300)
    ]);
    const rows = rankUsers(state, []);
    expect(rows.map((r) => r.username)).toEqual(['c', 'b', 'a']);
    expect(rows.map((r) => r.rank)).toEqual(['1', '2', '3']);
  });

  it('assigns the same rank to ties (same total + penalty)', () => {
    const state = makeState([
      makeUser(1, 'a', { 1: 100 }, 500),
      makeUser(2, 'b', { 1: 100 }, 500),
      makeUser(3, 'c', { 1: 50 }, 0)
    ]);
    const rows = rankUsers(state, []);
    expect(rows.map((r) => r.rank)).toEqual(['1', '1', '3']);
  });

  it('skips unofficial contestants when numbering ranks', () => {
    const state = makeState([
      makeUser(1, 'official1', { 1: 300 }, 100),
      makeUser(2, 'guest', { 1: 200 }, 100),
      makeUser(3, 'official2', { 1: 100 }, 100)
    ]);
    const rows = rankUsers(state, ['guest']);
    const ranks = Object.fromEntries(rows.map((r) => [r.username, r.rank]));
    expect(ranks.official1).toBe('1');
    expect(ranks.guest).toBe('');
    expect(ranks.official2).toBe('2');
  });

  it('returns total = sum of points', () => {
    const state = makeState([makeUser(1, 'a', { 1: 100, 2: 250, 3: 0 }, 0)]);
    expect(rankUsers(state, [])[0]!.total).toBe(350);
  });

  it('keeps status untouched in returned rows', () => {
    const u = makeUser(1, 'a', { 1: 100 }, 0);
    u.status = { 1: ProblemAttemptStatus.ACCEPTED };
    const rows = rankUsers(makeState([u]), []);
    expect(rows[0]!.status[1]).toBe(ProblemAttemptStatus.ACCEPTED);
  });
});
