import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildInitialState,
  initSimState,
  keyBy,
  makeReducer,
  mapValues,
  parseInputData,
  rankUsers
} from '../../lib/resolver';
import type {
  AwardImageMap,
  InputData,
  PointByProblemId,
  SubmissionById
} from '../../lib/resolver';
import type { SimulationCtx } from '../../lib/resolver/simulation';
import { CARD_HEIGHT } from '../layout';
import {
  CURSOR_LOOKAHEAD_ROWS,
  OVERSCAN,
  cameraTargetY,
  framingIndex,
  rowRenderList,
  visibleRowRange
} from '../cameraGeometry';

const fakeRow = (userId: number) => ({ userId }) as never;

describe('rowRenderList', () => {
  const visibleData = [fakeRow(10), fakeRow(11), fakeRow(12)];

  it('keeps every row at its data index when nothing is marked', () => {
    const list = rowRenderList({
      visibleData,
      firstVisibleIndex: 5,
      markedUserId: -1,
      markedRow: undefined,
      markedRowIndex: -1
    });
    expect(list.map((e) => [e.row.userId, e.targetIndex, e.isMarked])).toEqual([
      [10, 5, false],
      [11, 6, false],
      [12, 7, false]
    ]);
  });

  it('excludes the marked row from the slice and appends it LAST at its true index', () => {
    const marked = fakeRow(11);
    const list = rowRenderList({
      visibleData,
      firstVisibleIndex: 5,
      markedUserId: 11,
      markedRow: marked,
      markedRowIndex: 2 // climbed far above the visible slice
    });
    expect(list.map((e) => [e.row.userId, e.targetIndex, e.isMarked])).toEqual([
      [10, 5, false],
      [12, 7, false],
      [11, 2, true] // last, at its true index, flagged marked
    ]);
  });
});

describe('framingIndex', () => {
  it('frames the cursor, never the marked row (the anti-yo-yo decision)', () => {
    expect(framingIndex(5, 0)).toBe(5);
    // marked row jumped far up — the camera must still frame the cursor.
    expect(framingIndex(5, 18)).toBe(5);
    expect(framingIndex(-1, 3)).toBe(-1);
  });
});

