import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './operator.css';
import { useKeyPress } from '../hooks';
import {
  type InputData,
  type AwardImageMap,
  type Snapshot,
  applyHideUnofficials,
  useResolver
} from '../resolver';
import type {
  InputProblem,
  InputSubmission,
  ResolverEvent,
  SimAction,
  UserRow
} from '../lib/resolver';
import { FpsHud } from '../FpsHud';
import type { ThemeKey } from '../canvas/theme';
import { LiveScoreboard } from '../canvas/LiveScoreboard';
import { toggleFullscreen } from '../util/fullscreen';
import { fireAwardConfetti } from '../util/confetti';
import type { AwardFit, SafeInsets } from '../util/safeArea';
import { StatusStrip } from './StatusStrip';
import { NowPane, NextPane, QueuePane } from './Panes';
import { Timeline, Transport, type SeekControls } from './BottomBand';
import { buildLookupCtx, type LookupCtx } from './format';
import { nextWake, type WakeState } from './scheduler';
import {
  nextAwardCursor,
  prevAwardCursor,
  nextMoveCursor,
  prevMoveCursor
} from './seek';

/**
 * Two-mode operator window:
 *   - Scoreboard mode (audienceConnected = false): the operator is their
 *     own audience — render the live Pixi scoreboard so they can see the
 *     show.
 *   - Console mode (audienceConnected = true): audience window paints the
 *     show, this one becomes a control surface (status strip · three
 *     panes · timeline + transport).
 *
 * Mode switch is automatic via the heartbeat handshake in App.tsx; the
 * component never unmounts so useResolver state and autoplay timing
 * survive the swap.
 */
