// Pure rendering DECISIONS for the scoreboard camera + row virtualization,
// pulled out of the Pixi component so the invariants that keep breaking (camera
// yo-yo, blank-band-on-big-jump) can be unit-tested without a browser.

import type { UserRow } from '../lib/resolver';
import { CARD_HEIGHT } from './layout';

// Rows the camera keeps visible below the framed row.
export const CURSOR_LOOKAHEAD_ROWS = 2;
// Rows mounted beyond the visible window so in-flight tweens don't pop.
export const OVERSCAN = 20;

// The row the camera frames. ALWAYS the cursor (currentRowIndex), which walks
// smoothly bottom→top for a monotonic scroll — never the marked row's live
// index, which jumps as a team resolves and would make the camera chase it up
// then snap back (a yo-yo). markedRowIndex is taken only to make this choice
// explicit and testable: point the body at it and the camera-monotonicity test
// over a real reveal fails.
export function framingIndex(
  currentRowIndex: number,
  _markedRowIndex: number
): number {
  return currentRowIndex;
}

// Camera scroll offset aligning (framed row + lookahead) to the viewport
// bottom, clamped so it never scrolls past the content edges.
export function cameraTargetY(
  framedIndex: number,
  contentHeight: number,
  bodyHeight: number
): number {
  if (framedIndex < 0) return 0;
  const bottom = (framedIndex + 1 + CURSOR_LOOKAHEAD_ROWS) * CARD_HEIGHT;
  const max = Math.max(0, contentHeight - bodyHeight);
  return Math.min(Math.max(0, bottom - bodyHeight), max);
}

// The contiguous slice of rows to mount: the camera path (prev target → new
// target → live cameraY) spanned by bodyHeight, plus overscan. The marked
// row needs no special case here — rowRenderList mounts it explicitly at its
// true index even when it lies outside this slice, and the camera never
// follows it (framingIndex frames the cursor), so the rows between the
// viewport and a far-off destination are off-screen for the entire flight.
// Unioning the destination in would mount hundreds of dead rows per long
// jump on a large board.
export function visibleRowRange(opts: {
  prevTargetY: number;
  targetY: number;
  cameraY: number;
  bodyHeight: number;
  dataLength: number;
}): { first: number; last: number } {
  const { prevTargetY, targetY, cameraY, bodyHeight, dataLength } = opts;
  if (dataLength === 0) return { first: 0, last: -1 };
  const minY = Math.min(prevTargetY, targetY, cameraY);
  const maxY = Math.max(prevTargetY, targetY, cameraY) + bodyHeight;
  const first = Math.max(0, Math.floor(minY / CARD_HEIGHT) - OVERSCAN);
  const last = Math.min(
    dataLength - 1,
    Math.ceil(maxY / CARD_HEIGHT) + OVERSCAN
  );
  return { first, last };
}

export type RowRenderEntry = {
  row: UserRow;
  targetIndex: number;
  isMarked: boolean;
};

// Body render order: every visible non-marked row at its data index, then the
// marked row LAST so it paints above passers-by (zIndex alone has desynced
// under rapid cycles). The marked row may sit outside the visible slice — it's
// always mounted — so it's passed explicitly with its true index.
export function rowRenderList(opts: {
  visibleData: readonly UserRow[];
  firstVisibleIndex: number;
  markedUserId: number;
  markedRow: UserRow | undefined;
  markedRowIndex: number;
}): RowRenderEntry[] {
  const {
    visibleData,
    firstVisibleIndex,
    markedUserId,
    markedRow,
    markedRowIndex
  } = opts;
  const out: RowRenderEntry[] = [];
  visibleData.forEach((row, i) => {
    if (row.userId === markedUserId) return;
    out.push({ row, targetIndex: firstVisibleIndex + i, isMarked: false });
  });
  if (markedRow && markedRowIndex >= 0) {
    out.push({ row: markedRow, targetIndex: markedRowIndex, isMarked: true });
  }
  return out;
}
