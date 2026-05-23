import _ from 'lodash';
import {
  InputData,
  InputSubmission,
  InternalState,
  PointByProblemId,
  ProblemAttemptStatus,
  ProblemById,
  SubmissionById
} from './types';
import { getScoreClass } from './scoring';
import { calculatePenalty } from './penalty';

export function processSubmissions({
  submissions,
  inputData,
  pointByProblemId,
  problemById,
  submissionById
}: {
  submissions: InputSubmission[];
  inputData: InputData;
  pointByProblemId: PointByProblemId;
  problemById: ProblemById;
  submissionById: SubmissionById;
}): InternalState {
  const state: InternalState = {
    shownImage: false,
    imageSrc: null,
    currentRowIndex: inputData.users.length - 1,
    markedUserId: -1,
    markedProblemId: -1,
    nextSubmissionId: -1,
    users: _.keyBy(
      inputData.users.map((user) => ({
        ...user,
        points: _.mapValues(pointByProblemId, () => 0),
        status: _.mapValues(
          pointByProblemId,
          () => ProblemAttemptStatus.UNATTEMPTED
        ),
        scoreClass: _.mapValues(pointByProblemId, () => 'a'),
        lastAlteringScoreSubmissionIdByProblemId: {},
        lastAlteringScoreSubmissionId: -1,
        submissionIdsByProblemId: _.mapValues(
          pointByProblemId,
          () => [] as number[]
        ),
        pendingSubmissionIds: [] as number[],
        penalty: 0
      })),
      'userId'
    )
  };

  const sorted = _.sortBy(submissions, 'submissionId');

  for (const submission of sorted) {
    const user = state.users[submission.userId];
    const problemId = submission.problemId;
    const submissionId = submission.submissionId;

    if (submission.points > user.points[problemId]) {
      user.points[problemId] = submission.points;
      user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
      user.lastAlteringScoreSubmissionId = submissionId;
    } else if (submission.points === 0 && user.points[problemId] === 0) {
      user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
    }

    user.submissionIdsByProblemId[problemId].push(submissionId);
  }

  for (const userId in state.users) {
    const user = state.users[userId];
    for (const problemId in problemById) {
      if (user.submissionIdsByProblemId[problemId].length === 0) {
        continue;
      }

      if (user.points[problemId] === 0) {
        user.status[problemId] = ProblemAttemptStatus.INCORRECT;
      } else if (user.points[problemId] < pointByProblemId[problemId]) {
        user.status[problemId] = ProblemAttemptStatus.PARTIAL;
      } else {
        user.status[problemId] = ProblemAttemptStatus.ACCEPTED;
      }

      user.scoreClass[problemId] = getScoreClass(
        user.points[problemId],
        pointByProblemId[problemId]
      );
    }

    user.penalty = calculatePenalty(user, submissionById);
  }

  return state;
}

export function buildInitialState({
  inputData,
  userIds,
  frozenTime
}: {
  inputData: InputData;
  userIds: number[];
  frozenTime: number;
}): InternalState {
  const filteredSubmissions = inputData.submissions.filter((submission) =>
    userIds.includes(submission.userId)
  );

  const problemById: ProblemById = _.keyBy(inputData.problems, 'problemId');
  const submissionById: SubmissionById = _.keyBy(
    filteredSubmissions,
    'submissionId'
  );
  const pointByProblemId: PointByProblemId = _.mapValues(
    problemById,
    (problem) => problem.points
  );

  const publicState = processSubmissions({
    submissions: filteredSubmissions.filter(
      (submission) => submission.time < frozenTime
    ),
    inputData,
    pointByProblemId,
    problemById,
    submissionById
  });
  const privateState = processSubmissions({
    submissions: filteredSubmissions,
    inputData,
    pointByProblemId,
    problemById,
    submissionById
  });

  for (const userId in publicState.users) {
    const publicUser = publicState.users[userId];
    const privateUser = privateState.users[userId];
    publicUser.submissionIdsByProblemId = privateUser.submissionIdsByProblemId;

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

    publicUser.pendingSubmissionIds = _.sortBy(
      publicUser.pendingSubmissionIds,
      (id) => submissionById[id].problemId
    );
  }

  return publicState;
}
