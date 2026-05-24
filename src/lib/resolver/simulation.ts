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
import type { InternalState } from './types';

export type SimulationCtx = NextEventCtx & {
  unofficialContestants: string[];
};

export type SimState = {
  base: InternalState;
  cursor: number;
  events: ResolverEvent[];
  // Invariant: states.length === events.length + 1. states[i] is the state
  // *before* applying events[i]; states[cursor] is the visible state now.
  states: InternalState[];
};

export type SimAction =
  | { type: 'step'; choice: number | undefined }
  | { type: 'rollback' };

// Hard cap to keep a malformed dataset from looping forever. Real datasets
// terminate in ~1k events; this leaves 3 orders of magnitude of slack.
export const PRECOMPUTE_GUARD = 1_000_000;

export function precomputeFrom(
  startState: InternalState,
  ctx: SimulationCtx
): { events: ResolverEvent[]; states: InternalState[] } {
  const events: ResolverEvent[] = [];
  const states: InternalState[] = [startState];
  let state = startState;
  let i = 0;
  for (; i < PRECOMPUTE_GUARD; i++) {
    const ranking = rankUsers(state, ctx.unofficialContestants);
    const next = computeNextEvent(state, ranking, ctx);
    if (!next) break;
    events.push(next);
    state = applyEvent(state, next, ctx);
    states.push(state);
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
  return { events, states };
}

export function initSimState(
  base: InternalState,
  ctx: SimulationCtx
): SimState {
  const { events, states } = precomputeFrom(base, ctx);
  return { base, cursor: 0, events, states };
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
      const ranking = rankUsers(currentState, ctx.unofficialContestants);
      const newEvent = computeNextEvent(
        currentState,
        ranking,
        ctx,
        action.choice
      );
      if (!newEvent) return state; // choice out of range — no-op

      const newState = applyEvent(currentState, newEvent, ctx);
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
        cursor: state.cursor + 1
      };
    }

    if (state.cursor === 0) return state;
    return { ...state, cursor: state.cursor - 1 };
  };
}
