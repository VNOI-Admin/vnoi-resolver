import { ProblemAttemptStatus } from '../lib/resolver';

// The pill's text, ICPC-style: the score, then the total number of
// submissions on that problem in parentheses ("1500 (7)", "750? (5)",
// "? (4)"). Untried pills keep the ghost problem letter and no count.
// Pure so the composition rules are unit-testable without Pixi.
export function pillLabel(
  points: number,
  status: ProblemAttemptStatus,
  attempts: number,
  problemCode: string
): string {
  if (status === ProblemAttemptStatus.UNATTEMPTED) return problemCode;
  const base =
    status & ProblemAttemptStatus.PENDING ? `${points || ''}?` : String(points);
  return attempts > 0 ? `${base} (${attempts})` : base;
}
