// Pure target-finders for operator jump navigation. Each returns the cursor
// the operator should land on (poised to reveal the sought event) or null
// when no such event exists in the requested direction.
//
// "Land poised" means the returned cursor C is such that events[C] is the
// sought event — a single → (or the autoplay loop) then fires it. This lets
// the operator stop just before an award for the ceremony beat, or just
// before a big rank shift to let it play out.

import type { ResolverEvent } from '../lib/resolver';
import { HOLD_MS } from '../lib/resolver';

function nextWhere(
  length: number,
  cursor: number,
  pred: (c: number) => boolean
): number | null {
  for (let c = cursor + 1; c < length; c++) if (pred(c)) return c;
  return null;
}

function prevWhere(
  cursor: number,
  pred: (c: number) => boolean
): number | null {
  for (let c = cursor - 1; c >= 0; c--) if (pred(c)) return c;
  return null;
}

export function nextAwardCursor(
  events: readonly ResolverEvent[],
  cursor: number
): number | null {
  return nextWhere(
    events.length,
    cursor,
    (c) => events[c]!.kind === 'show_award'
  );
}

export function prevAwardCursor(
  events: readonly ResolverEvent[],
  cursor: number
): number | null {
  return prevWhere(cursor, (c) => events[c]!.kind === 'show_award');
}

// A "rank change" is an event whose aftermath was classified SOLVED_MOVE —
// a resolve with points > 0 that shifted the team's rank. eventHoldMs[c] is
// the hold AFTER events[c], so eventHoldMs[c] === SOLVED_MOVE means
// events[c] is the rank-mover.
export function nextMoveCursor(
  eventHoldMs: readonly number[],
  cursor: number
): number | null {
  return nextWhere(
    eventHoldMs.length,
    cursor,
    (c) => eventHoldMs[c] === HOLD_MS.SOLVED_MOVE
  );
}

export function prevMoveCursor(
  eventHoldMs: readonly number[],
  cursor: number
): number | null {
  return prevWhere(cursor, (c) => eventHoldMs[c] === HOLD_MS.SOLVED_MOVE);
}
