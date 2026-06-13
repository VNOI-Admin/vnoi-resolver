// Sim orchestration over the event/state primitives in events.ts.
//
// The default-choice sequence is precomputed upfront so step/rollback are
// O(1) cursor moves. A non-default 1–9 pick diverges at the cursor: drop
// the tail, apply the new event, re-precompute from there.

import {
  applyEvent,
  computeNextEvent,
  type NextEventCtx,
  type ResolverEvent
} from './events';
import { rankUsers } from './ranking';
import type { InternalState, UserRow } from './types';

export type SimulationCtx = NextEventCtx & {
  unofficialContestants: string[];
};

// Per-event-type hold times in ms (ported from ICPC ResolutionUtil.java's
// DELAY_TIMES). These are the durations the operator's autoplay loop waits
// AFTER applying events[i] before firing events[i+1]; the value reflects
// the dramatic weight of the resulting state.
//
//   SELECT_TEAM:     camera lands on a new team — audience needs a beat
//                    to refocus before pills start lighting up.
//   SELECT_PROBLEM:  pending pill highlighted, verdict NOT yet revealed.
//                    The drama beat — long enough to be felt, short
//                    enough not to break tempo.
//   SOLVED_MOVE:     verdict was YES and the team's rank shifted. The
//                    longest hold: the audience has to absorb a row swap
//                    that propagates up the board.
//   SOLVED_STAY:     verdict YES but rank didn't change (rare — already
//                    at top of cluster, or partial credit that didn't
//                    pass anyone). Shorter; nothing to watch settle.
//   FAILED:          verdict NO. Anticlimactic; move on.
//   DEFAULT:         show_award / hide_award / end — autoplay
//                    auto-pauses on awards anyway, so these are only
//                    consulted when the operator manually resumes.
export const HOLD_MS = {
  SELECT_TEAM: 1300,
  SELECT_PROBLEM: 1000,
  SOLVED_MOVE: 2250,
  SOLVED_STAY: 1500,
  FAILED: 850,
  DEFAULT: 1000
} as const;

export type SimState = {
  base: InternalState;
  cursor: number;
  events: ResolverEvent[];
  // Invariant: states.length === events.length + 1 === eventHoldMs.length + 1.
  // states[i] is the state *before* applying events[i]; states[cursor] is
  // the visible state now.
  states: InternalState[];
  // eventHoldMs[i] is the autoplay hold time AFTER applying events[i] —
  // the duration the audience spends looking at the dramatic result of
  // events[i] before events[i+1] fires. Indexed in lockstep with events[].
  eventHoldMs: number[];
};

export type SimAction =
  | { type: 'step'; choice: number | undefined }
  | { type: 'rollback' }
  // Absolute cursor move along the existing precomputed timeline. Used by
  // operator jump-navigation. A seek NEVER diverges (choices are unchanged),
  // so it's an O(1) cursor set — and broadcasting it as ONE action keeps the
  // audience exactly in sync, vs. flooding N step/rollback messages.
  | { type: 'seek'; cursor: number };

// Hard cap to keep a malformed dataset from looping forever. Real datasets
// terminate in ~1k events; this leaves 3 orders of magnitude of slack.
export const PRECOMPUTE_GUARD = 1_000_000;

function rankByUserId(ranking: UserRow[]): Map<number, string> {
  const m = new Map<number, string>();
  for (const r of ranking) m.set(r.userId, r.rank);
  return m;
}

// Classify a single event's aftermath into a hold duration.
// `beforeRanking` is the ranking computed for the pre-event state;
// `afterRanking` is for the post-event state. Both are required to detect
// the SOLVED_MOVE / SOLVED_STAY distinction.
export function classifyHoldMs(
  event: ResolverEvent,
  beforeRanking: UserRow[],
  afterRanking: UserRow[],
  ctx: SimulationCtx
): number {
  switch (event.kind) {
    case 'mark_user':
      return HOLD_MS.SELECT_TEAM;
    case 'mark_problem':
      return HOLD_MS.SELECT_PROBLEM;
    case 'resolve': {
      const sub = ctx.submissionById[event.submissionId];
      if (!sub || sub.points === 0) return HOLD_MS.FAILED;
      const beforeRank = rankByUserId(beforeRanking).get(event.userId);
      const afterRank = rankByUserId(afterRanking).get(event.userId);
      return beforeRank !== afterRank
        ? HOLD_MS.SOLVED_MOVE
        : HOLD_MS.SOLVED_STAY;
    }
    case 'show_award':
    case 'hide_award':
    case 'end':
      return HOLD_MS.DEFAULT;
  }
}

