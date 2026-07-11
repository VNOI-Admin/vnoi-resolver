import {
  AwardImageMap,
  InputSubmission,
  InternalState,
  InternalUser,
  PointByProblemId,
  SubmissionById,
  UserRow
} from './types';
import { classifyProblem } from './scoring';
import { calculatePenalty } from './penalty';

export type ResolverEvent =
  | { kind: 'mark_user'; userId: number; rowIndex: number }
  | {
      kind: 'mark_problem';
      userId: number;
      problemId: number;
      submissionId: number;
    }
  | { kind: 'resolve'; userId: number; submissionId: number }
  | { kind: 'show_award'; rank: string; imageSrc: string }
  | { kind: 'hide_award' }
  | { kind: 'end' };

export type ApplyCtx = {
  submissionById: SubmissionById;
  pointByProblemId: PointByProblemId;
};

export type NextEventCtx = ApplyCtx & {
  imageData: AwardImageMap;
};

export function applyEvent(
  state: InternalState,
  event: ResolverEvent,
  ctx: ApplyCtx
): InternalState {
  switch (event.kind) {
    case 'mark_user':
      return {
        ...state,
        currentRowIndex: event.rowIndex,
        markedUserId: event.userId,
        markedProblemId: -1,
        markedSubmissionId: -1,
        shownImage: false,
        imageSrc: null
      };

    case 'mark_problem': {
      // The specific submissionId must be in this user's pending list AND
      // its problem/user must match. Matching problemId alone could pick the
      // wrong submission if a user had multiple pendings on one problem.
      // Throw rather than no-op: a silent no-op would let computeNextEvent
      // re-emit the same broken event next tick and mask the bug.
      const user = state.users[event.userId];
      const pendingSub =
        user && user.pendingSubmissionIds.includes(event.submissionId)
          ? ctx.submissionById[event.submissionId]
          : undefined;
      const valid =
        !!pendingSub &&
        pendingSub.problemId === event.problemId &&
        pendingSub.userId === event.userId;
      if (!valid) {
        throw new Error(
          `applyEvent: mark_problem with no matching pending submission ` +
            `(userId=${event.userId}, problemId=${event.problemId}, ` +
            `submissionId=${event.submissionId})`
        );
      }
      return {
        ...state,
        markedProblemId: event.problemId,
        markedSubmissionId: event.submissionId
      };
    }

    case 'resolve': {
      const submission = ctx.submissionById[event.submissionId];
      const user = state.users[event.userId];
      // Throw, don't no-op (same policy as mark_problem). computeNextEvent
      // only emits resolve for a pending submission that exists and belongs
      // to this user, so a mismatch means corrupt input. A silent no-op would
      // leave markedProblemId set and computeNextEvent would re-emit the same
      // resolve every iteration — an unbounded precompute loop.
      if (!submission || !user || submission.userId !== event.userId) {
        throw new Error(
          `applyEvent: resolve with no matching pending submission ` +
            `(userId=${event.userId}, submissionId=${event.submissionId})`
        );
      }
      const newUser = applyResolveToUser(user, submission, ctx);
      return {
        ...state,
        users: { ...state.users, [event.userId]: newUser },
        markedProblemId: -1,
        markedSubmissionId: -1
      };
    }

    case 'show_award':
      return { ...state, shownImage: true, imageSrc: event.imageSrc };

    case 'hide_award':
      // shownImage stays true until the next mark_user — the "already-shown-
      // for-this-user" guard that stops computeNextEvent from looping
      // show/hide forever.
      return { ...state, imageSrc: null };

    case 'end':
      return {
        ...state,
        currentRowIndex: -1,
        markedUserId: -1,
        markedProblemId: -1,
        markedSubmissionId: -1,
        shownImage: false,
        imageSrc: null
      };
  }
}

