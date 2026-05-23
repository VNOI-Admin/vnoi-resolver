export const ROW_HEIGHT = 50;
export const HEADER_HEIGHT = 50;
export const RANK_WIDTH = 80;
export const PROBLEM_WIDTH = 90;
export const SCORE_WIDTH = 100;
export const TIME_WIDTH = 110;
export const NAME_MIN_WIDTH = 240;
export const PILL_HEIGHT = 30;
export const PILL_MARGIN_X = 8;

export type Layout = {
  rank: { x: number; w: number };
  name: { x: number; w: number };
  problems: { x: number; w: number }[]; // per-problem column
  score: { x: number; w: number };
  time: { x: number; w: number };
  totalWidth: number;
};

export function computeLayout(
  viewportWidth: number,
  problemCount: number
): Layout {
  const fixed =
    RANK_WIDTH + problemCount * PROBLEM_WIDTH + SCORE_WIDTH + TIME_WIDTH;
  const nameWidth = Math.max(NAME_MIN_WIDTH, viewportWidth - fixed);

  let x = 0;
  const rank = { x, w: RANK_WIDTH };
  x += RANK_WIDTH;
  const name = { x, w: nameWidth };
  x += nameWidth;
  const problems = Array.from({ length: problemCount }, () => {
    const col = { x, w: PROBLEM_WIDTH };
    x += PROBLEM_WIDTH;
    return col;
  });
  const score = { x, w: SCORE_WIDTH };
  x += SCORE_WIDTH;
  const time = { x, w: TIME_WIDTH };
  x += TIME_WIDTH;

  return { rank, name, problems, score, time, totalWidth: x };
}

export function formatPenalty(penaltySeconds: number): string {
  const total = Math.max(0, Math.floor(penaltySeconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
