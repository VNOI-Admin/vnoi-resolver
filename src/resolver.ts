import { useCallback, useMemo, useState } from 'react';
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

type ProblemById = {
  [problemId: number]: InputProblem;
};

type PointByBatchId = {
  [batchId: string]: number;
};

type SubmissionByUserId = {
  [userId: number]: InputSubmission[];
};

type InternalUser = InputUser & {
  points: PointByBatchId;
};

type InternalState = {
  [userId: number]: InternalUser;
};

function shuffle(arr: Array<any>) {
  arr = [...arr];
  const shuffled = [];
  while (arr.length) {
    const rand = Math.floor(Math.random() * arr.length);
    shuffled.push(arr.splice(rand, 1)[0]);
  }
  return shuffled;
}

function rankUsers({
  problemById,
  pointByBatchId,
  submissionByUserId,
  state
}: {
  problemById: ProblemById;
  pointByBatchId: PointByBatchId;
  submissionByUserId: SubmissionByUserId;
  state: InternalState;
}): UserRow[] {
  return _.values(state).map((user) => {
    const points = _.mapValues(
      user.points,
      (accepted, batchId) => pointByBatchId[batchId] * accepted
    );
    const total = _.sum(_.values(points));
    return { ...user, points, total, penalty: 0, rank: 0 };
  });
}

export function useResolver({ inputData }: { inputData: InputData }): {
  columns: ColumnDef<UserRow>[];
  data: UserRow[];
  step: () => boolean;
} {
  const problemById = useMemo<ProblemById>(
    () => _.keyBy(inputData.problems, 'problemId'),
    [inputData.problems]
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

  const submissionByUserId = useMemo<SubmissionByUserId>(
    () =>
      _.mapValues(_.groupBy(inputData.submissions, 'userId'), (subs) =>
        _.sortBy(subs, 'submissionId')
      ),
    [inputData.submissions]
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
      accessorKey: 'penalty'
    });

    return columns;
  }, [inputData.problems]);

  const [state, setState] = useState(() => {
    const state: InternalState = _.keyBy(
      inputData.users.map((user) => ({
        ...user,
        points: _.mapValues(pointByBatchId, () => 0)
      })),
      'userId'
    );

    return state;
  });

  const data = useMemo(
    () =>
      rankUsers({
        problemById,
        pointByBatchId,
        submissionByUserId,
        state
      }),
    [problemById, pointByBatchId, submissionByUserId, state]
  );

  const step = useCallback(() => {
    setState((state) =>
      _.keyBy(_.initial(_.shuffle(_.values(state))), 'userId')
    );
    return true;
  }, []);

  return {
    columns,
    data,
    step
  };
}
