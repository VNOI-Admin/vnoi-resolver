// Pure formatters for the operator console.

import type {
  InputData,
  InputProblem,
  InputSubmission,
  InputUser,
  ResolverEvent
} from '../lib/resolver';
import { getProblemCodeFromIndex } from '../lib/resolver';

export type LookupCtx = {
  usersById: { [id: number]: InputUser };
  problemsById: { [id: number]: InputProblem };
  problemIndexById: { [id: number]: number };
  submissionsById: { [id: number]: InputSubmission };
};

export function buildLookupCtx(inputData: InputData): LookupCtx {
  const usersById: LookupCtx['usersById'] = {};
  for (const u of inputData.users) usersById[u.userId] = u;
  const problemsById: LookupCtx['problemsById'] = {};
  const problemIndexById: LookupCtx['problemIndexById'] = {};
  inputData.problems.forEach((p, i) => {
    problemsById[p.problemId] = p;
    problemIndexById[p.problemId] = i;
  });
  const submissionsById: LookupCtx['submissionsById'] = {};
  for (const s of inputData.submissions) submissionsById[s.submissionId] = s;
  return { usersById, problemsById, problemIndexById, submissionsById };
}

// MM:SS or H:MM:SS for long sessions.
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;
}

// "23 → 18 ▲5" / "5 → 12 ▼7" / "10" (collapsed when unchanged — printing
// "10 → 10" is visual noise the operator has to read past).
export function formatRankDelta(from: string, to: string): string {
  if (!from || !to) return '—';
  if (from === to) return from;
  const fromN = parseInt(from, 10);
  const toN = parseInt(to, 10);
  if (!Number.isFinite(fromN) || !Number.isFinite(toN)) {
    return `${from} → ${to}`;
  }
  const delta = Math.abs(fromN - toN);
  const arrow = toN < fromN ? '▲' : '▼';
  return `${from} → ${to} ${arrow}${delta}`;
}

function userLabel(userId: number, ctx: LookupCtx): string {
  const u = ctx.usersById[userId];
  return u ? `${u.fullName} (${u.username})` : `user #${userId}`;
}

function problemLabel(problemId: number, ctx: LookupCtx): string {
  const p = ctx.problemsById[problemId];
  const idx = ctx.problemIndexById[problemId];
  const code = idx !== undefined ? getProblemCodeFromIndex(idx) : '?';
  return p ? `${code}. ${p.name}` : `problem #${problemId}`;
}

export type EventDescription = {
  long: string;
  expectedPoints?: number;
  problemPoints?: number;
  // True when this event triggers something dramatic in the audience window
  // (award fires, big rank shift after resolve, end of contest).
  dramatic?: boolean;
};

export function describeEvent(
  event: ResolverEvent,
  ctx: LookupCtx
): EventDescription {
  switch (event.kind) {
    case 'mark_user':
      return { long: userLabel(event.userId, ctx) };
    case 'mark_problem': {
      const sub = ctx.submissionsById[event.submissionId];
      const prob = ctx.problemsById[event.problemId];
      return {
        long: `${userLabel(event.userId, ctx)} — ${problemLabel(event.problemId, ctx)}`,
        expectedPoints: sub?.points,
        problemPoints: prob?.points
      };
    }
    case 'resolve': {
      const sub = ctx.submissionsById[event.submissionId];
      const prob = sub ? ctx.problemsById[sub.problemId] : undefined;
      return {
        long: sub
          ? `${userLabel(event.userId, ctx)} — ${problemLabel(sub.problemId, ctx)}`
          : userLabel(event.userId, ctx),
        expectedPoints: sub?.points,
        problemPoints: prob?.points,
        dramatic: sub ? sub.points > 0 : false
      };
    }
    case 'show_award':
      return {
        long: `Award overlay fires for rank ${event.rank}`,
        dramatic: true
      };
    case 'hide_award':
      return { long: 'Award overlay clears' };
    case 'end':
      return { long: 'Final ranking sealed', dramatic: true };
  }
}

// Summarise what's currently on the audience screen — latest mark_user,
// latest resolve. Walks backwards from cursor-1 with early break: a typical
// reveal finds both within ~5–10 events of the cursor, so this is O(1)-ish
// in practice rather than O(cursor).
export function summariseNow(
  events: readonly ResolverEvent[],
  cursor: number,
  ctx: LookupCtx
): {
  lastResolve: EventDescription | null;
  activeUserId: number | null;
} {
  let lastResolve: ResolverEvent | null = null;
  let activeUserId: number | null = null;
  let needResolve = true;
  let needUser = true;
  for (let i = cursor - 1; i >= 0 && (needResolve || needUser); i--) {
    const e = events[i]!;
    if (needResolve && e.kind === 'resolve') {
      lastResolve = e;
      needResolve = false;
    }
    if (needUser) {
      if (e.kind === 'end') {
        // Looking back: end means we're past it. activeUser is null.
        needUser = false;
      } else if (e.kind === 'mark_user') {
        activeUserId = e.userId;
        needUser = false;
      }
    }
  }
  return {
    lastResolve: lastResolve ? describeEvent(lastResolve, ctx) : null,
    activeUserId
  };
}
