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
import { StatusStrip } from './StatusStrip';
import { NowPane, NextPane, QueuePane } from './Panes';
import { Timeline, Transport } from './BottomBand';
import { buildLookupCtx, type LookupCtx } from './format';

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
    peekAt,
    pendingSubmissionsAt,
    projectRankAfter,
    step: rawStep,
    rollback: rawRollback
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

  const [playing, setPlaying] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const [showControls, setShowControls] = useState(false);

  // Drop any stale hover preview on mode swap, otherwise NOW/NEXT would
  // re-enter preview mode with the operator's mouse nowhere near the queue.
  useEffect(() => {
    setHoverCursor(null);
  }, [audienceConnected]);

  // Auto-clear a stale hoverCursor when autoplay's live cursor catches up.
  // Without this, the preview pane freezes on a now-past state while the
  // status strip and queue display a "preview" tag that's actually behind
  // live — the display would lie to the operator during a fast reveal.
  useEffect(() => {
    if (hoverCursor !== null && hoverCursor <= cursor) {
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

  // 1–9 are double-gated: live cursor must be on a mark_problem with 2+
  // pendings AND the index must be in range. Without this `1` outside the
  // chooser silently advances with `choice=0` (default), `2`–`9` no-op —
  // both are footguns. The kbd chips in the chooser mute correspondingly.
  const shortcutsEnabled = !showHelp;
  const chooserActive = livePendingCount >= 2;
  const chooserKey = (idx: number) => () => {
    if (!chooserActive || idx >= livePendingCount) return;
    manualStep(idx);
  };
  useKeyPress('ArrowLeft', manualRollback, shortcutsEnabled);
  useKeyPress('ArrowRight', manualStep, shortcutsEnabled);
  useKeyPress('1', chooserKey(0), shortcutsEnabled && chooserActive);
  useKeyPress('2', chooserKey(1), shortcutsEnabled && chooserActive);
  useKeyPress('3', chooserKey(2), shortcutsEnabled && chooserActive);
  useKeyPress('4', chooserKey(3), shortcutsEnabled && chooserActive);
  useKeyPress('5', chooserKey(4), shortcutsEnabled && chooserActive);
  useKeyPress('6', chooserKey(5), shortcutsEnabled && chooserActive);
  useKeyPress('7', chooserKey(6), shortcutsEnabled && chooserActive);
  useKeyPress('8', chooserKey(7), shortcutsEnabled && chooserActive);
  useKeyPress('9', chooserKey(8), shortcutsEnabled && chooserActive);
  useKeyPress(' ', () => setPlaying((p) => !p), shortcutsEnabled);
  useKeyPress('c', () => setShowControls((s) => !s), shortcutsEnabled);
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
  // Absolute-time autoplay scheduler. Per-event hold times (SOLVED_MOVE
  // long, FAILED short, etc.) are read from eventHoldMs[cursor-1] — the
  // hold AFTER the event whose result is currently on screen. The
  // nextWakeMsRef accumulates the target absolute time so per-iteration
  // jitter (React commit overhead, browser timer slop) doesn't compound
  // across a long reveal — each sleep is `target - now`, not a fresh
  // `delay` chained on top of the previous late firing.
  //
  // Reset to null on pause / showHelp / not-playing; the effect re-anchors
  // to performance.now() on resume.
  const nextWakeMsRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || showHelp) {
      nextWakeMsRef.current = null;
      return;
    }
    if (nextWakeMsRef.current === null) {
      nextWakeMsRef.current = performance.now();
    }
    // First fire after resume: no prior event to hold for. Otherwise hold
    // for the duration classified for events[cursor - 1] — the event whose
    // aftermath the audience is currently looking at.
    const prevIdx = cursor - 1;
    const baseHoldMs = prevIdx >= 0 ? (eventHoldMs[prevIdx] ?? 1000) : 0;
    nextWakeMsRef.current += baseHoldMs / speed;
    const sleepMs = Math.max(0, nextWakeMsRef.current - performance.now());
    const id = setTimeout(() => stepRef.current(), sleepMs);
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
  manualRollback
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
        />
        <QueuePane
          events={events}
          pivotCursor={cursor}
          ctx={ctx}
          onHoverCursor={setHoverCursor}
          onLeaveCursor={clearPreview}
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