describe('cameraTargetY', () => {
  const bodyHeight = 800;

  it('returns 0 when nothing is framed', () => {
    expect(cameraTargetY(-1, 100 * CARD_HEIGHT, bodyHeight)).toBe(0);
  });

  it('is monotonic non-decreasing in the framed index', () => {
    const contentHeight = 80 * CARD_HEIGHT;
    let prev = -1;
    for (let i = 0; i < 80; i++) {
      const y = cameraTargetY(i, contentHeight, bodyHeight);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
  });

  it('clamps to [0, contentHeight - bodyHeight]', () => {
    const contentHeight = 50 * CARD_HEIGHT;
    expect(cameraTargetY(0, contentHeight, bodyHeight)).toBe(0);
    expect(cameraTargetY(49, contentHeight, bodyHeight)).toBe(
      contentHeight - bodyHeight
    );
  });

  it('keeps the framed row CURSOR_LOOKAHEAD_ROWS above the viewport bottom mid-board', () => {
    const contentHeight = 100 * CARD_HEIGHT;
    const y = cameraTargetY(50, contentHeight, bodyHeight);
    const framedBottomScreenY = (50 + 1) * CARD_HEIGHT - y;
    expect(framedBottomScreenY).toBe(
      bodyHeight - CURSOR_LOOKAHEAD_ROWS * CARD_HEIGHT
    );
  });
});

describe('visibleRowRange', () => {
  it('spans only the camera path — a far-off marked row is mounted by rowRenderList, not by widening the window', () => {
    const dataLength = 200;
    const cameraY = 190 * CARD_HEIGHT; // camera near the bottom
    const { first, last } = visibleRowRange({
      prevTargetY: cameraY,
      targetY: cameraY,
      cameraY,
      bodyHeight: 800,
      dataLength
    });
    // The window stays near the camera (unioning a far destination in would
    // mount ~180 dead off-screen rows)…
    expect(first).toBe(190 - OVERSCAN);
    expect(last).toBe(dataLength - 1);
    // …and a marked row flying to index 5 still renders, at its true index,
    // because rowRenderList mounts it explicitly (the anti-gap guarantee).
    const visibleData = Array.from({ length: last - first + 1 }, (_, i) =>
      fakeRow(first + i)
    );
    const list = rowRenderList({
      visibleData,
      firstVisibleIndex: first,
      markedUserId: 5,
      markedRow: fakeRow(5),
      markedRowIndex: 5
    });
    expect(list.at(-1)).toMatchObject({ targetIndex: 5, isMarked: true });
  });

  it('clamps to valid row indices', () => {
    const { first, last } = visibleRowRange({
      prevTargetY: 0,
      targetY: 0,
      cameraY: 0,
      bodyHeight: 800,
      dataLength: 10
    });
    expect(first).toBe(0);
    expect(last).toBeLessThanOrEqual(9);
  });

  it('is an empty range for no rows', () => {
    expect(
      visibleRowRange({
        prevTargetY: 0,
        targetY: 0,
        cameraY: 0,
        bodyHeight: 800,
        dataLength: 0
      })
    ).toEqual({ first: 0, last: -1 });
  });
});

// The flow invariant: the test that would have caught the camera yo-yo. Drive
// the real reveal and assert the camera target never reverses while the cursor
// is active. If framingIndex is ever changed to frame the marked row, a team
// jumping up then the next team appearing below produces a target that rises
// again — and this fails.
describe('camera flow invariants over the vnoicup24 reveal', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const inputData: InputData = parseInputData(
    JSON.parse(
      readFileSync(join(HERE, '../../../public/vnoicup24/data.json'), 'utf-8')
    )
  );
  const ctx: SimulationCtx = {
    submissionById: keyBy(
      inputData.submissions,
      (s) => s.submissionId
    ) as SubmissionById,
    pointByProblemId: mapValues(
      keyBy(inputData.problems, (p) => p.problemId),
      (p) => p.points
    ) as PointByProblemId,
    imageData: {} as AwardImageMap,
    unofficialContestants: []
  };

  it('camera scroll is monotonic up (no yo-yo) and always mounts the marked row', () => {
    const reduce = makeReducer(ctx);
    let sim = initSimState(
      buildInitialState({
        inputData,
        userIds: inputData.users.map((u) => u.userId),
        frozenTime: 240 * 60
      }),
      ctx
    );
    const bodyHeight = 800;
    const contentHeight = inputData.users.length * CARD_HEIGHT;

    let prevTarget = Number.POSITIVE_INFINITY; // non-increasing as the cursor climbs
    let prevTargetForRange = cameraTargetY(
      sim.states[0]!.currentRowIndex,
      contentHeight,
      bodyHeight
    );

    while (sim.cursor < sim.events.length) {
      const state = sim.states[sim.cursor]!;
      const ranking = rankUsers(state, ctx.unofficialContestants);
      const markedRowIndex =
        state.markedUserId === -1
          ? -1
          : ranking.findIndex((r) => r.userId === state.markedUserId);
      const target = cameraTargetY(
        framingIndex(state.currentRowIndex, markedRowIndex),
        contentHeight,
        bodyHeight
      );

      if (state.currentRowIndex >= 0) {
        expect(target).toBeLessThanOrEqual(prevTarget + 1e-6);
        prevTarget = target;
      }

      if (markedRowIndex >= 0) {
        // The marked row must be RENDERED at every step even when it lies
        // outside the mount window — rowRenderList appends it explicitly
        // (the anti-gap guarantee lives there, not in visibleRowRange).
        const { first, last } = visibleRowRange({
          prevTargetY: prevTargetForRange,
          targetY: target,
          cameraY: target,
          bodyHeight,
          dataLength: ranking.length
        });
        const list = rowRenderList({
          visibleData: ranking.slice(first, last + 1),
          firstVisibleIndex: first,
          markedUserId: state.markedUserId,
          markedRow: ranking[markedRowIndex],
          markedRowIndex
        });
        const marked = list.find((e) => e.isMarked);
        expect(marked).toBeDefined();
        expect(marked!.targetIndex).toBe(markedRowIndex);
      }
      prevTargetForRange = target;
      sim = reduce(sim, { type: 'step', choice: undefined });
    }
  });
});