export function OperatorConsole({
  inputData,
  imageData,
  frozenTime,
  unofficialContestants,
  hideUnofficialContestants,
  themeKey,
  onCycleTheme,
  speed,
  setSpeed,
  safeInsets,
  awardFit,
  audienceConnected,
  onAction
}: {
  inputData: InputData;
  imageData: AwardImageMap;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
  themeKey: ThemeKey;
  onCycleTheme: () => void;
  speed: number;
  setSpeed: (n: number) => void;
  safeInsets: SafeInsets;
  awardFit: AwardFit;
  audienceConnected: boolean;
  onAction?: (action: SimAction) => void;
}) {
  const _inputData = useMemo(
    () =>
      applyHideUnofficials(
        inputData,
        unofficialContestants,
        hideUnofficialContestants
      ),
    [inputData, unofficialContestants, hideUnofficialContestants]
  );

  const {
    data,
    currentRowIndex,
    markedUserId,
    markedProblemId,
    imageSrc,
    cursor,
    totalEvents,
    events,
    eventHoldMs,
    eventClass,
    peekAt,
    pendingSubmissionsAt,
    projectRankAfter,
    projectSnapshotAfter,
    step: rawStep,
    rollback: rawRollback,
    seek: rawSeek
  } = useResolver({
    inputData: _inputData,
    imageData,
    unofficialContestants,
    frozenTime: frozenTime * 60
  });

  const [hoverCursor, setHoverCursor] = useState<number | null>(null);

  // Pending count at the LIVE cursor — what 1–9 would actually pick. The
  // NEXT-pane chooser displays choices for the previewed cursor; firing
  // hotkeys against that would commit a different live event entirely.
  const livePendingCount = useMemo(() => {
    const nextEvt = events[cursor];
    if (!nextEvt || nextEvt.kind !== 'mark_problem') return 0;
    return pendingSubmissionsAt(cursor, nextEvt.userId).length;
  }, [events, cursor, pendingSubmissionsAt]);

  // Gate broadcasts on cursor bounds. The reducer no-ops past end/before
  // start; broadcasting those would bloat the late-joiner replay log.
  const step = useCallback(
    (choice?: number) => {
      if (cursor >= totalEvents) return;
      rawStep(choice);
      onAction?.({ type: 'step', choice });
    },
    [cursor, totalEvents, rawStep, onAction]
  );
  const rollback = useCallback(() => {
    if (cursor <= 0) return;
    rawRollback();
    onAction?.({ type: 'rollback' });
  }, [cursor, rawRollback, onAction]);

  // Absolute cursor move broadcast as ONE seek action — the audience replays
  // the same single action and lands at the identical cursor. (The earlier
  // approach flooded N step/rollback messages per jump, which desynced the
  // audience under burst delivery and bloated the action log.)
  const seekTo = useCallback(
    (target: number) => {
      const clamped = Math.max(0, Math.min(totalEvents, target));
      if (clamped === cursor) return;
      rawSeek(clamped);
      onAction?.({ type: 'seek', cursor: clamped });
    },
    [cursor, totalEvents, rawSeek, onAction]
  );

  const [playing, setPlaying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Drop any stale hover preview on mode swap, otherwise NOW/NEXT would
  // re-enter preview mode with the operator's mouse nowhere near the queue.
  useEffect(() => {
    setHoverCursor(null);
  }, [audienceConnected]);

  // Auto-clear a stale hoverCursor only when the LIVE cursor ADVANCES into
  // it (autoplay/step overtaking a forward hover). Gated on an actual cursor
  // change so a deliberate BACKWARD hover — scrubbing the timeline to an
  // already-revealed point — isn't instantly wiped (that's a valid preview,
  // not a stale one). Without the gate, any hoverCursor <= cursor cleared on
  // the hover itself, breaking backward timeline scrub.
  const prevCursorRef = useRef(cursor);
  useEffect(() => {
    const advanced = cursor !== prevCursorRef.current;
    prevCursorRef.current = cursor;
    if (advanced && hoverCursor !== null && hoverCursor <= cursor) {
      setHoverCursor(null);
    }
  }, [cursor, hoverCursor]);

  const pause = useCallback(() => setPlaying(false), []);
  const manualStep = useCallback(
    (choice?: number) => {
      pause();
      step(choice);
    },
    [pause, step]
  );
  const manualRollback = useCallback(() => {
    pause();
    rollback();
  }, [pause, rollback]);

  const clearPreview = useCallback(() => setHoverCursor(null), []);

  // Jump pauses autoplay, then seeks to the target in one atomic action.
  const jumpTo = useCallback(
    (target: number) => {
      pause();
      seekTo(target);
    },
    [pause, seekTo]
  );

  const jumpNextAward = useCallback(() => {
    const t = nextAwardCursor(events, cursor);
    if (t !== null) jumpTo(t);
  }, [events, cursor, jumpTo]);
  const jumpPrevAward = useCallback(() => {
    const t = prevAwardCursor(events, cursor);
    if (t !== null) jumpTo(t);
  }, [events, cursor, jumpTo]);
  const jumpNextMove = useCallback(() => {
    const t = nextMoveCursor(eventClass, cursor);
    if (t !== null) jumpTo(t);
  }, [eventClass, cursor, jumpTo]);
  const jumpPrevMove = useCallback(() => {
    const t = prevMoveCursor(eventClass, cursor);
    if (t !== null) jumpTo(t);
  }, [eventClass, cursor, jumpTo]);
  const jumpToStart = useCallback(() => jumpTo(0), [jumpTo]);
  const jumpToEnd = useCallback(
    () => jumpTo(totalEvents),
    [jumpTo, totalEvents]
  );

  const seek = useMemo<SeekControls>(
    () => ({
      prevAward: jumpPrevAward,
      nextAward: jumpNextAward,
      prevMove: jumpPrevMove,
      nextMove: jumpNextMove,
      canPrevAward: prevAwardCursor(events, cursor) !== null,
      canNextAward: nextAwardCursor(events, cursor) !== null,
      canPrevMove: prevMoveCursor(eventClass, cursor) !== null,
      canNextMove: nextMoveCursor(eventClass, cursor) !== null
    }),
    [
      events,
      eventClass,
      cursor,
      jumpPrevAward,
      jumpNextAward,
      jumpPrevMove,
      jumpNextMove
    ]
  );

  // 1–9 are gated by `chooserKeysEnabled`: useKeyPress doesn't attach the
  // listener unless the live cursor is on a mark_problem with 2+ pendings AND
  // no queue/timeline preview is up. The preview gate mirrors the chooser-row
  // click (onPick is undefined while previewing) so a number key can't commit
  // against the LIVE chooser while the operator reads a previewed one. The
  // handler itself only bounds the per-index pick — the enable flag is shared
  // by all nine keys, so `9` must still no-op when fewer than 9 submissions pend.
  const shortcutsEnabled = !showHelp;
  const isPreviewing = hoverCursor !== null && hoverCursor !== cursor;
  const chooserActive = livePendingCount >= 2;
  const chooserKeysEnabled = shortcutsEnabled && chooserActive && !isPreviewing;
  const chooserKey = (idx: number) => () => {
    if (idx >= livePendingCount) return;
    manualStep(idx);
  };
  // Bare arrows only — Shift/⌥+arrow chords belong to the safe-margin
  // nudges bound in App.tsx.
  const BARE = { shift: false, alt: false };
  useKeyPress('ArrowLeft', manualRollback, shortcutsEnabled, BARE);
  useKeyPress('ArrowRight', manualStep, shortcutsEnabled, BARE);
  useKeyPress('1', chooserKey(0), chooserKeysEnabled);
  useKeyPress('2', chooserKey(1), chooserKeysEnabled);
  useKeyPress('3', chooserKey(2), chooserKeysEnabled);
  useKeyPress('4', chooserKey(3), chooserKeysEnabled);
  useKeyPress('5', chooserKey(4), chooserKeysEnabled);
  useKeyPress('6', chooserKey(5), chooserKeysEnabled);
  useKeyPress('7', chooserKey(6), chooserKeysEnabled);
  useKeyPress('8', chooserKey(7), chooserKeysEnabled);
  useKeyPress('9', chooserKey(8), chooserKeysEnabled);
  useKeyPress(' ', () => setPlaying((p) => !p), shortcutsEnabled);
  useKeyPress('c', () => setShowControls((s) => !s), shortcutsEnabled);
  // Seek navigation. ] [ for awards, . , for rank-changes (the unshifted
  // > < keys read as "seek"), Home/End for the ends of the reveal.
  useKeyPress(']', jumpNextAward, shortcutsEnabled);
  useKeyPress('[', jumpPrevAward, shortcutsEnabled);
  useKeyPress('.', jumpNextMove, shortcutsEnabled);
  useKeyPress(',', jumpPrevMove, shortcutsEnabled);
  useKeyPress('Home', jumpToStart, shortcutsEnabled);
  useKeyPress('End', jumpToEnd, shortcutsEnabled);
  // H toggles regardless so it can also close the modal.
  useKeyPress('h', () => setShowHelp((s) => !s));
  useKeyPress('f', toggleFullscreen, shortcutsEnabled);
  useKeyPress('p', () => setShowFps((s) => !s), shortcutsEnabled);

  useEffect(() => {
    if (cursor >= totalEvents && playing) setPlaying(false);
  }, [cursor, totalEvents, playing]);

  // stepRef so the autoplay interval doesn't tear down on every state
  // update that churns step's identity.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  // Absolute-time autoplay scheduler (pure target math in nextWake; see there
  // for why the target only advances on a cursor move). Reset to null on
  // pause / help so the next resume re-anchors.
  const wakeRef = useRef<WakeState | null>(null);
  // The queued step re-checks this before firing. At high speed the
  // award auto-pause's setPlaying(false) re-render can lag the
  // already-scheduled next step, which would step OFF the award before the
  // effect cleanup clears the timer — flashing the award past instead of
  // holding on it. Guarding on the live ref makes a pause win that race.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  useEffect(() => {
    if (!playing || showHelp) {
      wakeRef.current = null;
      return;
    }
    const now = performance.now();
    const next = nextWake(wakeRef.current, cursor, eventHoldMs, speed, now);
    wakeRef.current = next;
    const id = setTimeout(
      () => {
        if (playingRef.current) stepRef.current();
      },
      Math.max(0, next.wakeMs - now)
    );
    return () => clearTimeout(id);
  }, [playing, showHelp, speed, cursor, eventHoldMs]);

  // Captured during render so the first cursor=1 paint already has a
  // valid timestamp — a post-commit effect lags one frame.
  const startedAtRef = useRef<number | null>(null);
  if (cursor > 0 && startedAtRef.current === null) {
    startedAtRef.current = Date.now();
  }

  // Award reveal → confetti + autoplay pause. Confetti is scoreboard-only
  // (the audience window fires its own; in console mode it'd rain over
  // text panes). Auto-pause fires in both modes — award reveals are
  // paced moments and the operator shouldn't race autoplay.
  const prevImageSrcRef = useRef(imageSrc);
  useEffect(() => {
    if (imageSrc !== null && imageSrc !== prevImageSrcRef.current) {
      if (!audienceConnected) fireAwardConfetti();
      // Stop a queued autoplay step synchronously (not just via the
      // setPlaying re-render) so it can't overshoot the award at high speed.
      playingRef.current = false;
      setPlaying((p) => (p ? false : p));
    }
    prevImageSrcRef.current = imageSrc;
  }, [imageSrc, audienceConnected]);

  const ctx = useMemo(() => buildLookupCtx(inputData), [inputData]);

  const liveSnapshot = useMemo<Snapshot>(
    () => ({
      data,
      currentRowIndex,
      markedUserId,
      markedProblemId,
      imageSrc
    }),
    [data, currentRowIndex, markedUserId, markedProblemId, imageSrc]
  );

  return (
    <>
      {audienceConnected ? (
        <ConsoleBody
          events={events}
          cursor={cursor}
          totalEvents={totalEvents}
          peekAt={peekAt}
          pendingSubmissionsAt={pendingSubmissionsAt}
          projectRankAfter={projectRankAfter}
          projectSnapshotAfter={projectSnapshotAfter}
          liveSnapshot={liveSnapshot}
          hoverCursor={hoverCursor}
          setHoverCursor={setHoverCursor}
          clearPreview={clearPreview}
          ctx={ctx}
          startedAt={startedAtRef.current}
          themeKey={themeKey}
          onCycleTheme={onCycleTheme}
          playing={playing}
          setPlaying={setPlaying}
          speed={speed}
          setSpeed={setSpeed}
          manualStep={manualStep}
          manualRollback={manualRollback}
          seek={seek}
          jumpTo={jumpTo}
        />
      ) : (
        <ScoreboardBody
          data={data}
          problems={inputData.problems}
          currentRowIndex={currentRowIndex}
          markedUserId={markedUserId}
          markedProblemId={markedProblemId}
          imageSrc={imageSrc}
          playing={playing}
          speed={speed}
          safeInsets={safeInsets}
          awardFit={awardFit}
          showControls={showControls}
          setPlaying={setPlaying}
          setSpeed={setSpeed}
        />
      )}
      {showFps && <FpsHud />}
      {showHelp && (
        <HelpOverlay
          onClose={() => setShowHelp(false)}
          showCKeyHint={!audienceConnected}
        />
      )}
    </>
  );
}

