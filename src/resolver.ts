import {
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
  useState
} from 'react';
import { ColumnDef } from '@tanstack/react-table';
import _ from 'lodash';

export type InputUser = {
  userId: number;
  username: string;
  fullName: string;
};

export type InputProblem = {
  problemId: number;
  name: string;
  points: number;
};

export type InputSubmission = {
  submissionId: number;
  problemId: number;
  userId: number;
  time: number;
  points: number;
};

export type InputData = {
  users: Array<InputUser>;
  problems: Array<InputProblem>;
  submissions: Array<InputSubmission>;
};

export enum ProblemAttemptStatus {
  UNATTEMPTED = 1,
  INCORRECT = 2,
  PARTIAL = 4,
  ACCEPTED = 8,
  PENDING = 16
}

export type UserRow = {
  rank: number;
  userId: number;
  username: string;
  fullName: string;
  total: number;
  penalty: number;
  points: { [problemId: number]: number };
  status: { [problemId: number]: ProblemAttemptStatus };
};

type PointByProblemId = {
  [problemId: number]: number;
};

type StatusByProblemId = {
  [problemId: number]: ProblemAttemptStatus;
};

type ProblemById = {
  [problemId: number]: InputProblem;
};

type SubmissionById = {
  [submissionId: number]: InputSubmission;
};

type InternalUser = InputUser & {
  points: PointByProblemId;
  status: StatusByProblemId;
  lastAlteringScoreSubmissionIdByProblemId: { [problemId: number]: number };
  lastAlteringScoreSubmissionId: number;
  submissionIdsByProblemId: { [problemId: number]: number[] };
  pendingSubmissionIds: number[];
  penalty: number;
};

type InternalState = {
  [userId: number]: InternalUser;
};

function calculatePenalty(user: InternalUser, submissionById: SubmissionById) {
  if (user.lastAlteringScoreSubmissionId === -1) {
    return 0;
  }

  let incorrect = 0;
  for (const [problemId, last] of Object.entries(
    user.lastAlteringScoreSubmissionIdByProblemId
  )) {
    incorrect += user.submissionIdsByProblemId[problemId as any].filter(
      (submissionId) => submissionId < last
    ).length;
  }

  return (
    submissionById[user.lastAlteringScoreSubmissionId].time + 300 * incorrect
  );
}

function resolvePendingSubmission({
  submissionId,
  submissionById,
  pointByProblemId,
  state,
  setState
}: {
  submissionId: number;
  submissionById: SubmissionById;
  pointByProblemId: PointByProblemId;
  state: InternalState;
  setState: Dispatch<SetStateAction<InternalState>>;
}) {
  state = _.cloneDeep(state);

  const submission = submissionById[submissionId];
  const user = state[submission.userId];
  const problemId = submission.problemId;

  if (submission.points > user.points[problemId]) {
    user.points[problemId] = submission.points;
    user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
    user.lastAlteringScoreSubmissionId = submissionId;
  }

  if (user.points[problemId] === 0) {
    user.status[problemId] = ProblemAttemptStatus.INCORRECT;
  } else if (user.points[problemId] < pointByProblemId[problemId]) {
    user.status[problemId] = ProblemAttemptStatus.PARTIAL;
  } else {
    user.status[problemId] = ProblemAttemptStatus.ACCEPTED;
  }

  user.pendingSubmissionIds = _.without(
    user.pendingSubmissionIds,
    submissionId
  );

  user.penalty = calculatePenalty(user, submissionById);

  setState(state);
}

function rankUsers(state: InternalState): UserRow[] {
  const rows = _.orderBy(
    _.values(state).map((user) => {
      const total = _.sum(_.values(user.points));
      return { ...user, total, rank: 0 };
    }),
    ['total', 'penalty'],
    ['desc', 'asc']
  );

  let [lastTotal, lastPenalty, rank] = [-1, -1, 0];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].total !== lastTotal || rows[i].penalty !== lastPenalty) {
      rank = i + 1;
      lastTotal = rows[i].total;
      lastPenalty = rows[i].penalty;
    }
    rows[i].rank = rank;
  }

  return rows;
}

