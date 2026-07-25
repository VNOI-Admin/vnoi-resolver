// Property-based random walk over the sim reducer. Example-based tests only
// probe paths someone thought of — the diverge → rollback → re-choose bug
// lived in exactly the gap between them. This walk throws thousands of
// step/choice/rollback/seek combinations (seeded PRNG, fully deterministic)
// at the reducer against the real vnoicup24 dataset and asserts the
// CONTRACTS after every single action:
//
//   1. Chooser contract: step(choice=k) at a mark_problem boundary marks
//      exactly pendingSubmissionIds[k] of the pre-step state — regardless of
//      any earlier divergence/rollback history. (The reported bug.)
//   2. Out-of-range choice is a strict no-op (same reference).
//   3. Structural invariants: states/events/holdMs/class lengths in
//      lockstep, cursor in bounds.
//   4. Replay determinism: re-applying the recorded action log to a fresh
//      sim reproduces the identical visible state — this is literally what
//      the audience window does with the operator's action log.
//   5. Drain: stepping to the end from wherever the walk stopped resolves
//      every pending submission.
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
import type { AwardImageMap, InputData, SimAction, SimState } from '..';
import type { SimulationCtx } from '../simulation';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, '../../../../public/vnoicup24/data.json');
const inputData: InputData = parseInputData(
  JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
);

function buildCtx(): SimulationCtx {
  return {
    submissionById: keyBy(inputData.submissions, (s) => s.submissionId),
    pointByProblemId: mapValues(
      keyBy(inputData.problems, (p) => p.problemId),
      (p) => p.points
    ),
    imageData: {} as AwardImageMap,
    unofficialContestants: []
  };
}

function buildInitial(ctx: SimulationCtx): SimState {
  const base = buildInitialState({
    inputData,
    userIds: inputData.users.map((u) => u.userId),
    frozenTime: 14400
  });
  return initSimState(base, ctx);
}

// Deterministic LCG so failures reproduce exactly from the seed in the test
// name — never Math.random in tests.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WALK_LENGTH = 500;

describe.each([1, 2, 3, 4])('sim reducer random walk (seed %i)', (seed) => {
  it('holds the chooser contract + invariants on every action, replays deterministically, and drains', () => {
    const ctx = buildCtx();
    const reduce = makeReducer(ctx);
    let sim = buildInitial(ctx);
    const rnd = lcg(seed);
    const log: SimAction[] = [];

    for (let i = 0; i < WALK_LENGTH; i++) {
      const r = rnd();
      let action: SimAction;
      if (r < 0.6) {
        // Step; at a chooser boundary usually pick a random choice, and
        // sometimes one past the end to exercise the no-op path.
        const ev = sim.events[sim.cursor];
        let choice: number | undefined;
        if (ev?.kind === 'mark_problem' && rnd() < 0.75) {
          const pend =
            sim.states[sim.cursor]!.users[ev.userId]!.pendingSubmissionIds;
          choice = Math.floor(rnd() * (pend.length + 1));
        }
        action = { type: 'step', choice };
      } else if (r < 0.85) {
        action = { type: 'rollback' };
      } else {
        action = {
          type: 'seek',
          cursor: Math.floor(rnd() * (sim.events.length + 1))
        };
      }

      const before = sim;
      sim = reduce(sim, action);
      log.push(action);

      // (3) structural invariants
      expect(sim.states.length).toBe(sim.events.length + 1);
      expect(sim.eventHoldMs.length).toBe(sim.events.length);
      expect(sim.eventClass.length).toBe(sim.events.length);
      expect(sim.cursor).toBeGreaterThanOrEqual(0);
      expect(sim.cursor).toBeLessThanOrEqual(sim.events.length);

      // (1)+(2) chooser contract
      if (action.type === 'step' && action.choice !== undefined) {
        const evBefore = before.events[before.cursor];
        if (evBefore?.kind === 'mark_problem') {
          const pend =
            before.states[before.cursor]!.users[evBefore.userId]!
              .pendingSubmissionIds;
          const expected = pend[action.choice];
          if (expected === undefined) {
            expect(sim).toBe(before);
          } else {
            const applied = sim.events[before.cursor]!;
            expect(applied.kind).toBe('mark_problem');
            if (applied.kind === 'mark_problem') {
              expect(applied.submissionId).toBe(expected);
            }
            expect(sim.cursor).toBe(before.cursor + 1);
          }
        }
      }
    }

    // (4) replay determinism — the audience-window path.
    let replay = buildInitial(ctx);
    for (const a of log) replay = reduce(replay, a);
    expect(replay.cursor).toBe(sim.cursor);
    expect(replay.events.length).toBe(sim.events.length);
    const a = sim.states[sim.cursor]!;
    const b = replay.states[replay.cursor]!;
    for (const uid of Object.keys(a.users).map(Number)) {
      expect(b.users[uid]!.points).toEqual(a.users[uid]!.points);
      expect(b.users[uid]!.pendingSubmissionIds).toEqual(
        a.users[uid]!.pendingSubmissionIds
      );
      expect(b.users[uid]!.penalty).toBe(a.users[uid]!.penalty);
    }

    // (5) drain to the end.
    while (sim.cursor < sim.events.length) {
      sim = reduce(sim, { type: 'step', choice: undefined });
    }
    const final = sim.states[sim.states.length - 1]!;
    const remaining = Object.values(final.users).reduce(
      (s, u) => s + u.pendingSubmissionIds.length,
      0
    );
    expect(remaining).toBe(0);
  });
});
