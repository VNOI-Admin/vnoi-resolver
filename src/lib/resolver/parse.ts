import type { InputData, InputSubmission } from './types';

type RawSubmission = Omit<InputSubmission, 'time'> & { time: number | string };
type RawInputData = Omit<InputData, 'submissions'> & {
  submissions: RawSubmission[];
};

function requireFiniteNumber(
  field: string,
  value: unknown,
  submissionIndex: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `submission #${submissionIndex} missing/invalid ${field}: ${JSON.stringify(value)}`
    );
  }
  return value;
}

export function parseInputData(raw: unknown): InputData {
  const data = raw as RawInputData;
  // Downstream penalty calc uses Math.max(lastAlteringId, submissionId) as
  // a "latest in time" tracker, which is sound only if submissionId is
  // monotonic in submission time. Validate as we walk so a re-numbered or
  // recycled-ID dataset fails loudly here instead of silently miscomputing
  // penalty hours later.
  type SeenById = { time: number; submissionId: number };
  const byUserProblem = new Map<string, SeenById>();
  return {
    ...data,
    submissions: data.submissions.map((submission, i) => {
      // Number(), not parseFloat(): parseFloat happily eats a numeric prefix
      // (`parseFloat("2342.1a705")` → 2342.1) and passes the isFinite guard,
      // silently shifting every downstream penalty.
      const rawTime = submission.time;
      const num = typeof rawTime === 'number' ? rawTime : Number(rawTime);
      if (!Number.isFinite(num)) {
        throw new Error(
          `submission ${submission.submissionId} has a non-numeric time: ${JSON.stringify(submission.time)}`
        );
      }
      // Floor to whole seconds — ranking.ts groups ties with strict `!==`
      // on penalty, and fractional times would split otherwise-tied users.
      const time = Math.floor(num);
      // Validate the other required numeric fields up front rather than
      // letting undefined/NaN cascade into mysterious zero-scores or
      // dropped submissions deep in build.ts.
      const submissionId = requireFiniteNumber(
        'submissionId',
        submission.submissionId,
        i
      );
      const userId = requireFiniteNumber('userId', submission.userId, i);
      const problemId = requireFiniteNumber(
        'problemId',
        submission.problemId,
        i
      );
      const points = requireFiniteNumber('points', submission.points, i);
      // Monotonic check per (userId, problemId): for a given user on a
      // given problem, later submissions should have larger submissionIds.
      // We only enforce the invariant within a user-problem because
      // across the dataset submissions can interleave by time-but-not-id
      // depending on judge implementations.
      const key = `${userId}:${problemId}`;
      const prev = byUserProblem.get(key);
      if (prev !== undefined) {
        if (
          (submission.time === undefined || time >= prev.time) &&
          submissionId < prev.submissionId
        ) {
          throw new Error(
            `submission #${i} (${submissionId}) for user ${userId} problem ${problemId} ` +
              `is later in time than #${prev.submissionId} but has a smaller id. ` +
              `Penalty calculation assumes submissionId is monotonic in time.`
          );
        }
      }
      if (prev === undefined || time >= prev.time) {
        byUserProblem.set(key, { time, submissionId });
      }
      return { submissionId, userId, problemId, time, points };
    })
  };
}
