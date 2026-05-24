import { useCallback, useMemo, useReducer, useRef } from 'react';

import {
  AwardImageMap,
  InputData,
  InputSubmission,
  PointByProblemId,
  ResolverEvent,
  SimState,
  SubmissionById,
  UserRow,
  applyEvent,
  buildInitialState,
  initSimState,
  keyBy,
  mapValues,
  makeReducer,
  rankUsers
} from './lib/resolver';

export { parseInputData } from './lib/resolver';
export type { AwardImageMap, InputData } from './lib/resolver';

export type Snapshot = {
  data: UserRow[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  imageSrc: string | null;
};

// Pure passthrough when hide=false so callers can wrap in useMemo without
// paying for an unnecessary clone. Both operator and audience use this so
// they pass the same filtered user set into useResolver.
export function applyHideUnofficials(
  inputData: InputData,
  unofficialContestants: string[],
  hide: boolean
): InputData {
  if (!hide) return inputData;
  const excluded = new Set(unofficialContestants);
  return {
    ...inputData,
    users: inputData.users.filter((u) => !excluded.has(u.username))
  };
}

export function useResolver({
  inputData,
  imageData,
  unofficialContestants,
  frozenTime
}: {
  inputData: InputData;
  imageData: AwardImageMap;
  unofficialContestants: string[];
  frozenTime: number;
}): Snapshot & {
  cursor: number;
  totalEvents: number;
  events: readonly ResolverEvent[];
  // Read-only state preview at an arbitrary cursor. Used by the operator
  // console on queue/timeline hover. Memoised per cursor; invalidates when
  // a divergence rebuilds the events/states arrays.
  peekAt: (cursor: number) => Snapshot;
  // Pending submissions at a cursor in the SAME order the reducer indexes
  // them for the 1-9 hotkeys. Lets the NEXT-pane chooser show choices that
  // exactly match step(N)'s pick.
  pendingSubmissionsAt: (cursor: number, userId: number) => InputSubmission[];
  // Projected rank after revealing a single pending submission. Synthesises
  // mark_problem + resolve on a transient state copy — no mutation of
  // sim.states. Used by the chooser to show "rank 23 → 18" per row.
  projectRankAfter: (
    cursor: number,
    userId: number,
    submissionId: number
  ) => string | null;
  step: (choice?: number) => void;
  rollback: () => void;
} {
  const userIds = useMemo<number[]>(
    () => inputData.users.map((user) => user.userId),
    [inputData.users]
  );

  const userIdSet = useMemo(() => new Set(userIds), [userIds]);

  // userIds.includes is O(N) per submission, which made the original
  // filter O(N·M) (≈8.8K ops on vnoicup24).
  const filteredSubmissions = useMemo<InputSubmission[]>(
    () =>
      inputData.submissions.filter((submission) =>
        userIdSet.has(submission.userId)
      ),
    [inputData.submissions, userIdSet]
  );

  const submissionById = useMemo<SubmissionById>(
    () => keyBy(filteredSubmissions, (s) => s.submissionId),
    [filteredSubmissions]
  );

  const pointByProblemId = useMemo<PointByProblemId>(
    () =>
      mapValues(
        keyBy(inputData.problems, (p) => p.problemId),
        (problem) => problem.points
      ),
    [inputData.problems]
  );

  const reducer = useMemo(
    () =>
      makeReducer({
        submissionById,
        pointByProblemId,
        imageData,
        unofficialContestants
      }),
    [submissionById, pointByProblemId, imageData, unofficialContestants]
  );

  const [sim, dispatch] = useReducer(reducer, undefined, (): SimState => {
    const base = buildInitialState({ inputData, userIds, frozenTime });
    return initSimState(base, {
      submissionById,
      pointByProblemId,
      imageData,
      unofficialContestants
    });
  });

  // Invariant: states.length === events.length + 1, 0 ≤ cursor ≤ events.length.
  const current = sim.states[sim.cursor]!;

  const data = useMemo(
    () => rankUsers(current, unofficialContestants),
    [current, unofficialContestants]
  );

  // Keyed by `sim.states` identity (not `sim`!) — a divergence replaces
  // states[] in place and must invalidate, but a default-choice step only
  // bumps cursor and produces a fresh `sim` spread that should NOT
  // invalidate. LRU-bounded at 64 to cap memory under heavy scrubbing on
  // long ceremonies (would otherwise grow ~50–100MB of cloned UserRow[]).
  const PEEK_CACHE_MAX = 64;
  const peekCacheRef = useRef<{
    statesKey: readonly unknown[] | null;
    cache: Map<number, Snapshot>;
  }>({ statesKey: null, cache: new Map() });
  if (peekCacheRef.current.statesKey !== sim.states) {
    peekCacheRef.current = { statesKey: sim.states, cache: new Map() };
  }

  const peekAt = useCallback(
    (cursor: number): Snapshot => {
      const c = Math.max(0, Math.min(sim.events.length, cursor));
      const { cache } = peekCacheRef.current;
      const cached = cache.get(c);
      if (cached) {
        // Touch: move to MRU position so eviction prefers stale entries.
        cache.delete(c);
        cache.set(c, cached);
        return cached;
      }
      const s = sim.states[c]!;
      const snapshot: Snapshot = {
        data: rankUsers(s, unofficialContestants),
        currentRowIndex: s.currentRowIndex,
        markedUserId: s.markedUserId,
        markedProblemId: s.markedProblemId,
        imageSrc: s.imageSrc
      };
      if (cache.size >= PEEK_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(c, snapshot);
      return snapshot;
    },
    [sim, unofficialContestants]
  );

  const pendingSubmissionsAt = useCallback(
    (cursor: number, userId: number): InputSubmission[] => {
      const c = Math.max(0, Math.min(sim.events.length, cursor));
      const user = sim.states[c]?.users[userId];
      if (!user) return [];
      const out: InputSubmission[] = [];
      for (const id of user.pendingSubmissionIds) {
        const sub = submissionById[id];
        if (sub) out.push(sub);
      }
      return out;
    },
    [sim, submissionById]
  );

  const projectRankAfter = useCallback(
    (cursor: number, userId: number, submissionId: number): string | null => {
      const c = Math.max(0, Math.min(sim.events.length, cursor));
      const state = sim.states[c];
      const user = state?.users[userId];
      if (!user || !user.pendingSubmissionIds.includes(submissionId)) {
        return null;
      }
      const sub = submissionById[submissionId];
      if (!sub) return null;

      const applyCtx = { submissionById, pointByProblemId };
      const afterMark = applyEvent(
        state,
        {
          kind: 'mark_problem',
          userId,
          problemId: sub.problemId,
          submissionId
        },
        applyCtx
      );
      const afterResolve = applyEvent(
        afterMark,
        { kind: 'resolve', userId, submissionId },
        applyCtx
      );

      const ranking = rankUsers(afterResolve, unofficialContestants);
      const row = ranking.find((r) => r.userId === userId);
      return row?.rank ?? null;
    },
    [sim, submissionById, pointByProblemId, unofficialContestants]
  );

  const step = useCallback(
    (choice?: number) => dispatch({ type: 'step', choice }),
    []
  );

  const rollback = useCallback(() => dispatch({ type: 'rollback' }), []);

  return {
    data,
    currentRowIndex: current.currentRowIndex,
    markedUserId: current.markedUserId,
    markedProblemId: current.markedProblemId,
    imageSrc: current.imageSrc,
    cursor: sim.cursor,
    totalEvents: sim.events.length,
    events: sim.events,
    peekAt,
    pendingSubmissionsAt,
    projectRankAfter,
    step,
    rollback
  };
}
