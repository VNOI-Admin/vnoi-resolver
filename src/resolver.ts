import { useCallback, useMemo, useReducer } from 'react';

import {
  AwardImageMap,
  InputData,
  InputSubmission,
  PointByProblemId,
  SimState,
  SubmissionById,
  UserRow,
  buildInitialState,
  initSimState,
  keyBy,
  mapValues,
  makeReducer,
  rankUsers
} from './lib/resolver';

export { parseInputData } from './lib/resolver';
export type { AwardImageMap, InputData } from './lib/resolver';

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
}): {
  data: UserRow[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  imageSrc: string | null;
  step: (choice?: number) => void;
  rollback: () => void;
} {
  const userIds = useMemo<number[]>(
    () => inputData.users.map((user) => user.userId),
    [inputData.users]
  );

  const userIdSet = useMemo(() => new Set(userIds), [userIds]);

  // Set.has is O(1); userIds.includes was O(N) per submission so the original
  // filter was O(N·M) (≈8.8K ops on vnoicup24; quadratic on bigger contests).
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

  const [sim, dispatch] = useReducer(
    reducer,
    null as unknown as SimState,
    (): SimState => {
      const base = buildInitialState({ inputData, userIds, frozenTime });
      return initSimState(base, {
        submissionById,
        pointByProblemId,
        imageData,
        unofficialContestants
      });
    }
  );

  // Invariant from initSimState + makeReducer: states.length === events.length + 1
  // and 0 ≤ cursor ≤ events.length, so states[cursor] is always defined.
  const current = sim.states[sim.cursor]!;

  const data = useMemo(
    () => rankUsers(current, unofficialContestants),
    [current, unofficialContestants]
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
    step,
    rollback
  };
}
