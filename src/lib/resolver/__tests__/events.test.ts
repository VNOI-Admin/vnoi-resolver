import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import _ from 'lodash';
import { describe, expect, it } from 'vitest';

import {
  applyEvent,
  buildInitialState,
  computeNextEvent,
  parseInputData,
  rankUsers,
  replay
} from '..';
import type {
  ImageData,
  InputData,
  NextEventCtx,
  PointByProblemId,
  ResolverEvent,
  SubmissionById
} from '..';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(HERE, '../../../../public/vnoicup24/data.json');

const inputData: InputData = parseInputData(
  JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
);

function buildCtx(imageData: ImageData = {}): NextEventCtx {
  const submissionById: SubmissionById = _.keyBy(
    inputData.submissions,
    'submissionId'
  );
  const pointByProblemId: PointByProblemId = _.mapValues(
    _.keyBy(inputData.problems, 'problemId'),
    (p) => p.points
  );
  return { submissionById, pointByProblemId, imageData };
}

function buildBase(frozenTime = 14400) {
  return buildInitialState({
    inputData,
    userIds: inputData.users.map((u) => u.userId),
    frozenTime
  });
}

function driveToCompletion(
  ctx: NextEventCtx,
  unofficial: string[] = []
): ResolverEvent[] {
  let state = buildBase();
  const events: ResolverEvent[] = [];
  for (let i = 0; i < 50_000; i++) {
    const ranking = rankUsers(state, unofficial);
    const next = computeNextEvent(state, ranking, ctx);
    if (!next) break;
    events.push(next);
    state = applyEvent(state, next, ctx);
    if (next.kind === 'end') break;
  }
  return events;
}

describe('applyEvent', () => {
  const ctx = buildCtx();

  it('mark_user sets markedUserId/rowIndex and clears problem/award state', () => {
    const base = buildBase();
    const next = applyEvent(
      base,
      { kind: 'mark_user', userId: 1, rowIndex: 5 },
      ctx
    );
    expect(next.markedUserId).toBe(1);
    expect(next.currentRowIndex).toBe(5);
    expect(next.markedProblemId).toBe(-1);
    expect(next.shownImage).toBe(false);
    expect(next.imageSrc).toBeNull();
  });

  it('mark_problem on a real pending pair sets markedProblemId', () => {
    const base = buildBase();
    const userId = Object.keys(base.users)
      .map(Number)
      .find((id) => base.users[id].pendingSubmissionIds.length > 0)!;
    const submissionId = base.users[userId].pendingSubmissionIds[0];
    const problemId = ctx.submissionById[submissionId].problemId;
    const next = applyEvent(
      base,
      { kind: 'mark_problem', userId, problemId, submissionId },
      ctx
    );
    expect(next.markedProblemId).toBe(problemId);
    expect(next.users).toBe(base.users); // immutable — no user scoring change
  });

  it('mark_problem with no matching pending sub clears markedProblemId', () => {
    const base = buildBase();
    const userId = Object.keys(base.users)
      .map(Number)
      .find((id) => base.users[id].pendingSubmissionIds.length > 0)!;
    const next = applyEvent(
      base,
      // Bogus problemId not in this user's pending set.
      { kind: 'mark_problem', userId, problemId: -1, submissionId: 0 },
      ctx
    );
    expect(next.markedProblemId).toBe(-1);
  });

  it('resolve removes the submission from pending and clears markedProblemId', () => {
    const base = buildBase();
    const userId = Object.keys(base.users)
      .map(Number)
      .find((id) => base.users[id].pendingSubmissionIds.length > 0)!;
    const submissionId = base.users[userId].pendingSubmissionIds[0];

    const after = applyEvent(
      base,
      { kind: 'resolve', userId, submissionId },
      ctx
    );

    expect(after.users[userId].pendingSubmissionIds).not.toContain(
      submissionId
    );
    expect(after.markedProblemId).toBe(-1);
  });

  it('show_award / hide_award toggle image state', () => {
    const base = buildBase();
    const shown = applyEvent(
      base,
      { kind: 'show_award', rank: '1', imageSrc: 'data:img' },
      ctx
    );
    expect(shown.shownImage).toBe(true);
    expect(shown.imageSrc).toBe('data:img');

    const hidden = applyEvent(shown, { kind: 'hide_award' }, ctx);
    expect(hidden.imageSrc).toBeNull();
    expect(hidden.shownImage).toBe(true); // shownImage stays true until next mark_user
  });

  it('end clears the reveal cursor', () => {
    const base = buildBase();
    const after = applyEvent(base, { kind: 'end' }, ctx);
    expect(after.currentRowIndex).toBe(-1);
    expect(after.markedUserId).toBe(-1);
    expect(after.markedProblemId).toBe(-1);
  });

  it('does not mutate the input state (immutable updates)', () => {
    const base = buildBase();
    const usersBefore = base.users;
    applyEvent(base, { kind: 'mark_user', userId: 1, rowIndex: 0 }, ctx);
    expect(base.users).toBe(usersBefore);
    expect(base.markedUserId).toBe(-1);
  });
});

describe('replay', () => {
  it('reproduces the same state from base + event log', () => {
    const ctx = buildCtx();
    const events = driveToCompletion(ctx).slice(0, 25);

    const base = buildBase();
    const a = replay(base, events, ctx);
    const b = replay(base, events, ctx);
    expect(a).toEqual(b);
  });

  it('replaying a prefix matches stepping forward then dropping the tail', () => {
    const ctx = buildCtx();
    const events = driveToCompletion(ctx);
    const cut = Math.floor(events.length / 2);

    const base = buildBase();
    const fromReplay = replay(base, events.slice(0, cut), ctx);

    let stepped = base;
    for (let i = 0; i < cut; i++) {
      stepped = applyEvent(stepped, events[i], ctx);
    }
    expect(fromReplay).toEqual(stepped);
  });
});

