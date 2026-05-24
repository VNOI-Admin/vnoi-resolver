// 2-row card layout (ICPC-style), sized for ceremony projection.
//
//   ┌────────────────────────────────────────────────────────────────────┐
//   │ RANK  NAME ............................          SCORE     TIME    │  ← TOP_ROW_HEIGHT
//   │       [pill][pill][pill][pill][pill][pill][pill][pill]              │  ← PILL_ROW_HEIGHT
//   └────────────────────────────────────────────────────────────────────┘

export const TOP_ROW_HEIGHT = 48;
export const PILL_ROW_HEIGHT = 48;
export const CARD_HEIGHT = TOP_ROW_HEIGHT + PILL_ROW_HEIGHT;

// Shorter than a card — just label + point-value subscript, no pills.
export const HEADER_HEIGHT = 70;

export const RANK_WIDTH = 100;
export const SCORE_WIDTH = 130;
export const TIME_WIDTH = 120;
export const NAME_MIN_WIDTH = 400;

export const PILL_HEIGHT = 38;
export const PILL_GAP = 2;
export const PILL_AREA_PADDING_X = 8;
export const PILL_MIN_WIDTH = 70;

export const PILL_Y = TOP_ROW_HEIGHT + (PILL_ROW_HEIGHT - PILL_HEIGHT) / 2;

export type Layout = {
  rank: { x: number; w: number };
  name: { x: number; w: number };
  problems: { x: number; w: number }[]; // x is the pill's left edge, w its width
  score: { x: number; w: number };
  time: { x: number; w: number };
  totalWidth: number;
};

export function computeLayout(
  viewportWidth: number,
  problemCount: number
): Layout {
  const nameWidth = Math.max(
    NAME_MIN_WIDTH,
    viewportWidth - RANK_WIDTH - SCORE_WIDTH - TIME_WIDTH
  );

  let x = 0;
  const rank = { x, w: RANK_WIDTH };
  x += RANK_WIDTH;
  const name = { x, w: nameWidth };

  // Pills tile under the name. Width is floored at PILL_MIN_WIDTH so
  // many-problem contests overflow rather than shrink into illegibility.
  const pillAreaX = name.x + PILL_AREA_PADDING_X;
  const pillAreaW = nameWidth - PILL_AREA_PADDING_X * 2;
  const fluidPillW =
    problemCount > 0
      ? (pillAreaW - PILL_GAP * (problemCount - 1)) / problemCount
      : 0;
  const pillW = Math.max(PILL_MIN_WIDTH, fluidPillW);
  const problems = Array.from({ length: problemCount }, (_, i) => ({
    x: pillAreaX + i * (pillW + PILL_GAP),
    w: pillW
  }));

  x += nameWidth;
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
