// Pure target-finders for operator jump navigation. Each returns the cursor
// the operator should land on (poised to reveal the sought event) or null
// when no such event exists in the requested direction.
//
// "Land poised" means the returned cursor C is such that events[C] is the
// sought event — a single → (or the autoplay loop) then fires it. This lets
// the operator stop just before an award for the ceremony beat, or just
// before a big rank shift to let it play out.

import type { HoldClass, ResolverEvent } from '../lib/resolver';

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

// A "rank change" is an event classified SOLVED_MOVE — a resolve with
// points > 0 that shifted the team's rank. eventClass[c] tags events[c]'s
// aftermath, so matching the tag (not a hold-time value) keeps jump-nav
// correct even if HOLD_MS is retuned.
export function nextMoveCursor(
  eventClass: readonly HoldClass[],
  cursor: number
): number | null {
  return nextWhere(
    eventClass.length,
    cursor,
    (c) => eventClass[c] === 'SOLVED_MOVE'
  );
}

export function prevMoveCursor(
  eventClass: readonly HoldClass[],
  cursor: number
): number | null {
  return prevWhere(cursor, (c) => eventClass[c] === 'SOLVED_MOVE');
}
