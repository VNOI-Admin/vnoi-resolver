import { HOLD_MS } from '../lib/resolver';

// Autoplay pacing, pulled out of OperatorConsole so it's pure and testable.
//
// The delay before stepping away from `cursor` is the hold time of the event
// whose aftermath is currently on screen — events[cursor - 1] — scaled by
// playback speed. At cursor 0 there is no prior event, so the first step
// after resume fires immediately.
export function autoplayDelayMs(
  cursor: number,
  eventHoldMs: readonly number[],
  speed: number
): number {
  const prevIdx = cursor - 1;
  if (prevIdx < 0) return 0;
  return (eventHoldMs[prevIdx] ?? HOLD_MS.DEFAULT) / speed;
}

export type WakeState = { scheduledCursor: number; wakeMs: number };

// Advance the absolute autoplay wake target. The target accumulates so timer
// slop doesn't compound across a long reveal. It advances by exactly one hold
// ONLY when the cursor actually moves; a re-invocation at the same cursor
// (e.g. a speed-slider drag re-running the effect) returns the prior state
// unchanged. Advancing on a same-cursor call is the double-accrual that races
// the target seconds ahead and stalls the next step — the bug this guards.
export function nextWake(
  prev: WakeState | null,
  cursor: number,
  eventHoldMs: readonly number[],
  speed: number,
  now: number
): WakeState {
  // Resume: anchor to now and schedule the on-screen event's hold.
  if (prev === null) {
    return {
      scheduledCursor: cursor,
      wakeMs: now + autoplayDelayMs(cursor, eventHoldMs, speed)
    };
  }
  if (cursor !== prev.scheduledCursor) {
    return {
      scheduledCursor: cursor,
      wakeMs: prev.wakeMs + autoplayDelayMs(cursor, eventHoldMs, speed)
    };
  }
  return prev;
}
