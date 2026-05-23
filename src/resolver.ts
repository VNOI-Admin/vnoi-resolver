import { useCallback, useMemo, useReducer } from 'react';
import _ from 'lodash';

import {
  ImageData,
  InputData,
  InputSubmission,
  InternalState,
  PointByProblemId,
  ResolverEvent,
  SubmissionById,
  UserRow,
  applyEvent,
  buildInitialState,
  computeNextEvent,
  rankUsers,
  replay
} from './lib/resolver';

export { parseInputData } from './lib/resolver';
export type { ImageData, InputData } from './lib/resolver';

type SimState = {
  base: InternalState;
  events: ResolverEvent[];
  current: InternalState;
};

type ReducerCtx = {
  submissionById: SubmissionById;
  pointByProblemId: PointByProblemId;
  imageData: ImageData;
  unofficialContestants: string[];
};

type Action =
  | { type: 'step'; choice: number | undefined }
  | { type: 'rollback' };

function makeReducer(ctx: ReducerCtx) {
  return (state: SimState, action: Action): SimState => {
    if (action.type === 'step') {
      // Rank from the latest state inside the reducer — if multiple `step`
      // calls dispatch in the same event tick, each one sees the live ranking
      // produced by the previous dispatch.
      const ranking = rankUsers(state.current, ctx.unofficialContestants);
      const next = computeNextEvent(state.current, ranking, ctx, action.choice);
      if (!next) return state;
      return {
        base: state.base,
        events: [...state.events, next],
        current: applyEvent(state.current, next, ctx)
      };
    }
    if (state.events.length === 0) return state;
    const newEvents = state.events.slice(0, -1);
    return {
      base: state.base,
      events: newEvents,
      current: replay(state.base, newEvents, ctx)
    };
  };
}

export function useResolver({
  inputData,
  imageData,
  unofficialContestants,
  frozenTime
}: {
  inputData: InputData;
  imageData: ImageData;
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

  const filteredSubmissions = useMemo<InputSubmission[]>(
    () =>
      inputData.submissions.filter((submission) =>
        userIds.includes(submission.userId)
      ),
    [inputData.submissions, userIds]
  );

  const submissionById = useMemo<SubmissionById>(
    () => _.keyBy(filteredSubmissions, 'submissionId'),
    [filteredSubmissions]
  );

  const pointByProblemId = useMemo<PointByProblemId>(
    () =>
      _.mapValues(
        _.keyBy(inputData.problems, 'problemId'),
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
      return { base, events: [], current: base };
    }
  );

  const data = useMemo(
    () => rankUsers(sim.current, unofficialContestants),
    [sim, unofficialContestants]
  );

  // step has stable identity now — no `data` dep. The autoplay interval and
  // keypress handlers don't churn between dispatches.
  const step = useCallback(
    (choice?: number) => dispatch({ type: 'step', choice }),
    []
  );

  const rollback = useCallback(() => dispatch({ type: 'rollback' }), []);

  return {
    data,
    currentRowIndex: sim.current.currentRowIndex,
    markedUserId: sim.current.markedUserId,
    markedProblemId: sim.current.markedProblemId,
    imageSrc: sim.current.imageSrc,
    step,
    rollback
  };
}
