import { useCallback, useMemo, useReducer } from 'react';
import { ColumnDef } from '@tanstack/react-table';
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
  getProblemCodeFromIndex,
  rankUsers,
  replay
} from './lib/resolver';

export { ProblemAttemptStatus, parseInputData } from './lib/resolver';
export type { ImageData, InputData, ResolverEvent } from './lib/resolver';

type SimState = {
  base: InternalState;
  events: ResolverEvent[];
  current: InternalState;
};

type ReducerCtx = {
  submissionById: SubmissionById;
  pointByProblemId: PointByProblemId;
  imageData: ImageData;
};

type Action =
  | { type: 'step'; choice: number | undefined; ranking: UserRow[] }
  | { type: 'rollback' };

function makeReducer(ctx: ReducerCtx) {
  return (state: SimState, action: Action): SimState => {
    if (action.type === 'step') {
      const next = computeNextEvent(
        state.current,
        action.ranking,
        ctx,
        action.choice
      );
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
  columns: ColumnDef<UserRow>[];
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

  const columns = useMemo(() => {
    const columns: ColumnDef<UserRow>[] = [];

    columns.push({
      id: 'rank',
      header: 'Rank',
      accessorKey: 'rank'
    });

    columns.push({
      id: 'name',
      header: 'Name',
      accessorFn: (row: UserRow) => ({
        fullName: row.fullName,
        username: row.username
      })
    });

    inputData.problems.forEach((problem, index) => {
      columns.push({
        id: `problem_${problem.problemId}`,
        header: getProblemCodeFromIndex(index),
        accessorFn: (row: UserRow) => row.points[problem.problemId],
        meta: {
          isProblem: true,
          problemId: problem.problemId,
          points: problem.points
        }
      });
    });

    columns.push({
      id: 'total',
      header: 'Score',
      accessorKey: 'total'
    });

    columns.push({
      id: 'penalty',
      header: 'Time',
      accessorFn: (row) =>
        new Date(row.penalty * 1000).toISOString().substring(11, 19)
    });

    return columns;
  }, [inputData.problems]);

  const reducer = useMemo(
    () => makeReducer({ submissionById, pointByProblemId, imageData }),
    [submissionById, pointByProblemId, imageData]
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

  const step = useCallback(
    (choice?: number) => {
      dispatch({ type: 'step', choice, ranking: data });
    },
    [data]
  );

  const rollback = useCallback(() => dispatch({ type: 'rollback' }), []);

  return {
    columns,
    data,
    currentRowIndex: sim.current.currentRowIndex,
    markedUserId: sim.current.markedUserId,
    markedProblemId: sim.current.markedProblemId,
    imageSrc: sim.current.imageSrc,
    step,
    rollback
  };
}
