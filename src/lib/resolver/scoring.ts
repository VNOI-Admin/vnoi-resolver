export function getScoreClass(
  userPoints: number,
  problemPoints: number
): string {
  if (userPoints === problemPoints) {
    return 'score_100';
  } else if (userPoints === 0) {
    return 'score_0';
  } else {
    return 'score_40_50';
  }
}