describe('computeNextEvent', () => {
  const ctx = buildCtx();

  it('first event is mark_user for the bottom-ranked user', () => {
    const base = buildBase();
    const ranking = rankUsers(base, []);
    const ev = computeNextEvent(base, ranking, ctx);
    expect(ev).toEqual({
      kind: 'mark_user',
      userId: ranking[ranking.length - 1].userId,
      rowIndex: ranking.length - 1
    });
  });

  it('after mark_user, picks mark_problem by smallest problemId by default', () => {
    let state = buildBase();
    let ranking = rankUsers(state, []);

    // Walk until we land on a user with pending submissions.
    while (true) {
      const ev = computeNextEvent(state, ranking, ctx);
      if (!ev) throw new Error('no event');
      if (ev.kind === 'mark_problem') {
        const user = state.users[state.markedUserId];
        const expectedSubId = _.minBy(
          user.pendingSubmissionIds,
          (id) => ctx.submissionById[id].problemId
        );
        expect(ev.submissionId).toBe(expectedSubId);
        return;
      }
      state = applyEvent(state, ev, ctx);
      if (ev.kind === 'resolve') ranking = rankUsers(state, []);
    }
  });

  it('respects an explicit choice index', () => {
    let state = buildBase();
    let ranking = rankUsers(state, []);

    // Step until we have a marked user with 2+ pending.
    while (true) {
      const ev = computeNextEvent(state, ranking, ctx);
      if (!ev) throw new Error('no event');
      if (
        ev.kind === 'mark_problem' &&
        state.users[state.markedUserId].pendingSubmissionIds.length >= 2
      ) {
        const user = state.users[state.markedUserId];
        const explicit = computeNextEvent(state, ranking, ctx, 1);
        expect(explicit).toEqual({
          kind: 'mark_problem',
          userId: state.markedUserId,
          problemId: ctx.submissionById[user.pendingSubmissionIds[1]].problemId,
          submissionId: user.pendingSubmissionIds[1]
        });
        return;
      }
      state = applyEvent(state, ev, ctx);
      if (ev.kind === 'resolve') ranking = rankUsers(state, []);
    }
  });

  it('returns null after end', () => {
    const base = buildBase();
    const ended = applyEvent(base, { kind: 'end' }, ctx);
    expect(computeNextEvent(ended, rankUsers(ended, []), ctx)).toBeNull();
  });

  it('returns null for out-of-range choice indices', () => {
    let state = buildBase();
    let ranking = rankUsers(state, []);
    while (true) {
      const ev = computeNextEvent(state, ranking, ctx);
      if (!ev) throw new Error('no event');
      if (
        ev.kind === 'mark_problem' &&
        state.users[state.markedUserId].pendingSubmissionIds.length >= 2
      ) {
        // The user has at least 2 pending → indices 0..1 are valid.
        const pending = state.users[state.markedUserId].pendingSubmissionIds;
        expect(computeNextEvent(state, ranking, ctx, -1)).toBeNull();
        expect(
          computeNextEvent(state, ranking, ctx, pending.length)
        ).toBeNull();
        expect(
          computeNextEvent(state, ranking, ctx, pending.length + 5)
        ).toBeNull();
        return;
      }
      state = applyEvent(state, ev, ctx);
      if (ev.kind === 'resolve') ranking = rankUsers(state, []);
    }
  });

  it('emits show_award then hide_award then mark_user when an award fires', () => {
    // Find a rank that exists on the private board.
    const fullState = buildInitialState({
      inputData,
      userIds: inputData.users.map((u) => u.userId),
      frozenTime: Number.POSITIVE_INFINITY
    });
    const priv = rankUsers(fullState, []);
    const awardRank = priv[priv.length - 1].rank; // bottom user's rank
    const ctxWithAward = buildCtx({ [awardRank]: 'data:fake' });

    const events = driveToCompletion(ctxWithAward);
    // Find the first show_award and confirm the immediate sequence.
    const showIdx = events.findIndex((e) => e.kind === 'show_award');
    expect(showIdx).toBeGreaterThanOrEqual(0);
    expect(events[showIdx + 1]?.kind).toBe('hide_award');
    // mark_user must follow once the award is dismissed (unless this was the top).
    if (showIdx + 2 < events.length) {
      const afterHide = events[showIdx + 2];
      expect(['mark_user', 'end']).toContain(afterHide.kind);
    }
  });

  it('emits end when the top user has no pending and no award', () => {
    const ctxNoAwards = buildCtx({});
    const events = driveToCompletion(ctxNoAwards);
    expect(events[events.length - 1].kind).toBe('end');
  });
});

describe('full reveal via event log', () => {
  it('completes in finite steps and ends in a private-equivalent state', () => {
    const ctx = buildCtx();
    const events = driveToCompletion(ctx);
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1].kind).toBe('end');

    const finalState = replay(buildBase(), events, ctx);

    // Pending should be drained for every user.
    const remaining = Object.values(finalState.users).reduce(
      (s, u) => s + u.pendingSubmissionIds.length,
      0
    );
    expect(remaining).toBe(0);
  });

  it('emits show_award/hide_award when the rank has an image', () => {
    const imageData: ImageData = { '1': 'data:fake-image' };
    const ctx = buildCtx(imageData);
    const events = driveToCompletion(ctx);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('show_award');
    expect(kinds).toContain('hide_award');
  });
});
