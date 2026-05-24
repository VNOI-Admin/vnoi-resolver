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
import { keyBy, mapValues, sortBy } from './util';

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
    users: keyBy(
      inputData.users.map((user) => ({
        ...user,
        points: mapValues(pointByProblemId, () => 0),
        status: mapValues(
          pointByProblemId,
          () => ProblemAttemptStatus.UNATTEMPTED
        ),
        scoreClass: mapValues(pointByProblemId, () => 'a'),
        lastAlteringScoreSubmissionIdByProblemId: {},
        lastAlteringScoreSubmissionId: -1,
        submissionIdsByProblemId: mapValues(
          pointByProblemId,
          () => [] as number[]
        ),
        pendingSubmissionIds: [] as number[],
        penalty: 0
      })),
      (u) => u.userId
    )
  };

  const sorted = sortBy(submissions, (s) => s.submissionId);

  for (const submission of sorted) {
    const user = state.users[submission.userId];
    if (!user) continue; // user outside this contest
    const problemId = submission.problemId;
    const submissionId = submission.submissionId;
    // user.points has every problemId in problemById, so undefined = unknown
    // problem (ignored).
    const userPoints = user.points[problemId];
    if (userPoints === undefined) continue;

    if (submission.points > userPoints) {
      user.points[problemId] = submission.points;
      user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
      user.lastAlteringScoreSubmissionId = submissionId;
    } else if (submission.points === 0 && userPoints === 0) {
      user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
    }

    user.submissionIdsByProblemId[problemId]!.push(submissionId);
  }

  for (const userId in state.users) {
    const user = state.users[userId]!; // key came from Object.keys(state.users)
    for (const problemId in problemById) {
      const subIds = user.submissionIdsByProblemId[problemId];
      if (!subIds || subIds.length === 0) continue;

      const userPts = user.points[problemId] ?? 0;
      const problemPts = pointByProblemId[problemId] ?? 0;
      if (userPts === 0) {
        user.status[problemId] = ProblemAttemptStatus.INCORRECT;
      } else if (userPts < problemPts) {
        user.status[problemId] = ProblemAttemptStatus.PARTIAL;
      } else {
        user.status[problemId] = ProblemAttemptStatus.ACCEPTED;
      }

      user.scoreClass[problemId] = getScoreClass(userPts, problemPts);
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
  const userIdSet = new Set(userIds);
  const filteredSubmissions = inputData.submissions.filter((submission) =>
    userIdSet.has(submission.userId)
  );

  const problemById: ProblemById = keyBy(
    inputData.problems,
    (p) => p.problemId
  );
  const submissionById: SubmissionById = keyBy(
    filteredSubmissions,
    (s) => s.submissionId
  );
  const pointByProblemId: PointByProblemId = mapValues(
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

  // Iterate input-array order so the reveal addresses users as the contest
  // organizer intended, not by numeric userId order.
  for (const { userId } of inputData.users) {
    const publicUser = publicState.users[userId];
    const privateUser = privateState.users[userId];
    if (!publicUser || !privateUser) continue;
    publicUser.submissionIdsByProblemId = privateUser.submissionIdsByProblemId;

    for (const problem of inputData.problems) {
      const problemId = problem.problemId;
      const publicLast =
        publicUser.lastAlteringScoreSubmissionIdByProblemId[problemId];
      const privateLast =
        privateUser.lastAlteringScoreSubmissionIdByProblemId[problemId];
      if (publicLast !== privateLast && privateLast !== undefined) {
        publicUser.pendingSubmissionIds.push(privateLast);
        publicUser.status[problemId] =
          (publicUser.status[problemId] ?? ProblemAttemptStatus.UNATTEMPTED) |
          ProblemAttemptStatus.PENDING;
      }
    }

    publicUser.pendingSubmissionIds = sortBy(
      publicUser.pendingSubmissionIds,
      (id) => submissionById[id]!.problemId
    );
  }

  return publicState;
}
