import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  applyEvent,
  buildInitialState,
  keyBy,
  mapValues,
  parseInputData,
  rankUsers
} from '..';
// processSubmissions is intentionally NOT part of the public surface — it's a
// build-time helper the integration test still exercises to validate the
// "build a private + a public state and compare" flow used by buildInitialState.
import { processSubmissions } from '../build';
import type {
  InputData,
  InternalState,
  PointByProblemId,
  ProblemById,
  SubmissionById
} from '../types';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, '../../../../public/vnoicup24/data.json');

const inputData: InputData = parseInputData(
  JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
);

function buildPrivateState(inputData: InputData): InternalState {
  const filtered = inputData.submissions;
  const problemById: ProblemById = keyBy(
    inputData.problems,
    (p) => p.problemId
  );
  const submissionById: SubmissionById = keyBy(filtered, (s) => s.submissionId);
  const pointByProblemId: PointByProblemId = mapValues(
    problemById,
    (p) => p.points
  );
  return processSubmissions({
    submissions: filtered,
    inputData,
    pointByProblemId,
    submissionById
  });
}

function resolveAllPending(
  initialState: InternalState,
  inputData: InputData
): InternalState {
  const submissionById: SubmissionById = keyBy(
    inputData.submissions,
    (s) => s.submissionId
  );
  const problemById: ProblemById = keyBy(
    inputData.problems,
    (p) => p.problemId
  );
  const pointByProblemId: PointByProblemId = mapValues(
    problemById,
    (p) => p.points
  );

  let state = initialState;
  for (const userId of Object.keys(state.users)) {
    const numericUserId = Number(userId);
    const pending = [...state.users[numericUserId]!.pendingSubmissionIds];
    for (const submissionId of pending) {
      state = applyEvent(
        state,
        { kind: 'resolve', userId: numericUserId, submissionId },
        { submissionById, pointByProblemId }
      );
    }
  }
  return state;
}

describe('resolver integration on vnoicup24', () => {
  it('loads non-empty dataset', () => {
    expect(inputData.users.length).toBeGreaterThan(0);
    expect(inputData.problems.length).toBeGreaterThan(0);
    expect(inputData.submissions.length).toBeGreaterThan(0);
    expect(typeof inputData.submissions[0]!.time).toBe('number');
  });

  it('private ranking has unique top-1 user', () => {
    const priv = buildPrivateState(inputData);
    const ranked = rankUsers(priv, []);
    expect(ranked[0]!.rank).toBe('1');
  });

  it.each([
    ['no submissions frozen', 18000],
    ['all submissions frozen', 0],
    ['default freeze (240 min)', 14400]
  ])(
    'resolving all pending from frozenTime=%s yields private ranking',
    (_label, frozenTime) => {
      const userIds = inputData.users.map((u) => u.userId);
      const initial = buildInitialState({ inputData, userIds, frozenTime });
      const resolved = resolveAllPending(initial, inputData);
      const privateState = buildPrivateState(inputData);

      for (const userId of Object.keys(privateState.users)) {
        const resolvedUser = resolved.users[userId as unknown as number]!;
        const privateUser = privateState.users[userId as unknown as number]!;

        expect(resolvedUser.points).toEqual(privateUser.points);
        expect(resolvedUser.penalty).toBeCloseTo(privateUser.penalty, 6);
        expect(resolvedUser.status).toEqual(privateUser.status);
        expect(resolvedUser.scoreClass).toEqual(privateUser.scoreClass);
      }

      const resolvedRanking = rankUsers(resolved, []).map((r) => ({
        userId: r.userId,
        rank: r.rank,
        total: r.total,
        penalty: r.penalty
      }));
      const privateRanking = rankUsers(privateState, []).map((r) => ({
        userId: r.userId,
        rank: r.rank,
        total: r.total,
        penalty: r.penalty
      }));
      expect(resolvedRanking).toEqual(privateRanking);
    }
  );

  it('buildInitialState leaves zero pending submissions when frozenTime is past the contest', () => {
    const userIds = inputData.users.map((u) => u.userId);
    const initial = buildInitialState({
      inputData,
      userIds,
      frozenTime: Number.POSITIVE_INFINITY
    });
    const totalPending = Object.values(initial.users).reduce(
      (s, u) => s + u.pendingSubmissionIds.length,
      0
    );
    expect(totalPending).toBe(0);
  });
});
