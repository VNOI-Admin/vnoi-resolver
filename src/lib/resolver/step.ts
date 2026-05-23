import _ from 'lodash';
import {
  InternalState,
  PointByProblemId,
  ProblemAttemptStatus,
  SubmissionById
} from './types';
import { getScoreClass } from './scoring';
import { calculatePenalty } from './penalty';

export function applyResolveSubmission({
  state,
  submissionId,
  submissionById,
  pointByProblemId
}: {
  state: InternalState;
  submissionId: number;
  submissionById: SubmissionById;
  pointByProblemId: PointByProblemId;
}): InternalState {
  const next = _.cloneDeep(state);

  const submission = submissionById[submissionId];
  const user = next.users[submission.userId];
  const problemId = submission.problemId;

  if (submission.points > user.points[problemId]) {
    user.points[problemId] = submission.points;
    user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
    user.lastAlteringScoreSubmissionId = Math.max(
      user.lastAlteringScoreSubmissionId,
      submissionId
    );
  } else if (submission.points === 0 && user.points[problemId] === 0) {
    user.lastAlteringScoreSubmissionIdByProblemId[problemId] = submissionId;
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

  user.pendingSubmissionIds = _.without(
    user.pendingSubmissionIds,
    submissionId
  );

  user.penalty = calculatePenalty(user, submissionById);

  next.markedProblemId = -1;
  next.nextSubmissionId = -1;
  return next;
}
