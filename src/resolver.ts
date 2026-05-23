import { useCallback, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import _ from 'lodash';

import { useStateWithRollback } from './hooks';
import {
  ImageData,
  InputData,
  InputSubmission,
  PointByProblemId,
  SubmissionById,
  UserRow,
  applyResolveSubmission,
  buildInitialState,
  getProblemCodeFromIndex,
  rankUsers
} from './lib/resolver';

export { ProblemAttemptStatus, parseInputData } from './lib/resolver';
export type { ImageData, InputData } from './lib/resolver';

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
  step: (nextSubmissionOrderToResolve?: number) => boolean;
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

  const [state, setState, rollback] = useStateWithRollback(() =>
    buildInitialState({ inputData, userIds, frozenTime })
  );

  const data = useMemo(
    () => rankUsers(state, unofficialContestants),
    [state, unofficialContestants]
  );

  const step = useCallback(
    (nextSubmissionOrderToResolve?: number) => {
      const {
        shownImage,
        imageSrc,
        currentRowIndex,
        markedUserId,
        markedProblemId
      } = state;
      if (currentRowIndex === -1) {
        return false;
      }

      if (markedUserId !== data[currentRowIndex]!.userId) {
        setState({
          ...state,
          currentRowIndex,
          markedUserId: data[currentRowIndex]!.userId,
          markedProblemId: -1,
          nextSubmissionId: -1
        });
        return true;
      }

      if (
        !state.users[data[currentRowIndex].userId]!.pendingSubmissionIds!.length
      ) {
        if (
          data[currentRowIndex].rank in imageData &&
          !shownImage &&
          imageSrc === null
        ) {
          setState({
            ...state,
            shownImage: true,
            imageSrc: imageData[data[currentRowIndex].rank]
          });
          return true;
        }

        if (shownImage && imageSrc !== null) {
          setState({
            ...state,
            imageSrc: null
          });
          return true;
        }

        if (currentRowIndex === 0) {
          setState({
            ...state,
            shownImage: false,
            imageSrc: null,
            currentRowIndex: -1,
            markedUserId: -1,
            markedProblemId: -1,
            nextSubmissionId: -1
          });
          return false;
        }

        const nextMarkedUserId = data[currentRowIndex - 1]!.userId;
        setState({
          ...state,
          shownImage: false,
          imageSrc: null,
          currentRowIndex: currentRowIndex - 1,
          markedUserId: nextMarkedUserId,
          markedProblemId: -1,
          nextSubmissionId: -1
        });

        return true;
      }

      if (markedProblemId === -1) {
        let nextSubmissionId: number | undefined;
        if (nextSubmissionOrderToResolve !== undefined) {
          if (
            nextSubmissionOrderToResolve < 0 ||
            nextSubmissionOrderToResolve >=
              state.users[markedUserId].pendingSubmissionIds.length
          ) {
            console.log('Invalid nextSubmissionOrderToResolve');
            return true;
          }

          nextSubmissionId =
            state.users[markedUserId].pendingSubmissionIds[
              nextSubmissionOrderToResolve
            ];
        }

        if (nextSubmissionId === undefined) {
          nextSubmissionId =
            _.minBy(
              state.users[markedUserId].pendingSubmissionIds,
              (id) => submissionById[id].problemId
            ) ?? -1;
        }

        setState({
          ...state,
          currentRowIndex,
          markedUserId,
          markedProblemId: submissionById[nextSubmissionId]?.problemId ?? -1,
          nextSubmissionId
        });
        return true;
      }

      setState(
        applyResolveSubmission({
          state,
          submissionId: state.nextSubmissionId,
          submissionById,
          pointByProblemId
        })
      );

      return true;
    },
    [submissionById, pointByProblemId, state, data, imageData, setState]
  );

  return {
    columns,
    data,
    currentRowIndex: state.currentRowIndex,
    markedUserId: state.markedUserId,
    markedProblemId: state.markedProblemId,
    imageSrc: state.imageSrc,
    step,
    rollback
  };
}