// The single VNOI scoring transition for one submission, shared by the build
// (folds it over every submission, recordAttempt = true to accumulate the
// attempt history) and the resolve event (recordAttempt = false — build
// already recorded the attempt). One implementation removes the old
// build-vs-resolve drift. Both an improving submission and a 0-on-0
// resubmission advance the per-problem last-altering id; only the improving
// one ends up counting toward the penalty finish time (calculatePenalty
// skips 0-point entries).
export function applySubmissionToUser(
  user: InternalUser,
  submission: InputSubmission,
  problemPoints: number,
  recordAttempt: boolean
): InternalUser {
  const problemId = submission.problemId;
  const submissionId = submission.submissionId;
  const currentPoints = user.points[problemId] ?? 0;

  let points = user.points;
  let lastAlteringByProblem = user.lastAlteringScoreSubmissionIdByProblemId;
  if (submission.points > currentPoints) {
    points = { ...points, [problemId]: submission.points };
    lastAlteringByProblem = {
      ...lastAlteringByProblem,
      [problemId]: submissionId
    };
  } else if (submission.points === 0 && currentPoints === 0) {
    lastAlteringByProblem = {
      ...lastAlteringByProblem,
      [problemId]: submissionId
    };
  }

  const { status, scoreClass } = classifyProblem(
    points[problemId] ?? 0,
    problemPoints
  );

  return {
    ...user,
    points,
    status: { ...user.status, [problemId]: status },
    scoreClass: { ...user.scoreClass, [problemId]: scoreClass },
    lastAlteringScoreSubmissionIdByProblemId: lastAlteringByProblem,
    submissionIdsByProblemId: recordAttempt
      ? {
          ...user.submissionIdsByProblemId,
          [problemId]: [
            ...(user.submissionIdsByProblemId[problemId] ?? []),
            submissionId
          ]
        }
      : user.submissionIdsByProblemId
  };
}

function applyResolveToUser(
  user: InternalUser,
  submission: InputSubmission,
  ctx: ApplyCtx
): InternalUser {
  const problemPoints = ctx.pointByProblemId[submission.problemId] ?? 0;
  const scored = applySubmissionToUser(user, submission, problemPoints, false);
  const next: InternalUser = {
    ...scored,
    pendingSubmissionIds: scored.pendingSubmissionIds.filter(
      (id) => id !== submission.submissionId
    ),
    penalty: 0
  };
  next.penalty = calculatePenalty(next, ctx.submissionById);
  return next;
}

export function computeNextEvent(
  state: InternalState,
  ranking: UserRow[],
  ctx: NextEventCtx,
  choice?: number
): ResolverEvent | null {
  if (state.currentRowIndex === -1) {
    return null;
  }

  const targetUserId = ranking[state.currentRowIndex]?.userId;
  if (targetUserId === undefined) {
    return null;
  }

  if (state.markedUserId !== targetUserId) {
    return {
      kind: 'mark_user',
      userId: targetUserId,
      rowIndex: state.currentRowIndex
    };
  }

  const user = state.users[targetUserId];
  if (!user) return null; // ranking referenced an unknown user

  if (user.pendingSubmissionIds.length > 0) {
    if (state.markedProblemId === -1) {
      // pendingSubmissionIds is sorted by problemId at build time, so [0]
      // is the lowest-problemId default.
      const pickedId =
        choice === undefined
          ? user.pendingSubmissionIds[0]
          : choice >= 0 && choice < user.pendingSubmissionIds.length
            ? user.pendingSubmissionIds[choice]
            : undefined;
      if (pickedId === undefined) return null;
      const sub = ctx.submissionById[pickedId];
      if (!sub) return null;
      return {
        kind: 'mark_problem',
        userId: targetUserId,
        problemId: sub.problemId,
        submissionId: pickedId
      };
    }
    // Resolve the exact submission mark_problem validated, not "some pending
    // on the marked problem" — the two differ if a user ever had multiple
    // pendings on one problem, and consuming markedSubmissionId removes the
    // dependence on build emitting at most one pending per problem.
    const markedId = state.markedSubmissionId;
    if (markedId === -1 || !user.pendingSubmissionIds.includes(markedId)) {
      return null;
    }
    return { kind: 'resolve', userId: targetUserId, submissionId: markedId };
  }

  const currentRow = ranking[state.currentRowIndex];
  if (!currentRow) return null;
  const rank = currentRow.rank;
  const awardSrc = ctx.imageData[rank];
  if (awardSrc && !state.shownImage && state.imageSrc === null) {
    return { kind: 'show_award', rank, imageSrc: awardSrc };
  }
  if (state.shownImage && state.imageSrc !== null) {
    return { kind: 'hide_award' };
  }
  if (state.currentRowIndex === 0) {
    return { kind: 'end' };
  }

  const nextRow = ranking[state.currentRowIndex - 1];
  if (!nextRow) return null;
  return {
    kind: 'mark_user',
    userId: nextRow.userId,
    rowIndex: state.currentRowIndex - 1
  };
}
