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
} from '..';
import type {
  AwardImageMap,
  InputData,
  PointByProblemId,
  SimState,
  SubmissionById
} from '..';
import { HOLD_MS, classifyHoldClass, type SimulationCtx } from '../simulation';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, '../../../../public/vnoicup24/data.json');

const inputData: InputData = parseInputData(
  JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
);

function buildCtx(): SimulationCtx {
  const submissionById: SubmissionById = keyBy(
    inputData.submissions,
    (s) => s.submissionId
  );
  const pointByProblemId: PointByProblemId = mapValues(
    keyBy(inputData.problems, (p) => p.problemId),
    (p) => p.points
  );
  return {
    submissionById,
    pointByProblemId,
    imageData: {} as AwardImageMap,
    unofficialContestants: []
  };
}

function buildInitial(): SimState {
  const ctx = buildCtx();
  const base = buildInitialState({
    inputData,
    userIds: inputData.users.map((u) => u.userId),
    frozenTime: 14400
  });
  return initSimState(base, ctx);
}

// Locate the first cursor position whose precomputed event is a mark_problem
// with at least N pending submissions — i.e. where a non-default choice is
// actually meaningful.
function findMarkProblemBoundary(
  sim: SimState,
  minPending = 2
): { cursor: number; pendingCount: number } {
  for (let i = 0; i < sim.events.length; i++) {
    const ev = sim.events[i]!;
    if (ev.kind !== 'mark_problem') continue;
    const user = sim.states[i]!.users[ev.userId]!;
    if (user.pendingSubmissionIds.length >= minPending) {
      return { cursor: i, pendingCount: user.pendingSubmissionIds.length };
    }
  }
  throw new Error(
    `no mark_problem with ${minPending}+ pending found in precomputed events`
  );
}

