import { useCallback, useEffect, useRef, useState } from 'react';

import type { SimAction } from './lib/resolver';
import type { InputData, AwardImageMap } from './resolver';
import type { ThemeKey } from './canvas/theme';
import {
  ALIVE_POLL_MS,
  ALIVE_TIMEOUT_MS,
  createSyncChannel,
  type InitPayload,
  type SyncMessage
} from './sync';

function newCeremonyId(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

export type OperatorPayload = {
  inputData: InputData | null;
  imageData: AwardImageMap;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
  themeKey: ThemeKey;
  speed: number;
};

// Owns the operator side of the two-window protocol: the BroadcastChannel, the
// ceremony id, the append-only action log, theme/speed deltas, the hello
// responder, and the audience heartbeat. App's Operator just feeds it the
// current payload + dataVersion and gets back what it renders with.
export function useSyncOperator(
  payload: OperatorPayload,
  dataVersion: number
): {
  broadcastAction: (action: SimAction) => void;
  audienceConnected: boolean;
} {
  const channelRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    channelRef.current = createSyncChannel();
    return () => {
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  // Reset the action log AND issue a new ceremony id together on every
  // dataset / partition change — one render-phase block so the ordering they
  // rely on lives in a single place. Tagging every message with the ceremony
  // id lets the audience drop an append that races a dataset change:
  // broadcastAction is synchronous while the unsolicited init is
  // effect-scheduled, so an append can be queued after this bump but before
  // its init fires, and it must carry the new id to be dropped against the
  // old ceremony rather than misapplied.
  //
  // Ids are RANDOM, not a counter: the audience drops a same-id init as a
  // fan-out echo, so ids must be unique across operator sessions — a
  // deterministic counter lands on the same id after an operator reload
  // (every session that loads one dataset would reach 1), and the reloaded
  // operator's fresh init would be silently ignored by a still-open
  // audience, desyncing it permanently. Equality is the only comparison ever
  // made on ids, so random values need no ordering.
  const actionLogRef = useRef<SimAction[]>([]);
  const ceremonyIdRef = useRef(newCeremonyId());
  const prevDataVersionRef = useRef(dataVersion);
  if (prevDataVersionRef.current !== dataVersion) {
    actionLogRef.current = [];
    ceremonyIdRef.current = newCeremonyId();
    prevDataVersionRef.current = dataVersion;
  }

  // Live payload for the hello/init responders so they don't rebind on every
  // keystroke-driven state change.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const buildInit = useCallback((): SyncMessage | null => {
    const p = payloadRef.current;
    if (!p.inputData) return null;
    const initPayload: InitPayload = {
      inputData: p.inputData,
      imageData: p.imageData,
      frozenTime: p.frozenTime,
      unofficialContestants: p.unofficialContestants,
      hideUnofficialContestants: p.hideUnofficialContestants,
      themeKey: p.themeKey,
      speed: p.speed,
      actionLog: actionLogRef.current.slice()
    };
    return {
      kind: 'init',
      ceremonyId: ceremonyIdRef.current,
      payload: initPayload
    };
  }, []);

  useEffect(() => {
    const ch = channelRef.current;
    if (!ch) return;
    const onMessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data.kind !== 'hello') return;
      const init = buildInit();
      if (init) ch.postMessage(init);
    };
    ch.addEventListener('message', onMessage);
    return () => ch.removeEventListener('message', onMessage);
  }, [buildInit]);

  // Unsolicited init on dataset / partition change so an already-connected
  // audience adopts the new ceremony without a refresh. The version guard
  // absorbs StrictMode's dev double-mount.
  const lastBroadcastDataVersionRef = useRef<number | null>(null);
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || lastBroadcastDataVersionRef.current === dataVersion) return;
    const init = buildInit();
    if (!init) return;
    lastBroadcastDataVersionRef.current = dataVersion;
    ch.postMessage(init);
  }, [dataVersion, buildInit]);

  // Skip first paint: theme/speed ride along in the init payload, so the
  // initial values don't need a redundant delta at mount.
  const firstThemePaint = useRef(true);
  useEffect(() => {
    if (firstThemePaint.current) {
      firstThemePaint.current = false;
      return;
    }
    channelRef.current?.postMessage({
      kind: 'theme',
      ceremonyId: ceremonyIdRef.current,
      themeKey: payload.themeKey
    });
  }, [payload.themeKey]);

  const firstSpeedPaint = useRef(true);
  useEffect(() => {
    if (firstSpeedPaint.current) {
      firstSpeedPaint.current = false;
      return;
    }
    channelRef.current?.postMessage({
      kind: 'speed',
      ceremonyId: ceremonyIdRef.current,
      speed: payload.speed
    });
  }, [payload.speed]);

  const broadcastAction = useCallback((action: SimAction) => {
    actionLogRef.current.push(action);
    channelRef.current?.postMessage({
      kind: 'append',
      ceremonyId: ceremonyIdRef.current,
      action
    });
  }, []);

  // Hysteresis: disconnect needs two consecutive missed polls, reconnect is
  // instant (flip to connected the moment an 'alive' arrives, not on the next
  // poll tick). A 'bye' (deliberate close, sent on pagehide) short-circuits
  // the hysteresis entirely — the timeout exists to absorb MISSED pings, and
  // making the operator stare at a dead console for ~10s after closing the
  // audience window is the wrong trade. With several audience windows open,
  // one window's bye can flip the mode for up to one ping interval until a
  // survivor's next 'alive' reconnects — instant by design.
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
      } else if (e.data.kind === 'bye') {
        lastSeen = 0;
        missedPolls = 2;
        setAudienceConnected(false);
      }
    };
    ch.addEventListener('message', onMessage);
    const id = setInterval(() => {
      if (Date.now() - lastSeen < ALIVE_TIMEOUT_MS) {
        missedPolls = 0;
        setAudienceConnected(true);
      } else if (++missedPolls >= 2) {
        setAudienceConnected(false);
      }
    }, ALIVE_POLL_MS);
    return () => {
      ch.removeEventListener('message', onMessage);
      clearInterval(id);
    };
  }, []);

  return { broadcastAction, audienceConnected };
}
