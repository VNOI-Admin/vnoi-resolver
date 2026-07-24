import {
  InputData,
  InputSubmission,
  InternalState,
  InternalUser,
  PointByProblemId,
  ProblemAttemptStatus,
  ProblemById,
  SubmissionById
} from './types';
import { applySubmissionToUser } from './events';
import { calculatePenalty } from './penalty';
import { keyBy, mapValues, sortBy } from './util';

export function processSubmissions({
  submissions,
  inputData,
  pointByProblemId,
  submissionById
}: {
  submissions: InputSubmission[];
  inputData: InputData;
  pointByProblemId: PointByProblemId;
  submissionById: SubmissionById;
}): InternalState {
  const state: InternalState = {
    shownImage: false,
    imageSrc: null,
    currentRowIndex: inputData.users.length - 1,
    markedUserId: -1,
    markedProblemId: -1,
    markedSubmissionId: -1,
    users: keyBy(
      inputData.users.map(
        (user): InternalUser => ({
          ...user,
          points: mapValues(pointByProblemId, () => 0),
          status: mapValues(
            pointByProblemId,
            () => ProblemAttemptStatus.UNATTEMPTED
          ),
          scoreClass: mapValues(pointByProblemId, () => 'a'),
          lastAlteringScoreSubmissionIdByProblemId: {},
          submissionIdsByProblemId: mapValues(
            pointByProblemId,
            () => [] as number[]
          ),
          pendingSubmissionIds: [],
          penalty: 0
        })
      ),
      (u) => u.userId
    )
  };

  // Fold the shared scoring transition over every submission (in submissionId
  // order); applySubmissionToUser keeps points/status/scoreClass/last-altering
  // in lockstep so there's no separate status pass to drift out of sync.
  for (const submission of sortBy(submissions, (s) => s.submissionId)) {
    const user = state.users[submission.userId];
    if (!user) continue; // user outside this contest
    const problemPoints = pointByProblemId[submission.problemId];
    if (problemPoints === undefined) continue; // unknown problem
    state.users[submission.userId] = applySubmissionToUser(
      user,
      submission,
      problemPoints,
      true
    );
  }

  for (const userId in state.users) {
    const user = state.users[userId]!;
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
    submissionById
  });
  const privateState = processSubmissions({
    submissions: filteredSubmissions,
    inputData,
    pointByProblemId,
    submissionById
  });

  // Iterate input-array order so the reveal addresses users as the contest
  // organizer intended, not by numeric userId order.
  for (const { userId } of inputData.users) {
    const publicUser = publicState.users[userId];
    const privateUser = privateState.users[userId];
    if (!publicUser || !privateUser) continue;
    // The public penalty was already computed against the public-only attempt
    // lists; swapping in the full (private) lists here stays consistent only
    // because calculatePenalty counts attempts with id < the public
    // last-altering id, and parse-time monotonicity guarantees post-freeze ids
    // are larger. The reveal needs the full lists so resolve-time penalty
    // recompute sees every attempt.
    publicUser.submissionIdsByProblemId = privateUser.submissionIdsByProblemId;

    for (const problem of inputData.problems) {
      const problemId = problem.problemId;
      // Pending means "has ANY attempt at/after the freeze", NOT "the
      // score-altering chain moved". A partial scored before the freeze
      // followed by only non-improving attempts after it (vnoicup26 F:
      // 750 pre-freeze, then four WAs) must still freeze as "750?" and get
      // its reveal moment — comparing last-altering ids alone silently
      // resolved it at build time and skipped the suspense.
      const attempts = privateUser.submissionIdsByProblemId[problemId] ?? [];
      let lastPostFreezeId: number | undefined;
      for (const id of attempts) {
        const sub = submissionById[id];
        // Ids ascend with time (parse enforces monotonicity), so the last
        // match is the latest post-freeze attempt.
        if (sub && sub.time >= frozenTime) lastPostFreezeId = id;
      }
      if (lastPostFreezeId === undefined) continue;

      const publicLast =
        publicUser.lastAlteringScoreSubmissionIdByProblemId[problemId];
      const privateLast =
        privateUser.lastAlteringScoreSubmissionIdByProblemId[problemId];
      // Resolve the submission that lands the final score when the score
      // moved after the freeze; otherwise the last post-freeze attempt —
      // applying it is a no-op on points, so the reveal flips "750?" to 750
      // and the board stays put.
      const pendingId =
        privateLast !== undefined && privateLast !== publicLast
          ? privateLast
          : lastPostFreezeId;
      publicUser.pendingSubmissionIds.push(pendingId);
      publicUser.status[problemId] =
        (publicUser.status[problemId] ?? ProblemAttemptStatus.UNATTEMPTED) |
        ProblemAttemptStatus.PENDING;
    }

    publicUser.pendingSubmissionIds = sortBy(
      publicUser.pendingSubmissionIds,
      (id) => submissionById[id]!.problemId
    );
  }

  return publicState;
}
