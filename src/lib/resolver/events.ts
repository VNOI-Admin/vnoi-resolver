import _ from 'lodash';
import {
  ImageData,
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
  imageData: ImageData;
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

    case 'mark_problem':
      return { ...state, markedProblemId: event.problemId };

    case 'resolve': {
      const submission = ctx.submissionById[event.submissionId];
      const user = state.users[event.userId];
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
  const problemPoints = ctx.pointByProblemId[problemId];

  let points = user.points;
  let lastAlteringByProblem = user.lastAlteringScoreSubmissionIdByProblemId;
  let lastAltering = user.lastAlteringScoreSubmissionId;

  if (submission.points > user.points[problemId]) {
    points = { ...points, [problemId]: submission.points };
    lastAlteringByProblem = {
      ...lastAlteringByProblem,
      [problemId]: submissionId
    };
    lastAltering = Math.max(lastAltering, submissionId);
  } else if (submission.points === 0 && user.points[problemId] === 0) {
    lastAlteringByProblem = {
      ...lastAlteringByProblem,
      [problemId]: submissionId
    };
  }

  const finalPoints = points[problemId];
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

  if (user.pendingSubmissionIds.length > 0) {
    if (state.markedProblemId === -1) {
      let pickedId: number | undefined;
      if (choice !== undefined) {
        if (choice < 0 || choice >= user.pendingSubmissionIds.length) {
          return null;
        }
        pickedId = user.pendingSubmissionIds[choice];
      } else {
        pickedId = _.minBy(
          user.pendingSubmissionIds,
          (id) => ctx.submissionById[id].problemId
        );
      }
      if (pickedId === undefined) {
        return null;
      }
      const sub = ctx.submissionById[pickedId];
      return {
        kind: 'mark_problem',
        userId: targetUserId,
        problemId: sub.problemId,
        submissionId: pickedId
      };
    }
    const pendingId = user.pendingSubmissionIds.find(
      (id) => ctx.submissionById[id].problemId === state.markedProblemId
    );
    if (pendingId === undefined) {
      return null;
    }
    return { kind: 'resolve', userId: targetUserId, submissionId: pendingId };
  }

  const rank = ranking[state.currentRowIndex].rank;
  if (rank in ctx.imageData && !state.shownImage && state.imageSrc === null) {
    return { kind: 'show_award', rank, imageSrc: ctx.imageData[rank] };
  }
  if (state.shownImage && state.imageSrc !== null) {
    return { kind: 'hide_award' };
  }
  if (state.currentRowIndex === 0) {
    return { kind: 'end' };
  }

  const nextUserId = ranking[state.currentRowIndex - 1].userId;
  return {
    kind: 'mark_user',
    userId: nextUserId,
    rowIndex: state.currentRowIndex - 1
  };
}

export function replay(
  base: InternalState,
  events: ResolverEvent[],
  ctx: ApplyCtx
): InternalState {
  let state = base;
  for (const event of events) {
    state = applyEvent(state, event, ctx);
  }
  return state;
}
