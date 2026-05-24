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
    const lastSub = submissionById[last]!;
    if (lastSub.points === 0) continue;

    const problemId = Number(problemIdStr);
    const subIds = user.submissionIdsByProblemId[problemId] ?? [];
    incorrect += subIds.filter((subId) => subId < last).length;
  }

  const lastAltering = submissionById[user.lastAlteringScoreSubmissionId];
  if (!lastAltering) return 0;
  return lastAltering.time + 300 * incorrect;
}
