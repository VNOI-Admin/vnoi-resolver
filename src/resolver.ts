import { useCallback, useMemo, useState } from 'react';
import { Column } from 'react-table';
import _ from 'lodash';

export interface InputUser {
  userId: number;
  username: string;
  fullname: string;
}

export interface InputProblem {
  problemId: number;
  name: string;
  batches: Array<number>;
}

export interface InputSubmission {
  submissionId: number;
  problemId: number;
  userId: number;
  time: number; // seconds since beginning of contest
  results: Array<number>;
}

export interface InputData {
  users: Array<InputUser>;
  problems: Array<InputProblem>;
  submissions: Array<InputSubmission>;
}

export interface TableRow {
  rank: number;
  username: number;
  total: number;
  penalty: number;
  [batchId: string]: number;
}

interface ProblemById {
  [problemId: number]: InputProblem;
}

interface PointByBatchId {
  [batchId: string]: number;
}

interface SubmissionByUserId {
  [userId: number]: InputSubmission[];
}

interface InternalUser extends InputUser {
  points: PointByBatchId;
}

interface InternalState {
  [userId: number]: InternalUser;
}

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
}): TableRow[] {
  return [];
}

export function useResolver({ inputData }: { inputData: InputData }): {
  columns: ReadonlyArray<Column<object>>;
  data: ReadonlyArray<object>;
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
    const columns: Array<Column<object>> = [];

    columns.push({
      Header: 'Rank',
      accessor: 'rank'
    });

    columns.push({
      Header: 'Username',
      accessor: 'username'
    });

    for (const problem of inputData.problems) {
      columns.push({
        Header: problem.name,
        columns: problem.batches.map((_, i) => ({
          Header: `Subtask ${i + 1}`,
          accessor: `${problem.problemId}_${i}}`
        }))
      });
    }

    columns.push({
      Header: 'Total',
      accessor: 'total'
    });

    columns.push({
      Header: 'Penalty',
      accessor: 'penalty'
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
    return true;
  }, []);

  return {
    columns,
    data,
    step
  };
}
