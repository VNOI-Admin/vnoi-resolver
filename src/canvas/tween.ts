// Pure scalar tween state machine shared by every numeric animation (camera
// pan, row slide, score / penalty count-ups). Per-site easing and the output
// transform (round / floor / clamp / format) stay at the call site; this owns
// the from→to→start bookkeeping — where the snap-on-retarget bugs lived — so it
// can be unit-tested without a clock or a canvas.

export type Tween = { from: number; to: number; start: number };

export function isTweening(t: Tween): boolean {
  return t.from !== t.to;
}

export function tweenProgress(
  t: Tween,
  now: number,
  durationMs: number
): number {
  if (t.from === t.to || durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, (now - t.start) / durationMs));
}

export function tweenValue(
  t: Tween,
  now: number,
  durationMs: number,
  ease: (x: number) => number
): number {
  if (t.from === t.to) return t.to;
  return t.from + (t.to - t.from) * ease(tweenProgress(t, now, durationMs));
}

export function isTweenDone(
  t: Tween,
  now: number,
  durationMs: number
): boolean {
  return t.from === t.to || now - t.start >= durationMs;
}

// Re-aim toward `to` starting from `currentValue` (the value showing RIGHT
// NOW) and restart the clock at `now`. Snapshotting the shown value is what
// keeps a re-aim — a target change, or a duration change mid-flight (a speed-
// slider drag) — from jumping. The caller passes the actually-displayed value
// (which may be clamped / rounded), and decides WHEN to retarget; this never
// short-circuits, so it won't pointlessly restart a settled, unchanged tween
// (that guard belongs to the caller).
export function retarget(currentValue: number, to: number, now: number): Tween {
  return { from: currentValue, to, start: now };
}
