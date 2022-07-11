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
  batches: Array<number>;
};

export type InputSubmission = {
  submissionId: number;
  problemId: number;
  userId: number;
  time: number; // seconds since beginning of contest
  results: Array<number>;
};

export type InputData = {
  users: Array<InputUser>;
  problems: Array<InputProblem>;
  submissions: Array<InputSubmission>;
};

export type UserRow = {
  rank: number;
  userId: number;
  username: string;
  fullName: string;
  total: number;
  penalty: number;
  points: { [batchId: string]: number };
};

type PointByBatchId = {
  [batchId: string]: number;
};

type SubmissionById = {
  [submissionId: number]: InputSubmission;
};

type SubmissionIdsByUserId = {
  [userId: number]: number[];
};

type InternalUser = InputUser & {
  points: PointByBatchId;
  lastAlteringScoreSubmissionId: number;
  incorrectSubmissionIds: number[];
  penalty: number;
};

type InternalState = {
  [userId: number]: InternalUser;
};

function calculatePenalty(user: InternalUser, submissionById: SubmissionById) {
  const lastId = user.lastAlteringScoreSubmissionId;
  if (lastId === -1) {
    return 0;
  }
  return (
    submissionById[lastId].time +
    300 * user.incorrectSubmissionIds.filter((id) => id < lastId).length
  );
}

function resolveSubmissions({
  submissionId,
  submissionById,
  remainingSubmissionIdsByUserId,
  setRemainingSubmissionIdsByUserId,
  state,
  setState
}: {
  submissionId: number;
  submissionById: SubmissionById;
  remainingSubmissionIdsByUserId: SubmissionIdsByUserId;
  setRemainingSubmissionIdsByUserId: Dispatch<
    SetStateAction<SubmissionIdsByUserId>
  >;
  state: InternalState;
  setState: Dispatch<SetStateAction<InternalState>>;
}): boolean {
  remainingSubmissionIdsByUserId = _.cloneDeep(remainingSubmissionIdsByUserId);
  state = _.cloneDeep(state);

  const submission = submissionById[submissionId];
  const userId = submission.userId;

  let changed = false;
  for (let i = 0; i < submission.results.length; i++) {
    const batchId = `${submission.problemId}_${i}`;
    if (submission.results[i] === 1 && state[userId].points[batchId] === 0) {
      state[userId].points[batchId] = 1;
      changed = true;
    }
  }

  if (changed) {
    state[userId].lastAlteringScoreSubmissionId = submission.submissionId;
    state[userId].penalty = calculatePenalty(state[userId], submissionById);
  } else {
    state[userId].incorrectSubmissionIds.push(submission.submissionId);
  }

  remainingSubmissionIdsByUserId[userId] = _.without(
    remainingSubmissionIdsByUserId[userId],
    submissionId
  );
  // if (remainingSubmissionIdsByUserId[userId].length === 0) {
  //   delete remainingSubmissionIdsByUserId[userId];
  // }

  setRemainingSubmissionIdsByUserId(remainingSubmissionIdsByUserId);
  setState(state);

  return changed;
}

function rankUsers({
  pointByBatchId,
  state
}: {
  pointByBatchId: PointByBatchId;
  state: InternalState;
}): UserRow[] {
  const rows = _.orderBy(
    _.values(state).map((user) => {
      const points = _.mapValues(
        user.points,
        (accepted, batchId) => pointByBatchId[batchId] * accepted
      );
      const total = _.sum(_.values(points));
      return { ...user, points, total, rank: 0 };
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

  const pointByBatchId = useMemo<PointByBatchId>(() => {
    const arr = inputData.problems.map((problem) =>
      _.mapValues(
        _.keyBy(
          problem.batches.map((point, i) => ({
            id: `${problem.problemId}_${i}`,
            point
          })),
          'id'
        ),
        'point'
      )
    );
    return _.merge({}, ...arr);
  }, [inputData.problems]);

  const submissionById = useMemo<SubmissionById>(
    () => _.keyBy(inputData.submissions, 'submissionId'),
    [inputData.submissions]
  );

  const [remainingSubmissionIdsByUserId, setRemainingSubmissionIdsByUserId] =
    useState<SubmissionIdsByUserId>(
      _.pickBy(
        _.mapValues(_.groupBy(inputData.submissions, 'userId'), (subs) =>
          _.sortBy(
            _.map(
              subs.filter((sub) => sub.time >= freezeTime),
              'submissionId'
            )
          ).reverse()
        ),
        (_, userId) => userIds.includes(parseInt(userId))
      )
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
        header: problem.name,
        columns: problem.batches.map((_, i) => ({
          id: `${problem.problemId}_${i}`,
          header: `Subtask ${i + 1}`,
          accessorFn: (row: UserRow) => row.points[`${problem.problemId}_${i}`]
        }))
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
    const state: InternalState = _.keyBy(
      inputData.users.map((user) => ({
        ...user,
        points: _.mapValues(pointByBatchId, () => 0),
        lastAlteringScoreSubmissionId: -1,
        incorrectSubmissionIds: [],
        penalty: 0
      })),
      'userId'
    );

    const publicSubmissionIdsByUserId: SubmissionIdsByUserId = _.pickBy(
      _.mapValues(_.groupBy(inputData.submissions, 'userId'), (subs) =>
        _.sortBy(
          _.map(
            subs.filter((sub) => sub.time < freezeTime),
            'submissionId'
          )
        )
      ),
      (_, userId) => userIds.includes(parseInt(userId))
    );
    console.log(publicSubmissionIdsByUserId);

    for (const userId in publicSubmissionIdsByUserId) {
      for (const submissionId of publicSubmissionIdsByUserId[userId]) {
        let changed = false;
        const submission = submissionById[submissionId];
        for (let i = 0; i < submission.results.length; i++) {
          const batchId = `${submission.problemId}_${i}`;
          if (
            submission.results[i] === 1 &&
            state[userId].points[batchId] === 0
          ) {
            state[userId].points[batchId] = 1;
            changed = true;
          }
        }

        if (changed) {
          state[userId].lastAlteringScoreSubmissionId = submission.submissionId;
        } else {
          state[userId].incorrectSubmissionIds.push(submission.submissionId);
        }
      }
    }

    for (const userId in state) {
      state[userId].penalty = calculatePenalty(state[userId], submissionById);
    }

    return state;
  });

  const data = useMemo(
    () =>
      rankUsers({
        pointByBatchId,
        state
      }),
    [pointByBatchId, state]
  );

  const [{ currentRowIndex, markedUserId }, setCurrentRow] = useState({
    currentRowIndex: inputData.users.length - 1,
    markedUserId: -1,
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

    if (!remainingSubmissionIdsByUserId[data[currentRowIndex].userId]?.length) {
      setCurrentRow(({ currentRowIndex }) => ({
        currentRowIndex: currentRowIndex - 1,
        markedUserId: data[currentRowIndex - 1]?.userId
      }));
      return true;
    }

    const submissionId = _.last(
      remainingSubmissionIdsByUserId[data[currentRowIndex].userId]
    )!;

    resolveSubmissions({
      submissionId,
      submissionById,
      remainingSubmissionIdsByUserId,
      setRemainingSubmissionIdsByUserId,
      state,
      setState
    });

    return true;
  }, [
    submissionById,
    remainingSubmissionIdsByUserId,
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