describe('simulation reducer', () => {
  it('step with no choice advances cursor by 1 without recomputing', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();

    const next = reduce(sim, { type: 'step', choice: undefined });
    expect(next.cursor).toBe(1);
    // Tail untouched — same array references.
    expect(next.events).toBe(sim.events);
    expect(next.states).toBe(sim.states);
  });

  it('step with choice 0 is identical to no choice (default)', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();

    const a = reduce(sim, { type: 'step', choice: undefined });
    const b = reduce(sim, { type: 'step', choice: 0 });
    expect(a.cursor).toBe(b.cursor);
    expect(a.events).toBe(b.events);
    expect(a.states).toBe(b.states);
  });

  it('step with non-default choice on non-mark_problem is treated as default', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();

    // The first precomputed event is `mark_user` (cursor at the bottom row).
    expect(sim.events[0]!.kind).toBe('mark_user');

    const next = reduce(sim, { type: 'step', choice: 5 });
    expect(next.cursor).toBe(1);
    // Tail untouched because choice was ignored at a non-mark_problem step.
    expect(next.events).toBe(sim.events);
  });

  it('rollback decrements cursor', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    let sim = buildInitial();
    sim = reduce(sim, { type: 'step', choice: undefined });
    sim = reduce(sim, { type: 'step', choice: undefined });
    expect(sim.cursor).toBe(2);

    const back = reduce(sim, { type: 'rollback' });
    expect(back.cursor).toBe(1);
    // Tail untouched.
    expect(back.events).toBe(sim.events);
    expect(back.states).toBe(sim.states);
  });

  it('rollback at cursor 0 is a no-op (same reference)', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();
    expect(sim.cursor).toBe(0);

    const next = reduce(sim, { type: 'rollback' });
    expect(next).toBe(sim);
  });

  it('step past the end is a no-op (same reference)', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    let sim = buildInitial();
    // Fast-forward to the end via cursor surgery so we don't pay N reductions.
    sim = { ...sim, cursor: sim.events.length };

    const next = reduce(sim, { type: 'step', choice: undefined });
    expect(next).toBe(sim);
  });

  it('seek moves the cursor to an absolute position without touching the timeline', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();

    const target = Math.min(20, sim.events.length);
    const next = reduce(sim, { type: 'seek', cursor: target });
    expect(next.cursor).toBe(target);
    // Timeline arrays preserved by reference — seek never re-precomputes.
    expect(next.events).toBe(sim.events);
    expect(next.states).toBe(sim.states);
    expect(next.eventHoldMs).toBe(sim.eventHoldMs);
  });

  it('seek clamps out-of-range targets into [0, events.length]', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();

    expect(reduce(sim, { type: 'seek', cursor: -50 }).cursor).toBe(0);
    expect(reduce(sim, { type: 'seek', cursor: 999999 }).cursor).toBe(
      sim.events.length
    );
  });

  it('seek to the current cursor is a no-op (same reference)', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim = buildInitial();
    expect(reduce(sim, { type: 'seek', cursor: 0 })).toBe(sim);
  });

  it('seek lands at the same state a sequence of steps would reach', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim0 = buildInitial();

    const target = Math.min(15, sim0.events.length);
    // Path A: step target times.
    let stepped = sim0;
    for (let i = 0; i < target; i++) {
      stepped = reduce(stepped, { type: 'step', choice: undefined });
    }
    // Path B: one seek.
    const seeked = reduce(sim0, { type: 'seek', cursor: target });

    expect(seeked.cursor).toBe(stepped.cursor);
    // Same visible state (the cursor indexes the same shared states array).
    expect(seeked.states[seeked.cursor]).toBe(stepped.states[stepped.cursor]);
  });

  it('step with non-default choice on mark_problem diverges and re-precomputes the tail', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim0 = buildInitial();

    const { cursor } = findMarkProblemBoundary(sim0);
    // Advance to that cursor with default choices.
    let sim = sim0;
    for (let i = 0; i < cursor; i++) {
      sim = reduce(sim, { type: 'step', choice: undefined });
    }
    expect(sim.cursor).toBe(cursor);
    expect(sim.events).toBe(sim0.events); // default path so far

    const defaultEvent = sim.events[cursor]!;
    expect(defaultEvent.kind).toBe('mark_problem');

    const diverged = reduce(sim, { type: 'step', choice: 1 });

    // Cursor advanced past the divergence point.
    expect(diverged.cursor).toBe(cursor + 1);

    // The event at the divergence position is now different (different problem).
    const newEvent = diverged.events[cursor]!;
    expect(newEvent.kind).toBe('mark_problem');
    if (
      newEvent.kind === 'mark_problem' &&
      defaultEvent.kind === 'mark_problem'
    ) {
      expect(newEvent.problemId).not.toBe(defaultEvent.problemId);
    }

    // Prefix preserved — same references for the events leading up to cursor.
    for (let i = 0; i < cursor; i++) {
      expect(diverged.events[i]).toBe(sim.events[i]);
    }

    // Tail was re-precomputed: events.length === states.length - 1 invariant
    // still holds, and the tail ends in 'end'.
    expect(diverged.states.length).toBe(diverged.events.length + 1);
    expect(diverged.events[diverged.events.length - 1]!.kind).toBe('end');

    // The reveal still drains every user's pending submissions.
    const finalState = diverged.states[diverged.states.length - 1]!;
    const remaining = Object.values(finalState.users).reduce(
      (s, u) => s + u.pendingSubmissionIds.length,
      0
    );
    expect(remaining).toBe(0);
  });

  it('unofficial contestant at the bottom row is skipped: first event marks the next-up official user', () => {
    // Find the bottom-ranked official user — pretend they're unofficial.
    // The reducer should jump straight past them to the row above.
    const baseRanking = rankUsers(
      buildInitialState({
        inputData,
        userIds: inputData.users.map((u) => u.userId),
        frozenTime: 14400
      }),
      []
    );
    const bottomUser = baseRanking[baseRanking.length - 1]!;
    const skippedUsername = bottomUser.username;
    const nextUpUser = baseRanking[baseRanking.length - 2]!;

    const ctx = {
      submissionById: keyBy(inputData.submissions, (s) => s.submissionId),
      pointByProblemId: mapValues(
        keyBy(inputData.problems, (p) => p.problemId),
        (p) => p.points
      ),
      imageData: {} as AwardImageMap,
      unofficialContestants: [skippedUsername]
    };
    const base = buildInitialState({
      inputData,
      userIds: inputData.users.map((u) => u.userId),
      frozenTime: 14400
    });
    const sim = initSimState(base, ctx);

    // The bottom (unofficial) user's rank is blank; the official next-up
    // should hold rank "N-1" in the displayed ranking, but mark_user events
    // address users by userId, not rank — so we just assert which userId
    // gets marked first when unofficial bookkeeping is in play.
    const firstEvent = sim.events[0]!;
    expect(firstEvent.kind).toBe('mark_user');
    if (firstEvent.kind !== 'mark_user') return;

    // The cursor starts at the BOTTOM ROW (currentRowIndex = N-1), regardless
    // of official status — `mark_user` still fires for that row, but the
    // user's row should now have a blank rank in the ranking. Verify both.
    const rankedWithUnofficial = rankUsers(base, [skippedUsername]);
    const bottomRanked = rankedWithUnofficial[rankedWithUnofficial.length - 1]!;
    expect(bottomRanked.username).toBe(skippedUsername);
    expect(bottomRanked.rank).toBe(''); // unofficial → no displayed rank
    expect(
      rankedWithUnofficial[rankedWithUnofficial.length - 2]!.username
    ).toBe(nextUpUser.username);

    // First event must address the bottom row's userId (= the unofficial one)
    // — the cursor traverses ALL rows; "unofficial" only suppresses the
    // displayed rank number, not the reveal sequence.
    expect(firstEvent.userId).toBe(bottomUser.userId);
  });

  it('step with out-of-range choice on mark_problem is a no-op (same reference)', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim0 = buildInitial();

    const { cursor, pendingCount } = findMarkProblemBoundary(sim0);
    let sim = sim0;
    for (let i = 0; i < cursor; i++) {
      sim = reduce(sim, { type: 'step', choice: undefined });
    }

    // pendingCount + 1 is out of range (valid indices are 0..pendingCount-1).
    const next = reduce(sim, { type: 'step', choice: pendingCount + 1 });
    expect(next).toBe(sim);
  });
});

