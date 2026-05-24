// Minimal lodash stand-ins. Function-arg style (no string-key magic) for
// type safety and grep-friendliness.

export function keyBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => string | number
): Record<string, T> {
  // Throws on duplicate keys. Silent last-wins would lose a record (CSV-to-
  // JSON glitch, repeated import) and shift the entire downstream reveal —
  // the operator wants to know before the show starts.
  const result: Record<string, T> = {};
  for (const item of arr) {
    const key = String(keyFn(item));
    if (key in result) {
      throw new Error(`keyBy: duplicate key ${JSON.stringify(key)}`);
    }
    result[key] = item;
  }
  return result;
}

export function mapValues<V, R>(
  obj: Record<string, V>,
  fn: (value: V, key: string) => R
): Record<string, R> {
  const result: Record<string, R> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = fn(v, k);
  }
  return result;
}

export function sortBy<T>(
  arr: readonly T[],
  keyFn: (item: T) => number | string
): T[] {
  // Array.prototype.sort is stable in modern engines, matching lodash.
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
