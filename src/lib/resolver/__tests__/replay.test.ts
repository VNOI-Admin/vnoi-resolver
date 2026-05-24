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
  initSimState,
  keyBy,
  makeReducer,
  mapValues,
  parseInputData
} from '..';
import type {
  AwardImageMap,
  InputData,
  PointByProblemId,
  SimAction,
  SimState,
  SimulationCtx,
  SubmissionById
} from '..';

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
