/**
 * Replay determinism contract — the property the operator/audience sync
 * model is built on.
 *
 * The operator broadcasts a sequence of SimAction (step/rollback) over a
 * BroadcastChannel. The audience replays them against its own fresh
 * SimState. For the two surfaces to stay in sync, the reducer MUST be
 * deterministic: same initial state + same ctx + same action sequence =
 * same final state. These tests pin that down so a future reducer change
 * (e.g. randomised tie-break, mutable internal cache) can't silently
 * regress the sync layer.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  buildInitialState,
  computeNextEvent,
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
  SimAction,
  SimState,
  SubmissionById
} from '..';
import type { SimulationCtx } from '../simulation';

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

function freshSim(ctx: SimulationCtx): SimState {
  const base = buildInitialState({
    inputData,
    userIds: inputData.users.map((u) => u.userId),
    frozenTime: 240 * 60
  });
  return initSimState(base, ctx);
}

// Reduce a list of actions over a fresh sim. Mimics what the audience does
// when it consumes an action log via the actionLog state + appliedCount
// replay engine in Audience.tsx.
function applyAll(sim: SimState, actions: SimAction[], ctx: SimulationCtx) {
  const reducer = makeReducer(ctx);
  let s = sim;
  for (const a of actions) s = reducer(s, a);
  return s;
}

describe('action log replay determinism (operator/audience sync contract)', () => {
  const ctx = buildCtx();

  it('two fresh sims fed the same action log land at the same cursor', () => {
    const actions: SimAction[] = [
      { type: 'step', choice: undefined },
      { type: 'step', choice: undefined },
      { type: 'step', choice: undefined },
      { type: 'step', choice: undefined },
      { type: 'rollback' },
      { type: 'rollback' },
      { type: 'step', choice: undefined },
      { type: 'step', choice: undefined }
    ];

    const a = applyAll(freshSim(ctx), actions, ctx);
    const b = applyAll(freshSim(ctx), actions, ctx);

    expect(a.cursor).toBe(b.cursor);
    expect(a.events.length).toBe(b.events.length);
  });

  it('rollback then re-step lands at the same cursor as just stepping once', () => {
    // The reducer must be path-independent at the cursor level: rollbacks
    // are pure cursor decrements, not state mutations. So step+rollback+step
    // = step.
    const onlyForward = applyAll(
      freshSim(ctx),
      [{ type: 'step', choice: undefined }],
      ctx
    );
    const withBackAndForth = applyAll(
      freshSim(ctx),
      [
        { type: 'step', choice: undefined },
        { type: 'rollback' },
        { type: 'step', choice: undefined }
      ],
      ctx
    );
    expect(withBackAndForth.cursor).toBe(onlyForward.cursor);
    // Both sims land on the same visible state (the InternalState at the
    // current cursor) — value-equal, not identity-equal (the two sims are
    // independent instances).
    expect(withBackAndForth.states[withBackAndForth.cursor]).toEqual(
      onlyForward.states[onlyForward.cursor]
    );
  });

  it('divergent step (non-default choice) replays deterministically', () => {
    // Step until the first mark_problem with multiple pending submissions
    // for the active user, then pick choice=1 (non-default) to force a
    // divergence. Replay the same sequence on a fresh sim.
    const reducer = makeReducer(ctx);
    let s = freshSim(ctx);
    const actions: SimAction[] = [];
    for (let i = 0; i < 50 && s.cursor < s.events.length; i++) {
      const next = s.events[s.cursor];
      if (
        next?.kind === 'mark_problem' &&
        s.states[s.cursor]!.users[next.userId]!.pendingSubmissionIds.length >= 2
      ) {
        actions.push({ type: 'step', choice: 1 });
        s = reducer(s, actions[actions.length - 1]!);
        break;
      }
      actions.push({ type: 'step', choice: undefined });
      s = reducer(s, actions[actions.length - 1]!);
    }
    // Bail if the test data doesn't have a multi-choice mark_problem in
    // the first 50 events — would need different fixture data.
    const last = actions[actions.length - 1];
    expect(last?.type).toBe('step');
    expect(last?.type === 'step' ? last.choice : undefined).toBe(1);

    const replayed = applyAll(freshSim(ctx), actions, ctx);
    expect(replayed.cursor).toBe(s.cursor);
    expect(replayed.events.length).toBe(s.events.length);
    // The divergence produces the same final state regardless of which
    // sim object the actions land on.
    expect(replayed.states[replayed.cursor]).toEqual(s.states[s.cursor]);
  });

  it('reducer no-ops past the end of events do not corrupt cursor', () => {
    // The operator broadcast wrapper gates this case but the audience-side
    // reducer should also handle it safely — confirms the safety net.
    let s = freshSim(ctx);
    const reducer = makeReducer(ctx);
    // Force cursor to end.
    while (s.cursor < s.events.length) {
      s = reducer(s, { type: 'step', choice: undefined });
    }
    const endCursor = s.cursor;
    // Push 10 more steps — all should be no-ops.
    for (let i = 0; i < 10; i++) {
      s = reducer(s, { type: 'step', choice: undefined });
    }
    expect(s.cursor).toBe(endCursor);
  });

  it('reducer no-ops past cursor 0 do not corrupt cursor', () => {
    const reducer = makeReducer(ctx);
    let s = freshSim(ctx);
    expect(s.cursor).toBe(0);
    for (let i = 0; i < 10; i++) {
      s = reducer(s, { type: 'rollback' });
    }
    expect(s.cursor).toBe(0);
  });
});

describe('chooser / sync contract: pending order is the choice index', () => {
  const ctx = buildCtx();

  it('step(choice=i) resolves exactly the i-th pending submission', () => {
    // What the operator's NEXT-pane chooser shows at row i must be what
    // step(i) actually reveals; the audience replays that same choice index.
    // computeNextEvent's choice indexing is the load-bearing link.
    const reducer = makeReducer(ctx);
    let s = freshSim(ctx);
    let boundary: {
      state: SimState['states'][number];
      pending: number[];
    } | null = null;
    while (s.cursor < s.events.length) {
      const evt = s.events[s.cursor];
      if (evt?.kind === 'mark_problem') {
        const user = s.states[s.cursor]!.users[evt.userId]!;
        if (user.pendingSubmissionIds.length >= 2) {
          boundary = {
            state: s.states[s.cursor]!,
            pending: user.pendingSubmissionIds
          };
          break;
        }
      }
      s = reducer(s, { type: 'step', choice: undefined });
    }
    expect(boundary).not.toBeNull();
    const { state, pending } = boundary!;
    const ranking = rankUsers(state, ctx.unofficialContestants);
    pending.forEach((submissionId, i) => {
      const evt = computeNextEvent(state, ranking, ctx, i);
      expect(evt?.kind).toBe('mark_problem');
      expect(evt?.kind === 'mark_problem' ? evt.submissionId : -1).toBe(
        submissionId
      );
    });
  });
});

describe('ranking oracle: vnoicup24 default reveal converges correctly', () => {
  const ctx = buildCtx();

  function finalStandings() {
    const reducer = makeReducer(ctx);
    let s = freshSim(ctx);
    while (s.cursor < s.events.length) {
      s = reducer(s, { type: 'step', choice: undefined });
    }
    return rankUsers(s.states[s.cursor]!, ctx.unofficialContestants);
  }

  it('final standings are fully ordered with dense, tie-sharing ranks', () => {
    // Oracle on PROPERTIES, not a second run of the same code: a broken
    // comparator or tie-break breaks one of these even though every
    // determinism-by-construction test would still pass.
    const final = finalStandings();
    for (let i = 1; i < final.length; i++) {
      const a = final[i - 1]!;
      const b = final[i]!;
      const ordered =
        a.total > b.total || (a.total === b.total && a.penalty <= b.penalty);
      expect(ordered).toBe(true);
      // Equal (total, penalty) ⇒ equal rank; otherwise rank strictly grows.
      if (a.total === b.total && a.penalty === b.penalty) {
        expect(b.rank).toBe(a.rank);
      } else {
        expect(Number(b.rank)).toBe(i + 1);
      }
    }
  });

  it('golden master: the podium is pinned so a scoring regression fails loudly', () => {
    const podium = finalStandings()
      .slice(0, 3)
      .map((r) => ({ rank: r.rank, username: r.username, total: r.total }));
    expect(podium).toEqual([
      { rank: '1', username: 'fextivity', total: 14750 },
      { rank: '2', username: 'cuom1999', total: 10250 },
      { rank: '3', username: 'flashmt', total: 10000 }
    ]);
  });
});