function ScoreboardBody({
  data,
  problems,
  currentRowIndex,
  markedUserId,
  markedProblemId,
  imageSrc,
  playing,
  speed,
  safeInsets,
  awardFit,
  showControls,
  setPlaying,
  setSpeed
}: {
  data: UserRow[];
  problems: InputProblem[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  imageSrc: string | null;
  playing: boolean;
  speed: number;
  safeInsets: SafeInsets;
  awardFit: AwardFit;
  showControls: boolean;
  setPlaying: (updater: (p: boolean) => boolean) => void;
  setSpeed: (n: number) => void;
}) {
  return (
    <>
      <LiveScoreboard
        data={data}
        problems={problems}
        currentRowIndex={currentRowIndex}
        markedUserId={markedUserId}
        markedProblemId={markedProblemId}
        imageSrc={imageSrc}
        speed={speed}
        safeInsets={safeInsets}
        awardFit={awardFit}
      />
      {showControls && (
        <div className="controls">
          <button
            type="button"
            className="play-btn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <label className="speed">
            <span>{speed.toFixed(1)}×</span>
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
            />
          </label>
        </div>
      )}
    </>
  );
}

function ConsoleBody({
  events,
  cursor,
  totalEvents,
  peekAt,
  pendingSubmissionsAt,
  projectRankAfter,
  projectSnapshotAfter,
  liveSnapshot,
  hoverCursor,
  setHoverCursor,
  clearPreview,
  ctx,
  startedAt,
  themeKey,
  onCycleTheme,
  playing,
  setPlaying,
  speed,
  setSpeed,
  manualStep,
  manualRollback,
  seek,
  jumpTo
}: {
  events: readonly ResolverEvent[];
  cursor: number;
  totalEvents: number;
  peekAt: (cursor: number) => Snapshot;
  pendingSubmissionsAt: (cursor: number, userId: number) => InputSubmission[];
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
  liveSnapshot: Snapshot;
  hoverCursor: number | null;
  setHoverCursor: (n: number) => void;
  clearPreview: () => void;
  ctx: LookupCtx;
  startedAt: number | null;
  themeKey: ThemeKey;
  onCycleTheme: () => void;
  playing: boolean;
  setPlaying: (updater: (p: boolean) => boolean) => void;
  speed: number;
  setSpeed: (n: number) => void;
  manualStep: (choice?: number) => void;
  manualRollback: () => void;
  seek: SeekControls;
  // Commit the live cursor to an absolute position (click a queue row).
  jumpTo: (cursor: number) => void;
}) {
  const isPreviewing = hoverCursor !== null && hoverCursor !== cursor;
  const snapshot = isPreviewing ? peekAt(hoverCursor) : liveSnapshot;
  const effectiveCursor = isPreviewing ? hoverCursor : cursor;

  // Built against the EFFECTIVE cursor so a hover preview can show what
  // the chooser would look like at that point. NextPane ignores this list
  // when there's only one pending — only the chooser branch reads it.
  const pendingChoices = useMemo(() => {
    const nextEvt = events[effectiveCursor];
    if (!nextEvt || nextEvt.kind !== 'mark_problem') return [];
    const userId = nextEvt.userId;
    const subs = pendingSubmissionsAt(effectiveCursor, userId);
    const currentRank =
      snapshot.data.find((r) => r.userId === userId)?.rank ?? '';
    return subs.map((s) => ({
      submissionId: s.submissionId,
      problemId: s.problemId,
      eventualPoints: s.points,
      problemPoints: ctx.problemsById[s.problemId]?.points ?? 0,
      currentRank,
      projectedRank:
        projectRankAfter(effectiveCursor, userId, s.submissionId) ?? ''
    }));
  }, [
    events,
    effectiveCursor,
    pendingSubmissionsAt,
    projectRankAfter,
    snapshot.data,
    ctx
  ]);

  return (
    <div className="operator-console">
      <StatusStrip
        cursor={cursor}
        previewCursor={isPreviewing ? effectiveCursor : null}
        total={totalEvents}
        startedAt={startedAt}
        themeKey={themeKey}
        onCycleTheme={onCycleTheme}
      />
      <div className="op-panes">
        <NowPane
          events={events}
          cursor={effectiveCursor}
          ctx={ctx}
          snapshot={snapshot}
          isPreviewing={isPreviewing}
        />
        <NextPane
          events={events}
          cursor={effectiveCursor}
          ctx={ctx}
          snapshot={snapshot}
          isPreviewing={isPreviewing}
          pendingChoices={pendingChoices}
          projectRankAfter={projectRankAfter}
          projectSnapshotAfter={projectSnapshotAfter}
          onPickChoice={manualStep}
        />
        <QueuePane
          events={events}
          pivotCursor={cursor}
          ctx={ctx}
          onHoverCursor={setHoverCursor}
          onLeaveCursor={clearPreview}
          onCommitCursor={jumpTo}
        />
      </div>
      <div className="op-bottom">
        <Timeline
          events={events}
          cursor={cursor}
          hoverCursor={hoverCursor}
          onHoverCursor={setHoverCursor}
          onLeaveCursor={clearPreview}
        />
        <Transport
          playing={playing}
          speed={speed}
          onTogglePlay={() => setPlaying((p) => !p)}
          onStep={manualStep}
          onRollback={manualRollback}
          onSpeed={setSpeed}
          seek={seek}
        />
      </div>
    </div>
  );
}

function HelpOverlay({
  onClose,
  showCKeyHint
}: {
  onClose: () => void;
  showCKeyHint: boolean;
}) {
  // Esc-to-close, focus move + restore, dialog semantics. The H global
  // keypress also closes; Esc is bound locally because it's the universal
  // modal-dismiss expectation.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const lastFocused = document.activeElement as HTMLElement | null;
    cardRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Restore focus only if the previously-focused element is still in
      // the document. A mode swap or other unmount mid-help would leave
      // lastFocused detached, and focus() on a detached node silently
      // no-ops — landing focus on <body> instead of where the user expects.
      if (lastFocused && document.contains(lastFocused)) {
        lastFocused.focus?.();
      }
    };
  }, [onClose]);
  return (
    <div className="help-overlay" onClick={onClose} role="presentation">
      <div
        ref={cardRef}
        className="help-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="op-help-title"
        tabIndex={-1}
      >
        <h2 id="op-help-title">Keyboard shortcuts</h2>
        <dl>
          <dt>
            <kbd>→</kbd>
          </dt>
          <dd>Step forward</dd>
          <dt>
            <kbd>←</kbd>
          </dt>
          <dd>Step back</dd>
          <dt>
            <kbd>1</kbd>–<kbd>9</kbd>
          </dt>
          <dd>Reveal the N-th pending submission for the current user</dd>
          <dt>
            <kbd>Space</kbd>
          </dt>
          <dd>Play / pause autoplay</dd>
          <dt>
            <kbd>]</kbd> / <kbd>[</kbd>
          </dt>
          <dd>Jump to next / previous award</dd>
          <dt>
            <kbd>.</kbd> / <kbd>,</kbd>
          </dt>
          <dd>Jump to next / previous rank change</dd>
          <dt>
            <kbd>Home</kbd> / <kbd>End</kbd>
          </dt>
          <dd>Jump to the start / end of the reveal</dd>
          {showCKeyHint ? (
            <>
              <dt>
                <kbd>C</kbd>
              </dt>
              <dd>Toggle autoplay controls bar</dd>
            </>
          ) : null}
          <dt>
            <kbd>F</kbd>
          </dt>
          <dd>Toggle fullscreen (drops the browser address bar)</dd>
          <dt>
            <kbd>P</kbd>
          </dt>
          <dd>Toggle perf / FPS counter</dd>
          <dt>
            <kbd>T</kbd>
          </dt>
          <dd>Cycle color theme</dd>
          <dt>
            <kbd>Shift</kbd>+<kbd>↓↑→←</kbd>
          </dt>
          <dd>
            Safe margins, top / left edge: the arrow is the direction the edge
            moves (inward = more margin, for a curtain covering that edge)
          </dd>
          <dt>
            <kbd>⌥</kbd>+<kbd>↑↓←→</kbd>
          </dt>
          <dd>Safe margins, bottom / right edge (same rule)</dd>
          <dt>
            <kbd>I</kbd>
          </dt>
          <dd>Toggle award image fit: fill (stretch, default) ↔ contain</dd>
          <dt>
            <kbd>O</kbd>
          </dt>
          <dd>Open a second window as the audience display (mirrors live)</dd>
          <dt>
            <kbd>H</kbd>
          </dt>
          <dd>Toggle this help</dd>
        </dl>
        <p className="hint">
          {showCKeyHint
            ? 'Open the audience window with O to switch this window into operator-console mode (lookahead + queue + timeline).'
            : 'Hover the queue or timeline to preview future state without committing.'}{' '}
          Click anywhere, press <kbd>H</kbd>, or press <kbd>Esc</kbd> to close.
        </p>
      </div>
    </div>
  );
}
