import type { InternalUser, SubmissionById } from './types';

export function calculatePenalty(
  user: InternalUser,
  submissionById: SubmissionById
): number {
  if (user.lastAlteringScoreSubmissionId === -1) {
    return 0;
  }

  let incorrect = 0;
  for (const [problemIdStr, last] of Object.entries(
    user.lastAlteringScoreSubmissionIdByProblemId
  )) {
    if (submissionById[last].points === 0) {
      continue;
    }

    const problemId = Number(problemIdStr);
    incorrect += user.submissionIdsByProblemId[problemId].filter(
      (submissionId) => submissionId < last
    ).length;
  }

  return (
    submissionById[user.lastAlteringScoreSubmissionId].time + 300 * incorrect
  );
}
