import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './App.css';
import { useKeyPress } from './hooks';
import {
  THEMES,
  THEME_LS_KEY,
  ThemeProvider,
  cycleThemeKey,
  loadThemeKey,
  type ThemeKey
} from './canvas/theme';
import { useThemeCssVars } from './canvas/useThemeCssVars';
import { InputData, AwardImageMap } from './resolver';
import type { SimAction } from './lib/resolver';
import { Loading } from './Loading';
import { OperatorConsole } from './operator/OperatorConsole';
import { Audience } from './Audience';
import {
  audienceWindowUrl,
  readDisplayRole,
  readUrlConfig
} from './util/urlConfig';
import {
  ALIVE_POLL_MS,
  ALIVE_TIMEOUT_MS,
  createSyncChannel,
  type SyncMessage
} from './sync';

function App() {
  const role = useMemo(readDisplayRole, []);
  if (role === 'audience') return <Audience />;
  return <Operator />;
}

function Operator() {
  const initial = useMemo(readUrlConfig, []);

  const [loading, setLoading] = useState<boolean>(true);
  const [inputData, setInputData] = useState<InputData | null>(null);
  const [imageData, setImageData] = useState<AwardImageMap>({});
  const [frozenTime, setFrozenTime] = useState<number>(initial.frozenTime);
  const [unofficialContestants, setUnofficialContestants] = useState<string[]>(
    initial.unofficial
  );
  const [hideUnofficialContestants, setHideUnofficialContestants] = useState(
    initial.hideUnofficial
  );

  const [themeKey, setThemeKey] = useState<ThemeKey>(loadThemeKey);
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_LS_KEY, themeKey);
    } catch {
      // localStorage may be disabled; theming still works in-memory.
    }
  }, [themeKey]);
  useKeyPress('t', () => setThemeKey(cycleThemeKey));

  const [speed, setSpeed] = useState(1);

  // Bump on dataset identity OR unofficial-partition change. Used as a
  // remount key on OperatorConsole so useReducer re-initialises — toggling
  // the partition without a bump would leave useResolver ranking a
  // now-different population than its initial precompute baseline.
  const dataVersionRef = useRef({
    data: inputData,
    unofficial: unofficialContestants,
    hideUnofficial: hideUnofficialContestants,
    version: 0
  });
  if (
    dataVersionRef.current.data !== inputData ||
    dataVersionRef.current.unofficial !== unofficialContestants ||
    dataVersionRef.current.hideUnofficial !== hideUnofficialContestants
  ) {
    dataVersionRef.current = {
      data: inputData,
      unofficial: unofficialContestants,
      hideUnofficial: hideUnofficialContestants,
      version: dataVersionRef.current.version + 1
    };
  }
  const dataVersion = dataVersionRef.current.version;

  useThemeCssVars(themeKey);

  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    channelRef.current = createSyncChannel();
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const actionLogRef = useRef<SimAction[]>([]);
  const prevDataVersionRef = useRef(dataVersion);
  if (prevDataVersionRef.current !== dataVersion) {
    actionLogRef.current = [];
    prevDataVersionRef.current = dataVersion;
  }

  // Monotonic ceremony id, tagged onto every message we broadcast. Bumps in
  // sync with the action-log reset above so an append broadcast that races
  // a dataset change still carries the OLD ceremony id and gets dropped by
  // the audience instead of being mis-applied against the new ceremony.
  const ceremonyIdRef = useRef(0);
  const prevDataVersionForCeremonyRef = useRef(dataVersion);
  if (prevDataVersionForCeremonyRef.current !== dataVersion) {
    ceremonyIdRef.current += 1;
    prevDataVersionForCeremonyRef.current = dataVersion;
  }

  // Ref so the hello-responder reads the live payload without re-binding
  // its listener on every state change.
  const payloadRef = useRef({
    inputData,
    imageData,
    frozenTime,
    unofficialContestants,
    hideUnofficialContestants,
    themeKey,
    speed
  });
  payloadRef.current = {
    inputData,
    imageData,
    frozenTime,
    unofficialContestants,
    hideUnofficialContestants,
    themeKey,
    speed
  };

  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const onMessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data.kind !== 'hello') return;
      const p = payloadRef.current;
      if (!p.inputData) return;
      ch.postMessage({
        kind: 'init',
        ceremonyId: ceremonyIdRef.current,
        payload: {
          inputData: p.inputData,
          imageData: p.imageData,
          frozenTime: p.frozenTime,
          unofficialContestants: p.unofficialContestants,
          hideUnofficialContestants: p.hideUnofficialContestants,
          themeKey: p.themeKey,
          speed: p.speed,
          actionLog: actionLogRef.current.slice()
        }
      });
    };
    ch.addEventListener('message', onMessage);
    return () => ch.removeEventListener('message', onMessage);
  }, []);

  // Unsolicited init on dataset / partition change so an already-connected
  // audience picks up the new ceremony without needing a refresh. Guarded
  // against StrictMode dev double-mount with a "last-broadcast version" ref.
  const lastBroadcastDataVersionRef = useRef<number | null>(null);
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !inputData) return;
    if (lastBroadcastDataVersionRef.current === dataVersion) return;
    lastBroadcastDataVersionRef.current = dataVersion;
    ch.postMessage({
      kind: 'init',
      ceremonyId: ceremonyIdRef.current,
      payload: {
        inputData,
        imageData,
        frozenTime,
        unofficialContestants,
        hideUnofficialContestants,
        themeKey,
        speed,
        actionLog: actionLogRef.current.slice()
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion]);

  // Skip first paint: the initial theme/speed values ride along in the
  // init payload, no need to fire a redundant message at mount.
  const firstThemePaint = useRef(true);
  useEffect(() => {
    if (firstThemePaint.current) {
      firstThemePaint.current = false;
      return;
    }
    channelRef.current?.postMessage({
      kind: 'theme',
      ceremonyId: ceremonyIdRef.current,
      themeKey
    });
  }, [themeKey]);

  const firstSpeedPaint = useRef(true);
  useEffect(() => {
    if (firstSpeedPaint.current) {
      firstSpeedPaint.current = false;
      return;
    }
    channelRef.current?.postMessage({
      kind: 'speed',
      ceremonyId: ceremonyIdRef.current,
      speed
    });
  }, [speed]);

  const broadcastAction = useCallback((action: SimAction) => {
    actionLogRef.current.push(action);
    channelRef.current?.postMessage({
      kind: 'append',
      ceremonyId: ceremonyIdRef.current,
      action
    });
  }, []);

  // Hysteresis: disconnect needs two consecutive missed polls, reconnect
  // is instant. Also flip to connected immediately on receiving 'alive' so
  // the first ping after the audience window opens isn't delayed up to
  // ALIVE_POLL_MS by waiting for the next interval tick.
  const [audienceConnected, setAudienceConnected] = useState(false);
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    let lastSeen = 0;
    let missedPolls = 0;
    const onMessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data.kind === 'alive') {
        lastSeen = Date.now();
        missedPolls = 0;
        setAudienceConnected(true);
      }
    };
    ch.addEventListener('message', onMessage);
    const id = setInterval(() => {
      const within = Date.now() - lastSeen < ALIVE_TIMEOUT_MS;
      if (within) {
        missedPolls = 0;
        setAudienceConnected(true);
      } else {
        missedPolls++;
        if (missedPolls >= 2) setAudienceConnected(false);
      }
    }, ALIVE_POLL_MS);
    return () => {
      ch.removeEventListener('message', onMessage);
      clearInterval(id);
    };
  }, []);

  // `popup=yes` plus explicit width/height/top/left flips browsers out of
  // tab-default into popup mode — drops the address bar / tab strip /
  // toolbar so the projector sees only the page. Named target focuses an
  // existing window instead of spawning a duplicate.
  useKeyPress('o', () => {
    const w = window.screen.availWidth;
    const h = window.screen.availHeight;
    window.open(
      audienceWindowUrl(),
      'vnoi-audience',
      `popup=yes,width=${w},height=${h},top=0,left=0,noopener`
    );
  });

  return (
    <ThemeProvider theme={THEMES[themeKey]}>
      <div className="App">
        {loading || !inputData ? (
          <Loading
            inputData={inputData}
            frozenTime={frozenTime}
            unofficialContestants={unofficialContestants}
            hideUnofficialContestants={hideUnofficialContestants}
            dataUrl={initial.dataUrl}
            imageUrl={initial.imageUrl}
            setLoading={setLoading}
            setInputData={setInputData}
            setImageData={setImageData}
            setFrozenTime={setFrozenTime}
            setUnofficialContestants={setUnofficialContestants}
            setHideUnofficialContestants={setHideUnofficialContestants}
          />
        ) : (
          <OperatorConsole
            key={dataVersion}
            inputData={inputData}
            imageData={imageData}
            frozenTime={frozenTime}
            unofficialContestants={unofficialContestants}
            hideUnofficialContestants={hideUnofficialContestants}
            themeKey={themeKey}
            onCycleTheme={() => setThemeKey(cycleThemeKey)}
            speed={speed}
            setSpeed={setSpeed}
            audienceConnected={audienceConnected}
            onAction={broadcastAction}
          />
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
