import type { InputSubmission, InternalUser, SubmissionById } from './types';

// Flat charge per wrong attempt that preceded a problem's score-improving
// submission, in the same "seconds" unit as submission.time.
const WRONG_ATTEMPT_PENALTY_SECONDS = 300;

// VNOI Cup's tiebreak at equal total score — NOT ICPC penalty. It is the time
// of the single LATEST score-improving submission across all problems (a
// finish time), plus WRONG_ATTEMPT_PENALTY_SECONDS per earlier wrong attempt
// on a solved problem; lower wins. Do not "fix" this toward ICPC's
// sum-of-per-problem-accept-times — that is a different metric and would
// reorder the board.
//
// The finish is found by comparing TIMES across the per-problem
// last-improving entries (id as tiebreak). submissionIds are only monotonic
// in time WITHIN one problem (exactly what parse validates), so a
// cross-problem max-by-id can land on an earlier submission that happens to
// carry a bigger id — hours off on the tiebreak. Each per-problem entry is
// that problem's true latest improving submission, so the by-time max over
// them is the user's genuine finish.
export function calculatePenalty(
  user: InternalUser,
  submissionById: SubmissionById
): number {
  let incorrect = 0;
  let finish: InputSubmission | null = null;
  for (const [problemIdStr, last] of Object.entries(
    user.lastAlteringScoreSubmissionIdByProblemId
  )) {
    const lastSub = submissionById[last]!;
    if (lastSub.points === 0) continue;

    const problemId = Number(problemIdStr);
    const subIds = user.submissionIdsByProblemId[problemId] ?? [];
    incorrect += subIds.filter((subId) => subId < last).length;

    if (
      finish === null ||
      lastSub.time > finish.time ||
      (lastSub.time === finish.time &&
        lastSub.submissionId > finish.submissionId)
    ) {
      finish = lastSub;
    }
  }

  if (finish === null) return 0;
  return finish.time + WRONG_ATTEMPT_PENALTY_SECONDS * incorrect;
}