export function precomputeFrom(
  startState: InternalState,
  ctx: SimulationCtx
): {
  events: ResolverEvent[];
  states: InternalState[];
  eventHoldMs: number[];
} {
  const events: ResolverEvent[] = [];
  const states: InternalState[] = [startState];
  const eventHoldMs: number[] = [];
  let state = startState;
  // Roll ranking forward across iterations: prevRanking starts as
  // rankUsers(state[0]) and afterRanking gets reused as the next iter's
  // prevRanking. Saves a redundant rankUsers per event.
  let prevRanking = rankUsers(state, ctx.unofficialContestants);
  let i = 0;
  for (; i < PRECOMPUTE_GUARD; i++) {
    const next = computeNextEvent(state, prevRanking, ctx);
    if (!next) break;
    events.push(next);
    state = applyEvent(state, next, ctx);
    states.push(state);
    const afterRanking = rankUsers(state, ctx.unofficialContestants);
    eventHoldMs.push(classifyHoldMs(next, prevRanking, afterRanking, ctx));
    prevRanking = afterRanking;
    if (next.kind === 'end') break;
  }
  // Diagnostic if we hit the cap without emitting `end` — almost certainly
  // a malformed dataset producing an infinite event loop. Without this
  // signal the operator UI would silently show a truncated reveal.
  if (i === PRECOMPUTE_GUARD && events[events.length - 1]?.kind !== 'end') {
    console.error(
      `precomputeFrom: hit PRECOMPUTE_GUARD (${PRECOMPUTE_GUARD}) without ` +
        `terminating; reveal log is truncated. Likely a malformed dataset.`
    );
  }
  return { events, states, eventHoldMs };
}

export function initSimState(
  base: InternalState,
  ctx: SimulationCtx
): SimState {
  const { events, states, eventHoldMs } = precomputeFrom(base, ctx);
  return { base, cursor: 0, events, states, eventHoldMs };
}

export function makeReducer(ctx: SimulationCtx) {
  return (state: SimState, action: SimAction): SimState => {
    if (action.type === 'step') {
      if (state.cursor >= state.events.length) return state;

      // Precomputed events assume default choice (smallest problemId).
      // choice only matters at a mark_problem boundary; choice===0 is the
      // default (pendingSubmissionIds is sorted by problemId).
      const precomputed = state.events[state.cursor]!;
      const choiceIsDefault =
        action.choice === undefined ||
        action.choice === 0 ||
        precomputed.kind !== 'mark_problem';

      if (choiceIsDefault) {
        return { ...state, cursor: state.cursor + 1 };
      }

      // Non-default choice → diverge. Re-precompute from the new state.
      const currentState = state.states[state.cursor]!;
      const beforeRanking = rankUsers(currentState, ctx.unofficialContestants);
      const newEvent = computeNextEvent(
        currentState,
        beforeRanking,
        ctx,
        action.choice
      );
      if (!newEvent) return state; // choice out of range — no-op

      const newState = applyEvent(currentState, newEvent, ctx);
      const afterRanking = rankUsers(newState, ctx.unofficialContestants);
      const newHoldMs = classifyHoldMs(
        newEvent,
        beforeRanking,
        afterRanking,
        ctx
      );
      const tail = precomputeFrom(newState, ctx);
      return {
        base: state.base,
        events: [
          ...state.events.slice(0, state.cursor),
          newEvent,
          ...tail.events
        ],
        states: [
          ...state.states.slice(0, state.cursor + 1),
          newState,
          ...tail.states.slice(1)
        ],
        eventHoldMs: [
          ...state.eventHoldMs.slice(0, state.cursor),
          newHoldMs,
          ...tail.eventHoldMs
        ],
        cursor: state.cursor + 1
      };
    }

    if (action.type === 'seek') {
      // O(1) absolute move, clamped. Same-cursor seeks return the same
      // reference so callers/memo stay stable.
      const target = Math.max(0, Math.min(state.events.length, action.cursor));
      if (target === state.cursor) return state;
      return { ...state, cursor: target };
    }

    // rollback
    if (state.cursor === 0) return state;
    return { ...state, cursor: state.cursor - 1 };
  };
}
