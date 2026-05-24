// Sim-level orchestration over the event/state primitives in events.ts.
//
// The reveal is deterministic given (inputData, frozenTime, choices). We
// precompute the entire default-choice sequence upfront with `precomputeFrom`,
// so `step` / `rollback` become O(1) cursor moves on the precomputed arrays.
//
// If the user picks a non-default problem with 1-9, the reducer diverges at
// the current cursor: drops the tail, applies the new event, and re-precomputes
// from there.

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

// Hard cap to keep a malformed dataset from looping forever. The vnoicup24
// reveal terminates in ~1k events; this leaves 3 orders of magnitude of slack.
export const PRECOMPUTE_GUARD = 1_000_000;

export function precomputeFrom(
  startState: InternalState,
  ctx: SimulationCtx
): { events: ResolverEvent[]; states: InternalState[] } {
  const events: ResolverEvent[] = [];
  const states: InternalState[] = [startState];
  let state = startState;
  for (let i = 0; i < PRECOMPUTE_GUARD; i++) {
    const ranking = rankUsers(state, ctx.unofficialContestants);
    const next = computeNextEvent(state, ranking, ctx);
    if (!next) break;
    events.push(next);
    state = applyEvent(state, next, ctx);
    states.push(state);
    if (next.kind === 'end') break;
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

      // The precomputed event was generated assuming the default choice
      // (smallest problemId). `choice` only matters at a `mark_problem`
      // boundary; for any other event kind it's a no-op. `choice === 0` is
      // also identical to the default since pendingSubmissionIds is sorted
      // by problemId.
      // Guarded by the cursor-range check above: cursor < events.length.
      const precomputed = state.events[state.cursor]!;
      const choiceIsDefault =
        action.choice === undefined ||
        action.choice === 0 ||
        precomputed.kind !== 'mark_problem';

      if (choiceIsDefault) {
        return { ...state, cursor: state.cursor + 1 };
      }

      // Non-default choice on a mark_problem step → diverge. Re-precompute
      // the tail from the new state. `states[cursor]` exists by invariant
      // (states.length === events.length + 1, cursor in range).
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