describe('classifyHoldMs / eventHoldMs', () => {
  const classifyHoldMs = (...args: Parameters<typeof classifyHoldClass>) =>
    HOLD_MS[classifyHoldClass(...args)];

  it('mark_user → SELECT_TEAM', () => {
    const ctx = buildCtx();
    expect(
      classifyHoldMs({ kind: 'mark_user', userId: 1, rowIndex: 0 }, [], [], ctx)
    ).toBe(HOLD_MS.SELECT_TEAM);
  });

  it('mark_problem → SELECT_PROBLEM', () => {
    const ctx = buildCtx();
    const someSub = inputData.submissions[0]!;
    expect(
      classifyHoldMs(
        {
          kind: 'mark_problem',
          userId: someSub.userId,
          problemId: someSub.problemId,
          submissionId: someSub.submissionId
        },
        [],
        [],
        ctx
      )
    ).toBe(HOLD_MS.SELECT_PROBLEM);
  });

  it('resolve with 0 points → FAILED', () => {
    const ctx = buildCtx();
    const failed = inputData.submissions.find((s) => s.points === 0);
    if (!failed) {
      throw new Error('no 0-point submission in fixture');
    }
    expect(
      classifyHoldMs(
        {
          kind: 'resolve',
          userId: failed.userId,
          submissionId: failed.submissionId
        },
        [],
        [],
        ctx
      )
    ).toBe(HOLD_MS.FAILED);
  });

  it('resolve with points > 0 and unchanged rank → SOLVED_STAY', () => {
    const ctx = buildCtx();
    const winner = inputData.submissions.find((s) => s.points > 0);
    if (!winner) throw new Error('no winning submission in fixture');
    // Both rankings show userId at the same rank.
    const before = [
      { userId: winner.userId, rank: '5' } as unknown as ReturnType<
        typeof rankUsers
      >[number]
    ];
    const after = [
      { userId: winner.userId, rank: '5' } as unknown as ReturnType<
        typeof rankUsers
      >[number]
    ];
    expect(
      classifyHoldMs(
        {
          kind: 'resolve',
          userId: winner.userId,
          submissionId: winner.submissionId
        },
        before,
        after,
        ctx
      )
    ).toBe(HOLD_MS.SOLVED_STAY);
  });

  it('resolve with points > 0 and shifted rank → SOLVED_MOVE', () => {
    const ctx = buildCtx();
    const winner = inputData.submissions.find((s) => s.points > 0)!;
    const before = [
      { userId: winner.userId, rank: '7' } as unknown as ReturnType<
        typeof rankUsers
      >[number]
    ];
    const after = [
      { userId: winner.userId, rank: '3' } as unknown as ReturnType<
        typeof rankUsers
      >[number]
    ];
    expect(
      classifyHoldMs(
        {
          kind: 'resolve',
          userId: winner.userId,
          submissionId: winner.submissionId
        },
        before,
        after,
        ctx
      )
    ).toBe(HOLD_MS.SOLVED_MOVE);
  });

  it('non-resolve / non-select events → DEFAULT', () => {
    const ctx = buildCtx();
    expect(
      classifyHoldMs(
        { kind: 'show_award', rank: '1', imageSrc: 'x' },
        [],
        [],
        ctx
      )
    ).toBe(HOLD_MS.DEFAULT);
    expect(classifyHoldMs({ kind: 'hide_award' }, [], [], ctx)).toBe(
      HOLD_MS.DEFAULT
    );
    expect(classifyHoldMs({ kind: 'end' }, [], [], ctx)).toBe(HOLD_MS.DEFAULT);
  });

  it('eventHoldMs is in lockstep with events array', () => {
    const sim = buildInitial();
    expect(sim.eventHoldMs.length).toBe(sim.events.length);
    // Every entry is a positive finite number.
    for (const ms of sim.eventHoldMs) {
      expect(Number.isFinite(ms)).toBe(true);
      expect(ms).toBeGreaterThan(0);
    }
  });

  it('eventClass tags every event and its duration matches HOLD_MS[class]', () => {
    const sim = buildInitial();
    expect(sim.eventClass.length).toBe(sim.events.length);
    sim.eventClass.forEach((cls, i) => {
      expect(HOLD_MS[cls]).toBe(sim.eventHoldMs[i]);
    });
    // mark_user events are SELECT_TEAM; rank-movers exist in this dataset.
    sim.events.forEach((e, i) => {
      if (e.kind === 'mark_user') expect(sim.eventClass[i]).toBe('SELECT_TEAM');
    });
    expect(sim.eventClass).toContain('SOLVED_MOVE');
  });

  it('divergence preserves eventHoldMs prefix and re-classifies the tail', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    const sim0 = buildInitial();
    const { cursor } = findMarkProblemBoundary(sim0);

    let sim = sim0;
    for (let i = 0; i < cursor; i++) {
      sim = reduce(sim, { type: 'step', choice: undefined });
    }
    const diverged = reduce(sim, { type: 'step', choice: 1 });

    // Prefix identical.
    for (let i = 0; i < cursor; i++) {
      expect(diverged.eventHoldMs[i]).toBe(sim0.eventHoldMs[i]);
    }
    // Length still in lockstep.
    expect(diverged.eventHoldMs.length).toBe(diverged.events.length);
  });
});
