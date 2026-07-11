import { ProblemAttemptStatus } from './types';

/**
 * Bucket a partial-credit score into one of 12 CSS-friendly classes:
 *   score_0, score_0_10, score_10_20, ..., score_90_100, score_100
 * Consumed by the renderer to pick a pill colour.
 */
export function getScoreClass(
  userPoints: number,
  problemPoints: number
): string {
  if (userPoints <= 0) return 'score_0';
  if (userPoints === problemPoints) return 'score_100';
  // Degenerate "no-max" problem: any non-zero answer is full credit.
  if (problemPoints <= 0) return 'score_100';
  const ratio = Math.max(0, Math.min(1, userPoints / problemPoints));
  const bucket = Math.min(9, Math.floor(ratio * 10));
  return `score_${bucket * 10}_${(bucket + 1) * 10}`;
}

// The single source of truth for a problem's verdict + pill colour, given the
// score it has settled on. The PENDING bit is layered on separately (it comes
// from the reveal state, not the score), so this only ever returns one of
// INCORRECT / PARTIAL / ACCEPTED — callers apply it to problems that have at
// least one submission; unattempted problems keep their UNATTEMPTED seed.
export function classifyProblem(
  userPoints: number,
  problemPoints: number
): { status: ProblemAttemptStatus; scoreClass: string } {
  const status =
    userPoints === 0
      ? ProblemAttemptStatus.INCORRECT
      : userPoints < problemPoints
        ? ProblemAttemptStatus.PARTIAL
        : ProblemAttemptStatus.ACCEPTED;
  return { status, scoreClass: getScoreClass(userPoints, problemPoints) };
}
