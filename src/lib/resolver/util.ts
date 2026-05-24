// Minimal stand-ins for the four lodash helpers this codebase actually uses.
// Function-arg style (no string-key magic) — verbose at the call site but
// type-safe and grep-friendly.

export function keyBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => string | number
): Record<string, T> {
  const result: Record<string, T> = {};
  for (const item of arr) {
    result[String(keyFn(item))] = item;
  }
  return result;
}

export function mapValues<V, R>(
  obj: Record<string, V>,
  fn: (value: V, key: string) => R
): Record<string, R> {
  const result: Record<string, R> = {};
  // `Object.entries(obj)` types each `[k, v]` as `[string, V]` — no
  // `undefined` like `obj[k]` would under noUncheckedIndexedAccess.
  for (const [k, v] of Object.entries(obj)) {
    result[k] = fn(v, k);
  }
  return result;
}

export function sortBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => number | string
): T[] {
  // Array.prototype.sort is stable in all modern engines, matching lodash's
  // sortBy contract.
  const sorted = [...arr];
  sorted.sort((a, b) => {
    const av = keyFn(a);
    const bv = keyFn(b);
    if (av < bv) return -1;
    if (av > bv) return 1;
    return 0;
  });
  return sorted;
}

export function minBy<T>(
  arr: readonly T[],
  fn: (item: T) => number
): T | undefined {
  if (arr.length === 0) return undefined;
  // `arr[0]` typed `T | undefined` under noUncheckedIndexedAccess; we just
  // verified length > 0 so the non-null assertion is safe.
  let best = arr[0]!;
  let bestVal = fn(best);
  for (let i = 1; i < arr.length; i++) {
    const item = arr[i]!;
    const v = fn(item);
    if (v < bestVal) {
      best = item;
      bestVal = v;
    }
  }
  return best;
}
