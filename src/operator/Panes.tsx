import { useMemo } from 'react';

import type { ResolverEvent } from '../lib/resolver';
import { getProblemCodeFromIndex } from '../lib/resolver';
import type { Snapshot } from '../resolver';
import {
  type LookupCtx,
  describeEvent,
  formatRankDelta,
  summariseNow
} from './format';

function useNowSummary(
  events: readonly ResolverEvent[],
  cursor: number,
  ctx: LookupCtx
) {
  return useMemo(
    () => summariseNow(events, cursor, ctx),
    [events, cursor, ctx]
  );
}

/** NOW pane: what the audience is currently looking at. */
export function NowPane({
  events,
  cursor,
  ctx,
  snapshot,
  isPreviewing
}: {
  events: readonly ResolverEvent[];
  cursor: number;
  ctx: LookupCtx;
  snapshot: Snapshot;
  isPreviewing: boolean;
}) {
  const summary = useNowSummary(events, cursor, ctx);
  const activeUser =
    summary.activeUserId !== null ? ctx.usersById[summary.activeUserId] : null;
  const activeRow =
    snapshot.markedUserId >= 0
      ? snapshot.data.find((r) => r.userId === snapshot.markedUserId)
      : null;

  return (
    <section className="op-pane op-pane-now">
      <header className="op-pane-head">
        <span className="op-pane-eyebrow">On screen now</span>
        {isPreviewing ? (
          <span className="op-pane-tag op-pane-tag-preview">preview</span>
        ) : null}
      </header>
      <div className="op-pane-body">
        {activeUser ? (
          <>
            <div className="op-now-user">
              <span className="op-now-user-name">{activeUser.fullName}</span>
              <span className="op-now-user-handle">
                ({activeUser.username})
              </span>
            </div>
            {activeRow ? (
              <div className="op-now-row">
                <span>rank {activeRow.rank}</span>
                <span className="op-sep">·</span>
                <span>{activeRow.total} pts</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="op-now-idle">
            {cursor === 0
              ? 'Waiting for first reveal'
              : cursor >= events.length
                ? 'Reveal complete'
                : 'Between reveals'}
          </div>
        )}
        {summary.lastResolve ? (
          <div className="op-now-last">
            <span className="op-now-eyebrow">Just revealed</span>
            <div className="op-now-last-line">{summary.lastResolve.long}</div>
            {summary.lastResolve.expectedPoints !== undefined ? (
              <div className="op-now-last-points">
                {summary.lastResolve.expectedPoints} /{' '}
                {summary.lastResolve.problemPoints ?? '?'} pts
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * NEXT pane: what the next → keypress will do. Two modes: singular (one
 * pending or non-mark_problem event) and chooser (mark_problem with 2+
 * pendings, listed by 1–9 hotkey).
 */
export function NextPane({
  events,
  cursor,
  ctx,
  snapshot,
  isPreviewing,
  pendingChoices,
  projectRankAfter
}: {
  events: readonly ResolverEvent[];
  cursor: number;
  ctx: LookupCtx;
  snapshot: Snapshot;
  isPreviewing: boolean;
  pendingChoices: ReadonlyArray<{
    submissionId: number;
    problemId: number;
    eventualPoints: number;
    problemPoints: number;
    currentRank: string;
    projectedRank: string;
  }>;
  projectRankAfter: (
    cursor: number,
    userId: number,
    submissionId: number
  ) => string | null;
}) {
  const nextEvent = events[cursor];
  const isChooser =
    !!nextEvent &&
    nextEvent.kind === 'mark_problem' &&
    pendingChoices.length >= 2;

  if (!nextEvent) {
    const top3 = snapshot.data.slice(0, 3);
    return (
      <section className="op-pane op-pane-next op-pane-next-end">
        <header className="op-pane-head">
          <span className="op-pane-eyebrow">Reveal complete</span>
        </header>
        <div className="op-pane-body">
          <div className="op-end-headline">Final ranking sealed</div>
          {top3.length > 0 ? (
            <ol className="op-end-podium">
              {top3.map((row) => (
                <li key={row.userId}>
                  <span className="op-end-rank">#{row.rank}</span>
                  <span className="op-end-name">{row.fullName}</span>
                  <span className="op-end-pts">{row.total}</span>
                </li>
              ))}
            </ol>
          ) : null}
          <p className="op-end-hint">
            Press <kbd>←</kbd> to rewind for a replay.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="op-pane op-pane-next">
      <header className="op-pane-head">
        <span className="op-pane-eyebrow">
          {isChooser ? 'Choose a submission' : 'Next reveal'}
        </span>
        {isPreviewing ? (
          <span className="op-pane-tag op-pane-tag-preview">preview</span>
        ) : null}
      </header>
      <div className="op-pane-body">
        {isChooser ? (
          <ChooserBody
            choices={pendingChoices}
            ctx={ctx}
            activeUserName={
              snapshot.markedUserId >= 0
                ? (ctx.usersById[snapshot.markedUserId]?.username ?? null)
                : null
            }
            isPreviewing={isPreviewing}
          />
        ) : (
          <SingularBody
            nextEvent={nextEvent}
            cursor={cursor}
            ctx={ctx}
            snapshot={snapshot}
            projectRankAfter={projectRankAfter}
          />
        )}
        <div className="op-next-key">
          {isChooser ? (
            isPreviewing ? (
              <span className="op-next-key-hint op-next-key-hint-muted">
                Preview only — leave queue to commit with <kbd>1</kbd>–
                <kbd>{Math.min(9, pendingChoices.length)}</kbd>
              </span>
            ) : (
              <span className="op-next-key-hint">
                <kbd>1</kbd>–<kbd>{Math.min(9, pendingChoices.length)}</kbd> to
                pick · <kbd>→</kbd> for default
              </span>
            )
          ) : (
            <span className="op-next-key-hint">
              <kbd>→</kbd> to commit
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function SingularBody({
  nextEvent,
  cursor,
  ctx,
  snapshot,
  projectRankAfter
}: {
  nextEvent: ResolverEvent;
  cursor: number;
  ctx: LookupCtx;
  snapshot: Snapshot;
  projectRankAfter: (
    cursor: number,
    userId: number,
    submissionId: number
  ) => string | null;
}) {
  const desc = describeEvent(nextEvent, ctx);
  const userId =
    nextEvent.kind === 'mark_user' ||
    nextEvent.kind === 'mark_problem' ||
    nextEvent.kind === 'resolve'
      ? nextEvent.userId
      : null;
  const userRow =
    userId !== null ? snapshot.data.find((r) => r.userId === userId) : null;

  // Only mark_problem and resolve shift rank — mark_user just moves the
  // camera, awards/end don't affect ranking.
  const projectionSubmissionId =
    nextEvent.kind === 'mark_problem' || nextEvent.kind === 'resolve'
      ? nextEvent.submissionId
      : null;
  const projectedRank =
    userId !== null && projectionSubmissionId !== null
      ? projectRankAfter(cursor, userId, projectionSubmissionId)
      : null;
  const rankShifts =
    !!userRow &&
    !!projectedRank &&
    projectedRank !== '' &&
    projectedRank !== userRow.rank;

  return (
    <>
      <div className="op-next-headline">
        {desc.long}
        {desc.dramatic ? (
          <span className="op-next-bolt" title="High-impact moment">
            ⚡
          </span>
        ) : null}
      </div>
      {desc.expectedPoints !== undefined ? (
        <div className="op-next-points">
          <span className="op-next-points-num">{desc.expectedPoints}</span>
          <span className="op-next-points-sep">/</span>
          <span className="op-next-points-num op-next-points-num-muted">
            {desc.problemPoints ?? '?'}
          </span>
          <span className="op-next-points-label">pts</span>
        </div>
      ) : null}
      {userRow ? (
        <div className="op-next-rankcontext">
          {projectedRank && projectedRank !== '' ? (
            <span
              className={
                'op-next-rank' + (rankShifts ? ' op-next-rank-shifts' : '')
              }
            >
              rank {formatRankDelta(userRow.rank, projectedRank)}
            </span>
          ) : (
            <span>current rank {userRow.rank}</span>
          )}
          <span className="op-sep">·</span>
          <span>{userRow.total} pts overall</span>
        </div>
      ) : null}
      {nextEvent.kind === 'show_award' ? (
        <div className="op-next-award">
          <img
            src={nextEvent.imageSrc}
            alt={`Award for rank ${nextEvent.rank}`}
            className="op-next-award-img"
          />
        </div>
      ) : null}
    </>
  );
}

function ChooserBody({
  choices,
  ctx,
  activeUserName,
  isPreviewing
}: {
  choices: ReadonlyArray<{
    submissionId: number;
    problemId: number;
    eventualPoints: number;
    problemPoints: number;
    currentRank: string;
    projectedRank: string;
  }>;
  ctx: LookupCtx;
  activeUserName: string | null;
  // Mute the kbd chips when previewing: the keys would commit against the
  // live cursor, not the previewed event.
  isPreviewing: boolean;
}) {
  return (
    <>
      <div className="op-chooser-head">
        {activeUserName ? <strong>{activeUserName}</strong> : null} has{' '}
        {choices.length} pending submissions:
      </div>
      <ol
        className={
          'op-chooser-list' + (isPreviewing ? ' op-chooser-list-preview' : '')
        }
      >
        {choices.slice(0, 9).map((c, i) => {
          const prob = ctx.problemsById[c.problemId];
          const idx = ctx.problemIndexById[c.problemId];
          const code = idx !== undefined ? getProblemCodeFromIndex(idx) : '?';
          const isDefault = i === 0;
          const resolvesToZero = c.eventualPoints === 0;
          const rankShifts =
            c.currentRank !== '' &&
            c.projectedRank !== '' &&
            c.currentRank !== c.projectedRank;
          return (
            <li
              key={c.submissionId}
              className={
                'op-chooser-item' +
                (isDefault ? ' op-chooser-item-default' : '') +
                (resolvesToZero ? ' op-chooser-item-zero' : '') +
                (rankShifts ? ' op-chooser-item-shifts' : '')
              }
            >
              <kbd
                className={
                  'op-chooser-key' +
                  (isPreviewing ? ' op-chooser-key-muted' : '')
                }
              >
                {i + 1}
              </kbd>
              <span className="op-chooser-code">{code}</span>
              <span className="op-chooser-name">{prob?.name ?? '?'}</span>
              <span className="op-chooser-pts">
                {c.eventualPoints} / {c.problemPoints} pts
              </span>
              <span
                className={
                  'op-chooser-rank' +
                  (rankShifts ? ' op-chooser-rank-shifts' : '')
                }
                title={
                  rankShifts
                    ? `Rank changes from ${c.currentRank} to ${c.projectedRank}`
                    : 'Rank does not change'
                }
              >
                {formatRankDelta(c.currentRank, c.projectedRank)}
              </span>
              {isDefault ? (
                <span className="op-chooser-tag">default</span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/**
 * QUEUE pane: next 10 events as a vertical list. Hovering a row previews
 * the state AFTER that event in NOW/NEXT (preview cursor = pivot + i + 1).
 * `pivotCursor` stays on the LIVE cursor during hover so the list itself
 * doesn't shift while peeking.
 */
export function QueuePane({
  events,
  pivotCursor,
  ctx,
  onHoverCursor,
  onLeaveCursor
}: {
  events: readonly ResolverEvent[];
  pivotCursor: number;
  ctx: LookupCtx;
  onHoverCursor: (cursor: number) => void;
  onLeaveCursor: () => void;
}) {
  const QUEUE_LEN = 10;
  const items = useMemo(() => {
    const slice = events.slice(pivotCursor, pivotCursor + QUEUE_LEN);
    return slice.map((e, i) => ({
      previewCursor: pivotCursor + i + 1,
      event: e,
      description: describeEvent(e, ctx)
    }));
  }, [events, pivotCursor, ctx]);

  return (
    <section className="op-pane op-pane-queue" onMouseLeave={onLeaveCursor}>
      <header className="op-pane-head">
        <span className="op-pane-eyebrow">Up next</span>
      </header>
      <div className="op-pane-body op-queue-body">
        {items.length === 0 ? (
          <div className="op-queue-empty">Reveal complete</div>
        ) : (
          <ol className="op-queue-list">
            {items.map((item, i) => (
              <li
                key={pivotCursor + i}
                className={
                  'op-queue-item' +
                  (i === 0 ? ' op-queue-item-imminent' : '') +
                  (item.description.dramatic ? ' op-queue-item-dramatic' : '')
                }
                onMouseEnter={() => onHoverCursor(item.previewCursor)}
              >
                <span className="op-queue-num">+{i + 1}</span>
                <span className="op-queue-desc">{item.description.long}</span>
                {item.description.expectedPoints !== undefined ? (
                  <span className="op-queue-pts">
                    {item.description.expectedPoints}
                  </span>
                ) : null}
                {item.event.kind === 'show_award' ? (
                  <span className="op-queue-badge">🏆</span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
