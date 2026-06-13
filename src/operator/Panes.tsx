import { useMemo, useState } from 'react';

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
  projectRankAfter,
  projectSnapshotAfter,
  onPickChoice
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
  projectSnapshotAfter: (
    cursor: number,
    userId: number,
    submissionId: number
  ) => Snapshot | null;
  // Commit a chooser pick by index (mouse equivalent of the 1–9 hotkeys).
  // Maps to manualStep, so it pauses autoplay and steps with that choice.
  onPickChoice: (choiceIndex: number) => void;
}) {
  const nextEvent = events[cursor];
  const isChooser =
    !!nextEvent &&
    nextEvent.kind === 'mark_problem' &&
    pendingChoices.length >= 2;

  // Which pending submission the operator is hovering in the chooser. When
  // set, the board preview shows the projected board AFTER revealing just
  // that submission — so the operator can compare "what does each choice do
  // to the standings" before committing. Validity is re-derived each render
  // against pendingChoices, so a cursor change that swaps the chooser drops
  // a stale hover without an effect.
  const [hoveredChoice, setHoveredChoice] = useState<number | null>(null);
  const chooserUserId =
    nextEvent && nextEvent.kind === 'mark_problem' ? nextEvent.userId : null;
  const validHover =
    isChooser &&
    hoveredChoice !== null &&
    pendingChoices.some((c) => c.submissionId === hoveredChoice)
      ? hoveredChoice
      : null;
  const projectedBoard =
    validHover !== null && chooserUserId !== null
      ? projectSnapshotAfter(cursor, chooserUserId, validHover)
      : null;
  const boardSnapshot = projectedBoard ?? snapshot;
  const boardLabel = projectedBoard
    ? (() => {
        const choice = pendingChoices.find(
          (c) => c.submissionId === validHover
        );
        const idx =
          choice !== undefined
            ? ctx.problemIndexById[choice.problemId]
            : undefined;
        const code = idx !== undefined ? getProblemCodeFromIndex(idx) : '?';
        return `Board if ${code} revealed`;
      })()
    : undefined;

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
            hoveredChoice={validHover}
            onHoverChoice={setHoveredChoice}
            onPick={isPreviewing ? undefined : onPickChoice}
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
        <BoardPreview
          snapshot={boardSnapshot}
          isPreviewing={isPreviewing}
          label={boardLabel}
          projected={projectedBoard !== null}
        />
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

const BOARD_WINDOW = 11;

/**
 * Compact standings window for the center pane. Reads the ranked board from
 * `snapshot.data` (live or peeked — the parent already swaps it on hover),
 * so scrubbing the queue/timeline scrolls this preview through the actual
 * board state at each cursor without committing. Windowed around the marked
 * team (or the cursor's current row before anyone is marked) so the rows
 * that are about to move stay on screen.
 */
function BoardPreview({
  snapshot,
  isPreviewing,
  label,
  projected = false
}: {
  snapshot: Snapshot;
  isPreviewing: boolean;
  // Explicit header label — set when previewing a hovered chooser choice
  // ("Board if C revealed"). Falls back to the live/preview wording.
  label?: string;
  // Whether the snapshot is a hypothetical projection (hovered choice) vs.
  // the real board at the cursor — drives a subtle accent on the header.
  projected?: boolean;
}) {
  const { data, markedUserId, currentRowIndex } = snapshot;
  if (data.length === 0) return null;

  const markedIdx =
    markedUserId >= 0 ? data.findIndex((r) => r.userId === markedUserId) : -1;
  // Focus the marked team if there is one; otherwise the cursor's row (the
  // bottom of the board before the first reveal). Clamp into a valid window.
  const focusIdx =
    markedIdx >= 0
      ? markedIdx
      : Math.max(0, Math.min(data.length - 1, currentRowIndex));
  const half = Math.floor(BOARD_WINDOW / 2);
  const start = Math.max(
    0,
    Math.min(focusIdx - half, Math.max(0, data.length - BOARD_WINDOW))
  );
  const window = data.slice(start, start + BOARD_WINDOW);
  const hiddenAbove = start;
  const hiddenBelow = Math.max(0, data.length - (start + window.length));

  return (
    <div
      className={
        'op-board-preview' + (projected ? ' op-board-preview-projected' : '')
      }
    >
      <div className="op-board-preview-head">
        <span className="op-board-preview-label">
          {label ?? (isPreviewing ? 'Board at preview' : 'Board now')}
        </span>
        {hiddenAbove > 0 ? (
          <span className="op-board-preview-more">↑ {hiddenAbove}</span>
        ) : null}
      </div>
      <ol className="op-board-list">
        {window.map((row) => (
          <li
            key={row.userId}
            className={
              'op-board-row' +
              (row.userId === markedUserId ? ' op-board-row-marked' : '')
            }
          >
            <span className="op-board-rank">{row.rank || '—'}</span>
            <span className="op-board-name">{row.fullName}</span>
            <span className="op-board-handle">{row.username}</span>
            <span className="op-board-total">{row.total}</span>
          </li>
        ))}
      </ol>
      {hiddenBelow > 0 ? (
        <div className="op-board-preview-more op-board-preview-more-below">
          ↓ {hiddenBelow}
        </div>
      ) : null}
    </div>
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
  isPreviewing,
  hoveredChoice,
  onHoverChoice,
  onPick
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
  // Hovered row drives the board-preview projection in the parent.
  hoveredChoice: number | null;
  onHoverChoice: (submissionId: number | null) => void;
  // Click-to-commit by choice index. Undefined while previewing — a click
  // then would commit against the live cursor, not the shown (previewed)
  // event, so rows are inert in that mode (matching the muted hotkeys).
  onPick?: (choiceIndex: number) => void;
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
        onMouseLeave={() => onHoverChoice(null)}
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
                (rankShifts ? ' op-chooser-item-shifts' : '') +
                (hoveredChoice === c.submissionId
                  ? ' op-chooser-item-hovered'
                  : '') +
                (onPick ? ' op-chooser-item-clickable' : '')
              }
              onMouseEnter={() => onHoverChoice(c.submissionId)}
              onClick={onPick ? () => onPick(i) : undefined}
              title={onPick ? 'Click to reveal this submission' : undefined}
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
  onLeaveCursor,
  onCommitCursor
}: {
  events: readonly ResolverEvent[];
  pivotCursor: number;
  ctx: LookupCtx;
  onHoverCursor: (cursor: number) => void;
  onLeaveCursor: () => void;
  // Click a row → jump the live cursor to that absolute position. Always
  // live-relative (pivotCursor is the live cursor), so no preview gating.
  onCommitCursor: (cursor: number) => void;
}) {
  const QUEUE_LEN = 20;
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
                  'op-queue-item op-queue-item-clickable' +
                  (i === 0 ? ' op-queue-item-imminent' : '') +
                  (item.description.dramatic ? ' op-queue-item-dramatic' : '')
                }
                onMouseEnter={() => onHoverCursor(item.previewCursor)}
                onClick={() => onCommitCursor(item.previewCursor)}
                title={`Jump here (+${i + 1})`}
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