export function useResolver({
  inputData,
  freezeTime
}: {
  inputData: InputData;
  freezeTime: number;
}): {
  columns: ColumnDef<UserRow>[];
  data: UserRow[];
  markedUserId: number;
  step: () => boolean;
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

  const problemById = useMemo<ProblemById>(
    () => _.keyBy(inputData.problems, 'problemId'),
    [inputData.problems]
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
      id: 'username',
      header: 'Username',
      accessorKey: 'username'
    });

    columns.push({
      id: 'fullName',
      header: 'Full Name',
      accessorKey: 'fullName'
    });

    for (const problem of inputData.problems) {
      columns.push({
        id: `problem_${problem.problemId}`,
        header: problem.name,
        accessorFn: (row: UserRow) => row.points[problem.problemId]
      });
    }

    columns.push({
      id: 'total',
      header: 'Total',
      accessorKey: 'total'
    });

    columns.push({
      id: 'penalty',
      header: 'Penalty',
      accessorFn: (row) =>
        new Date(row.penalty * 1000).toISOString().substring(11, 19)
    });

    return columns;
  }, [inputData.problems]);

  const [state, setState] = useState(() => {
    function processSubmissions(submissions: InputSubmission[]): InternalState {
      const state: InternalState = _.keyBy(
        inputData.users.map((user) => ({
          ...user,
          points: _.mapValues(pointByProblemId, () => 0),
          status: _.mapValues(
            _.keyBy(inputData.problems, 'problemId'),
            () => ProblemAttemptStatus.UNATTEMPTED
          ),
          lastAlteringScoreSubmissionIdByProblemId: {},
          lastAlteringScoreSubmissionId: -1,
          submissionIdsByProblemId: _.mapValues(
            _.keyBy(inputData.problems, 'problemId'),
            () => []
          ),
          pendingSubmissionIds: [],
          penalty: 0
        })),
        'userId'
      );

      submissions = _.sortBy(submissions, 'submissionId');

      for (const submission of submissions) {
        const user = state[submission.userId];
        const problemId = submission.problemId;
        const submissionId = submission.submissionId;

        if (submission.points > user.points[problemId]) {
          user.points[problemId] = submission.points;
          user.lastAlteringScoreSubmissionIdByProblemId[problemId] =
            submissionId;
          user.lastAlteringScoreSubmissionId = submissionId;
        }

        user.submissionIdsByProblemId[problemId].push(submissionId);

        if (user.points[problemId] === 0) {
          user.status[problemId] = ProblemAttemptStatus.INCORRECT;
        } else if (user.points[problemId] < pointByProblemId[problemId]) {
          user.status[problemId] = ProblemAttemptStatus.PARTIAL;
        } else {
          user.status[problemId] = ProblemAttemptStatus.ACCEPTED;
        }
      }

      for (const userId in state) {
        state[userId].penalty = calculatePenalty(state[userId], submissionById);
      }

      return state;
    }

    const publicState = processSubmissions(
      filteredSubmissions.filter((submission) => submission.time < freezeTime)
    );
    const privateState = processSubmissions(filteredSubmissions);

    for (const userId in publicState) {
      const publicUser = publicState[userId];
      const privateUser = privateState[userId];
      publicUser.submissionIdsByProblemId =
        privateUser.submissionIdsByProblemId;

      for (const problemId in problemById) {
        if (
          publicUser.lastAlteringScoreSubmissionIdByProblemId[problemId] !==
          privateUser.lastAlteringScoreSubmissionIdByProblemId[problemId]
        ) {
          publicUser.pendingSubmissionIds.push(
            privateUser.lastAlteringScoreSubmissionIdByProblemId[problemId]
          );
          publicUser.status[problemId] |= ProblemAttemptStatus.PENDING;
        }
      }

      publicUser.pendingSubmissionIds.sort();
    }

    console.log(publicState, privateState);

    return publicState;
  });

  const data = useMemo(() => rankUsers(state), [state]);

  const [{ currentRowIndex, markedUserId }, setCurrentRow] = useState({
    currentRowIndex: inputData.users.length - 1,
    markedUserId: -1
  });

  const step = useCallback(() => {
    if (markedUserId !== data[currentRowIndex]?.userId) {
      setCurrentRow(({ currentRowIndex }) => ({
        currentRowIndex,
        markedUserId: data[currentRowIndex]?.userId
      }));
      return true;
    }

    if (currentRowIndex === -1) {
      return false;
    }

    if (!state[data[currentRowIndex].userId]?.pendingSubmissionIds?.length) {
      setCurrentRow(({ currentRowIndex }) => ({
        currentRowIndex: currentRowIndex - 1,
        markedUserId: data[currentRowIndex - 1]?.userId
      }));
      return true;
    }

    const submissionId =
      state[data[currentRowIndex].userId].pendingSubmissionIds[0];

    resolvePendingSubmission({
      submissionId,
      submissionById,
      pointByProblemId,
      state,
      setState
    });

    return true;
  }, [
    submissionById,
    pointByProblemId,
    state,
    currentRowIndex,
    markedUserId,
    data
  ]);

  return {
    columns,
    data,
    markedUserId,
    step
  };
}
