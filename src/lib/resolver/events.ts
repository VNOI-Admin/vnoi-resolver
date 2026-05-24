import {
  AwardImageMap,
  InputSubmission,
  InternalState,
  InternalUser,
  PointByProblemId,
  ProblemAttemptStatus,
  SubmissionById,
  UserRow
} from './types';
import { getScoreClass } from './scoring';
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
      return { ...state, markedProblemId: event.problemId };
    }

    case 'resolve': {
      const submission = ctx.submissionById[event.submissionId];
      const user = state.users[event.userId];
      // The submission.userId check defends against malformed action logs
      // (e.g. replay against a dataset with recycled submissionIds) that
      // would otherwise credit User B's submission to User A.
      if (!submission || !user || submission.userId !== event.userId) {
        return state;
      }
      const newUser = applyResolveToUser(user, submission, ctx);
      return {
        ...state,
        users: { ...state.users, [event.userId]: newUser },
        markedProblemId: -1
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
        shownImage: false,
        imageSrc: null
      };
  }
}

function applyResolveToUser(
  user: InternalUser,
  submission: InputSubmission,
  ctx: ApplyCtx
): InternalUser {
  const problemId = submission.problemId;
  const submissionId = submission.submissionId;
  const problemPoints = ctx.pointByProblemId[problemId] ?? 0;
  const currentPoints = user.points[problemId] ?? 0;

  let points = user.points;
  let lastAlteringByProblem = user.lastAlteringScoreSubmissionIdByProblemId;
  let lastAltering = user.lastAlteringScoreSubmissionId;

  if (submission.points > currentPoints) {
    points = { ...points, [problemId]: submission.points };
    lastAlteringByProblem = {
      ...lastAlteringByProblem,
      [problemId]: submissionId
    };
    // Math.max-by-submissionId works as a "latest in time" tracker only
    // because we require submissionId to be monotonic in time (validated
    // at parse boundary). If a future input source breaks that invariant
    // (re-numbered IDs, recycled IDs), penalty would use the wrong time.
    lastAltering = Math.max(lastAltering, submissionId);
  } else if (submission.points === 0 && currentPoints === 0) {
    lastAlteringByProblem = {
      ...lastAlteringByProblem,
      [problemId]: submissionId
    };
  }

  const finalPoints = points[problemId] ?? 0;
  let status: ProblemAttemptStatus;
  if (finalPoints === 0) {
    status = ProblemAttemptStatus.INCORRECT;
  } else if (finalPoints < problemPoints) {
    status = ProblemAttemptStatus.PARTIAL;
  } else {
    status = ProblemAttemptStatus.ACCEPTED;
  }

  const next: InternalUser = {
    ...user,
    points,
    status: { ...user.status, [problemId]: status },
    scoreClass: {
      ...user.scoreClass,
      [problemId]: getScoreClass(finalPoints, problemPoints)
    },
    lastAlteringScoreSubmissionIdByProblemId: lastAlteringByProblem,
    lastAlteringScoreSubmissionId: lastAltering,
    pendingSubmissionIds: user.pendingSubmissionIds.filter(
      (id) => id !== submissionId
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
    const pendingId = user.pendingSubmissionIds.find(
      (id) => ctx.submissionById[id]?.problemId === state.markedProblemId
    );
    if (pendingId === undefined) {
      return null;
    }
    return { kind: 'resolve', userId: targetUserId, submissionId: pendingId };
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
