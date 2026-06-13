import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useKeyPress } from './hooks';
import { applyHideUnofficials, useResolver } from './resolver';
import {
  THEMES,
  ThemeProvider,
  loadThemeKey,
  type ThemeKey
} from './canvas/theme';
import { useThemeCssVars } from './canvas/useThemeCssVars';
import { LiveScoreboard } from './canvas/LiveScoreboard';
import {
  ALIVE_PING_MS,
  createSyncChannel,
  HELLO_RETRY_MS,
  type InitPayload,
  type SyncMessage
} from './sync';
import type { SimAction } from './lib/resolver';
import { toggleFullscreen } from './util/fullscreen';
import { fireAwardConfetti } from './util/confetti';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Audience root. Owns ALL sync state (init payload, theme, action log) so
 * that appends arriving before AudienceLive's listener would have mounted
 * are still captured — the previous design lost them and stuck the audience
 * N events behind the operator.
 */
export function Audience() {
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [init, setInit] = useState<InitPayload | null>(null);
  // Both windows share localStorage; this guess avoids a flash of the
  // default-theme background before init arrives.
  const [themeKey, setThemeKey] = useState<ThemeKey>(loadThemeKey);
  const [speed, setSpeed] = useState(1);
  // Bumps on every init. Drives AudienceLive's remount key so a fresh init
  // resets useResolver AND the appliedCount ref inside the replay engine.
  const [ceremonyId, setCeremonyId] = useState(0);
  // Operator's own ceremony id, tagged onto every message. We adopt it on
  // init and use it to drop messages from a STALE ceremony — without this,
  // an append broadcast that races a dataset change (broadcastAction is
  // synchronous; unsolicited init is useEffect-scheduled, so an append can
  // be queued after dataVersion bumps but before its init fires) would
  // apply against the wrong ceremony and possibly trip the events.ts
  // mark_problem gate.
  const operatorCeremonyIdRef = useRef<number | null>(null);
  const [actionLog, setActionLog] = useState<readonly SimAction[]>([]);

  // Re-init handshake. Triggered both on mount and on ErrorBoundary reset
  // — wiped to clean state, hello loop restarted so the operator answers
  // with a fresh init.
  const helloRestartRef = useRef<() => void>(() => {});
  const handleErrorReset = useCallback(() => {
    setInit(null);
    setActionLog([]);
    operatorCeremonyIdRef.current = null;
    helloRestartRef.current();
  }, []);

  useEffect(() => {
    const ch = createSyncChannel();
    if (!ch) return;
    channelRef.current = ch;

    let helloInterval: ReturnType<typeof setInterval> | null = null;
    const startHello = () => {
      ch.postMessage({ kind: 'hello' } satisfies SyncMessage);
      if (helloInterval !== null) clearInterval(helloInterval);
      helloInterval = setInterval(() => {
        ch.postMessage({ kind: 'hello' } satisfies SyncMessage);
      }, HELLO_RETRY_MS);
    };
    const stopHello = () => {
      if (helloInterval) {
        clearInterval(helloInterval);
        helloInterval = null;
      }
    };
    helloRestartRef.current = startHello;

    const onMessage = (e: MessageEvent<SyncMessage>) => {
      const msg = e.data;
      if (msg.kind === 'init') {
        // Adopt the operator's id; subsequent messages are filtered against it.
        operatorCeremonyIdRef.current = msg.ceremonyId;
        setCeremonyId((id) => id + 1);
        setInit(msg.payload);
        setThemeKey(msg.payload.themeKey);
        setSpeed(msg.payload.speed);
        // Direct value resets the log; appends batched in the same commit
        // (via the updater form below) compose on top of the reset value.
        setActionLog(msg.payload.actionLog.slice());
        stopHello();
        return;
      }
      // hello / alive carry no ceremonyId; the rest are dropped on
      // mismatch (stale operator session, race after dataset change).
      if (msg.kind === 'hello' || msg.kind === 'alive') return;
      if (msg.ceremonyId !== operatorCeremonyIdRef.current) return;
      if (msg.kind === 'theme') setThemeKey(msg.themeKey);
      else if (msg.kind === 'speed') setSpeed(msg.speed);
      else if (msg.kind === 'append') {
        setActionLog((log) => [...log, msg.action]);
      }
    };
    ch.addEventListener('message', onMessage);

    startHello();

    const ping = () => ch.postMessage({ kind: 'alive' } satisfies SyncMessage);
    ping();
    const aliveInterval = setInterval(ping, ALIVE_PING_MS);
    // Chrome throttles setInterval to ~1Hz when backgrounded; ping on
    // visibility recovery so the operator doesn't briefly declare us gone.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      ch.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      ch.close();
      channelRef.current = null;
      stopHello();
      clearInterval(aliveInterval);
    };
  }, []);

  useThemeCssVars(themeKey);

  // Web Fullscreen API drops every shred of browser chrome cross-platform,
  // unlike macOS Chrome's native fullscreen which keeps the address bar
  // reachable on hover-top.
  useKeyPress('f', toggleFullscreen);

  // Try fullscreen on mount; if denied (no transient activation in a
  // just-opened popup), attach one-shot listeners so the first interaction
  // flips us into it.
  useEffect(() => {
    let onFirst: (() => void) | null = null;
    const cleanup = () => {
      if (onFirst) {
        window.removeEventListener('click', onFirst);
        window.removeEventListener('keydown', onFirst);
        onFirst = null;
      }
    };
    document.documentElement.requestFullscreen().catch(() => {
      onFirst = () => {
        cleanup();
        document.documentElement.requestFullscreen().catch(() => {});
      };
      window.addEventListener('click', onFirst);
      window.addEventListener('keydown', onFirst);
    });
    return cleanup;
  }, []);

  // Toggle .audience-idle on the body; CSS hides the cursor while idle so
  // the projector image stays clean.
  useEffect(() => {
    const IDLE_MS = 2000;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const idle = () => document.body.classList.add('audience-idle');
    const active = () => {
      document.body.classList.remove('audience-idle');
      if (timer) clearTimeout(timer);
      timer = setTimeout(idle, IDLE_MS);
    };
    active();
    window.addEventListener('mousemove', active);
    return () => {
      window.removeEventListener('mousemove', active);
      if (timer) clearTimeout(timer);
      document.body.classList.remove('audience-idle');
    };
  }, []);

  return (
    <ThemeProvider theme={THEMES[themeKey]}>
      <div className="App">
        {init ? (
          // ErrorBoundary catches any throw out of the replay path or Pixi
          // tree (a malformed action, a transient @pixi/react glitch).
          // The defensive try/catch in AudienceLive's replay effect should
          // catch most of these BEFORE they propagate; the boundary is the
          // belt-and-suspenders cover that re-hands-hakes instead of leaving
          // a white projector.
          <ErrorBoundary onReset={handleErrorReset}>
            <AudienceLive
              key={ceremonyId}
              init={init}
              actionLog={actionLog}
              speed={speed}
            />
          </ErrorBoundary>
        ) : (
          <div className="audience-waiting">
            <div className="audience-waiting-card">
              <h2>Waiting for the operator…</h2>
              <p>
                This is the audience display. Open the main URL in another
                window on this browser and press <kbd>O</kbd> there to pair, or
                load a dataset on the operator window to start the reveal.
              </p>
              <button
                type="button"
                className="audience-fullscreen-btn"
                onClick={toggleFullscreen}
              >
                Enter fullscreen
              </button>
              <p className="hint">
                Or press <kbd>F</kbd> any time to drop the browser chrome.
              </p>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

/**
 * Pure replay engine. appliedCount tracks how many actionLog entries have
 * been dispatched; the effect runs only the new tail on each render. Remount
 * (via key={ceremonyId}) resets appliedCount to zero for a fresh ceremony.
 *
 * Replay is wrapped in a per-action try/catch so a single malformed action
 * doesn't crash the audience window — the offending action is skipped, the
 * error is logged, and replay continues. Defense in depth with the outer
 * ErrorBoundary.
 */
function AudienceLive({
  init,
  actionLog,
  speed
}: {
  init: InitPayload;
  actionLog: readonly SimAction[];
  speed: number;
}) {
  const filteredInput = useMemo(
    () =>
      applyHideUnofficials(
        init.inputData,
        init.unofficialContestants,
        init.hideUnofficialContestants
      ),
    [init.inputData, init.unofficialContestants, init.hideUnofficialContestants]
  );

  const {
    data,
    currentRowIndex,
    markedUserId,
    markedProblemId,
    imageSrc,
    step,
    rollback,
    seek
  } = useResolver({
    inputData: filteredInput,
    imageData: init.imageData,
    unofficialContestants: init.unofficialContestants,
    frozenTime: init.frozenTime * 60
  });

  const stepRef = useRef(step);
  const rollbackRef = useRef(rollback);
  const seekRef = useRef(seek);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    rollbackRef.current = rollback;
  }, [rollback]);
  useEffect(() => {
    seekRef.current = seek;
  }, [seek]);

  const appliedCount = useRef(0);
  useEffect(() => {
    while (appliedCount.current < actionLog.length) {
      const action = actionLog[appliedCount.current]!;
      try {
        // Explicit per-type dispatch. Unknown action types (e.g. a NEWER
        // operator build broadcasting an action this audience doesn't know)
        // are IGNORED rather than falling through to rollback — a stale
        // audience must never rollback-storm on an unrecognised action,
        // which is exactly what the old `else → rollback` fallback did when
        // `seek` was introduced.
        if (action.type === 'step') stepRef.current(action.choice);
        else if (action.type === 'rollback') rollbackRef.current();
        else if (action.type === 'seek') seekRef.current(action.cursor);
      } catch (err) {
        console.warn(
          '[Audience] applyEvent failed at index',
          appliedCount.current,
          'action:',
          action,
          err
        );
      }
      appliedCount.current++;
    }
  }, [actionLog]);

  // Prev-ref dedupe also covers the initial-replay catch-up burst — all
  // intermediate imageSrc values collapse into one commit, so only the
  // final value reaches this effect.
  const prevImageSrc = useRef(imageSrc);
  useEffect(() => {
    if (imageSrc !== null && imageSrc !== prevImageSrc.current) {
      fireAwardConfetti();
    }
    prevImageSrc.current = imageSrc;
  }, [imageSrc]);

  return (
    <LiveScoreboard
      data={data}
      problems={init.inputData.problems}
      currentRowIndex={currentRowIndex}
      markedUserId={markedUserId}
      markedProblemId={markedProblemId}
      imageSrc={imageSrc}
      speed={speed}
    />
  );
}
