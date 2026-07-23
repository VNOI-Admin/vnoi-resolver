import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import { useKeyPress } from './hooks';
import { applyHideUnofficials, useResolver } from './resolver';
import { THEMES, ThemeProvider, loadThemeKey } from './canvas/theme';
import { useThemeCssVars } from './canvas/useThemeCssVars';
import { LiveScoreboard } from './canvas/LiveScoreboard';
import {
  ALIVE_PING_MS,
  applySyncMessage,
  createSyncChannel,
  HELLO_RETRY_MS,
  initialAudienceSyncState,
  type AudienceSyncState,
  type InitPayload,
  type SyncMessage
} from './sync';
import type { SimAction } from './lib/resolver';
import type { AwardFit, SafeInsets } from './util/safeArea';
import { toggleFullscreen } from './util/fullscreen';
import { fireAwardConfetti } from './util/confetti';
import { ErrorBoundary } from './ErrorBoundary';

// Local reset for the ErrorBoundary re-handshake: wipe the ceremony and
// replay log but keep the theme/speed guess, then the hello loop restarts.
type SyncEvent = SyncMessage | { kind: 'reset' };
function syncReducer(
  state: AudienceSyncState,
  ev: SyncEvent
): AudienceSyncState {
  if (ev.kind === 'reset') {
    return { ...state, operatorCeremonyId: null, init: null, actionLog: [] };
  }
  return applySyncMessage(state, ev);
}

export function Audience() {
  const [sync, dispatch] = useReducer(syncReducer, undefined, () =>
    initialAudienceSyncState(loadThemeKey())
  );
  const { init, themeKey, speed, safeInsets, awardFit, actionLog } = sync;
  const { localCeremonyId } = sync;

  // Re-init handshake, fired on mount and on ErrorBoundary reset: restart the
  // hello loop so the operator answers with a fresh init.
  const helloRestartRef = useRef<() => void>(() => {});
  const handleErrorReset = useCallback(() => {
    dispatch({ kind: 'reset' });
    helloRestartRef.current();
  }, []);

  useEffect(() => {
    const ch = createSyncChannel();
    if (!ch) return;

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
      dispatch(e.data);
      if (e.data.kind === 'init') stopHello();
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
    // Announce a deliberate close so the operator flips back to scoreboard
    // mode immediately instead of waiting out the alive timeout. pagehide,
    // NOT the effect cleanup: StrictMode's dev double-mount would post a
    // spurious bye at startup. If the page is bfcached and later restored,
    // the resumed pings reconnect the operator instantly.
    const onPageHide = () =>
      ch.postMessage({ kind: 'bye' } satisfies SyncMessage);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      ch.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      ch.close();
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
          // ErrorBoundary catches any throw out of the replay render or the
          // Pixi tree (malformed reducer state, a transient @pixi/react
          // glitch) and re-handshakes — automatically, after a short delay,
          // plus a manual "Retry now". The ceremony key sits ON the boundary,
          // not inside it: a fresh init must replace the boundary itself,
          // otherwise an error state would survive the new ceremony and the
          // card could only ever be cleared by hand at the projector.
          <ErrorBoundary key={localCeremonyId} onReset={handleErrorReset}>
            <AudienceLive
              init={init}
              actionLog={actionLog}
              speed={speed}
              safeInsets={safeInsets}
              awardFit={awardFit}
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
 * (via the ceremony key on the ErrorBoundary) resets appliedCount to zero
 * for a fresh ceremony.
 *
 * There is deliberately NO try/catch around the dispatches: useReducer runs
 * the reducer during the NEXT render, not inside dispatch, so a wrapper here
 * could never catch anything. Malformed actions are neutralised inside the
 * reducer instead (out-of-range choices and non-integer seek cursors no-op),
 * and anything that still throws in render is the ErrorBoundary's job.
 */
function AudienceLive({
  init,
  actionLog,
  speed,
  safeInsets,
  awardFit
}: {
  init: InitPayload;
  actionLog: readonly SimAction[];
  speed: number;
  safeInsets: SafeInsets;
  awardFit: AwardFit;
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

  // step/rollback/seek are dispatch-wrappers with empty dep arrays
  // (resolver.ts), so their identities are stable for the life of this
  // component — safe in the dep array, and they never retrigger the effect.
  const appliedCount = useRef(0);
  useEffect(() => {
    while (appliedCount.current < actionLog.length) {
      const action = actionLog[appliedCount.current]!;
      // Explicit per-type dispatch. Unknown action types (e.g. a NEWER
      // operator build broadcasting an action this audience doesn't know)
      // are IGNORED rather than falling through to rollback — a stale
      // audience must never rollback-storm on an unrecognised action,
      // which is exactly what the old `else → rollback` fallback did when
      // `seek` was introduced.
      if (action.type === 'step') step(action.choice);
      else if (action.type === 'rollback') rollback();
      else if (action.type === 'seek') seek(action.cursor);
      appliedCount.current++;
    }
  }, [actionLog, step, rollback, seek]);

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
      safeInsets={safeInsets}
      awardFit={awardFit}
    />
  );
}
