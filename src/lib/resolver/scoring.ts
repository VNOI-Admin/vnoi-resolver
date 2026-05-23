/**
 * Bucket a partial-credit score into one of 12 CSS-friendly classes:
 *   score_0
 *   score_0_10, score_10_20, ..., score_90_100
 *   score_100
 * The class is consumed by the renderer to pick a pill colour.
 */
export function getScoreClass(
  userPoints: number,
  problemPoints: number
): string {
  if (userPoints === 0) return 'score_0';
  if (userPoints === problemPoints) return 'score_100';
  // Degenerate "no-max" problem: any non-zero answer is treated as full credit.
  if (problemPoints <= 0) return 'score_100';
  const ratio = Math.max(0, Math.min(1, userPoints / problemPoints));
  // Buckets 0..9; e.g. ratio 0.55 → bucket 5 → "score_50_60".
  const bucket = Math.min(9, Math.floor(ratio * 10));
  return `score_${bucket * 10}_${(bucket + 1) * 10}`;
}
