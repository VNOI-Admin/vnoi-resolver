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
    // lastAlteringScoreSubmissionIdByProblemId is populated only with ids that
    // came from `submissions` (see build.ts processSubmissions), so the lookup
    // is always defined.
    const lastSub = submissionById[last]!;
    if (lastSub.points === 0) continue;

    const problemId = Number(problemIdStr);
    // submissionIdsByProblemId has an entry for every problemId in
    // `lastAlteringScoreSubmissionIdByProblemId` (both populated in lockstep
    // in processSubmissions).
    const subIds = user.submissionIdsByProblemId[problemId] ?? [];
    incorrect += subIds.filter((subId) => subId < last).length;
  }

  const lastAltering = submissionById[user.lastAlteringScoreSubmissionId];
  if (!lastAltering) return 0; // unreachable: id came from this submissionById
  return lastAltering.time + 300 * incorrect;
}
