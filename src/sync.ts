// Two-window sync over BroadcastChannel.
//
// Operator owns truth. Audience mirrors. Both run their own useResolver and
// stay in sync by replaying a deterministic action log — the simulation is
// pure given (inputData, ctx, actions), so the audience converges by
// replaying the same actions on the same data.
//
// Handshake: audience says `hello` every 2s until it receives `init`. After
// init, the operator pushes `append` / `theme` / `speed` as events occur.
// The operator also pushes unsolicited `init` on dataset / partition change
// so a live audience picks up the new ceremony without a refresh.
//
// Every operator → audience message carries a `ceremonyId` that bumps on
// every init. The audience drops messages whose id doesn't match its
// current one (except init, which adopts the new id). Without this tag a
// post-paint-scheduled init can be overtaken by a synchronously-broadcast
// append from a stale autoplay/keydown handler, applying the append against
// the wrong ceremony.

import type { SimAction } from './lib/resolver';
import type { InputData, AwardImageMap } from './resolver';
import type { ThemeKey } from './canvas/theme';

export const HELLO_RETRY_MS = 2000;
// Timeout is wider than the ping interval (8s vs 2s) to absorb consecutive
// missed pings — heavy commit frames at 5× autoplay, GC pauses, and brief
// background-tab throttling all blow a 5s window. Combined with the
// two-strike hysteresis on the operator side, this prevents UI-mode flap
// on jitter while still showing a genuine disconnect within ~10s.
export const ALIVE_PING_MS = 2000;
export const ALIVE_TIMEOUT_MS = 8000;
export const ALIVE_POLL_MS = 1000;

export type InitPayload = {
  inputData: InputData;
  imageData: AwardImageMap;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
  themeKey: ThemeKey;
  speed: number;
  actionLog: SimAction[];
};

export type SyncMessage =
  | { kind: 'hello' }
  | { kind: 'init'; ceremonyId: number; payload: InitPayload }
  | { kind: 'append'; ceremonyId: number; action: SimAction }
  | { kind: 'theme'; ceremonyId: number; themeKey: ThemeKey }
  | { kind: 'speed'; ceremonyId: number; speed: number }
  | { kind: 'alive' };

export function createSyncChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel('vnoi-resolver:sync');
}

// Audience-side replica of everything the operator drives, as a pure reducer
// over the wire protocol. Extracted from the Audience component so the
// stale-message races (an append from the old ceremony overtaking a new init)
// can be pinned by unit tests rather than only caught live on a projector.
//
// `localCeremonyId` increments each time a new ceremony is adopted; the
// component uses it as the remount key so a fresh init resets the replay
// engine. `operatorCeremonyId` is the operator's own id, used to drop traffic
// from a stale session.
export type AudienceSyncState = {
  operatorCeremonyId: number | null;
  localCeremonyId: number;
  init: InitPayload | null;
  themeKey: ThemeKey;
  speed: number;
  actionLog: readonly SimAction[];
};

export function initialAudienceSyncState(
  themeKey: ThemeKey
): AudienceSyncState {
  return {
    operatorCeremonyId: null,
    localCeremonyId: 0,
    init: null,
    themeKey,
    speed: 1,
    actionLog: []
  };
}

export function applySyncMessage(
  state: AudienceSyncState,
  msg: SyncMessage
): AudienceSyncState {
  switch (msg.kind) {
    case 'hello':
    case 'alive':
      return state;
    case 'init':
      // An init echoing the ceremony we already run is just the operator
      // replying to some other window's hello (init fans out to all audiences
      // over the shared channel). Ignore it: re-adopting would bump
      // localCeremonyId, remount AudienceLive, and replay the whole log from
      // scratch — a visible flash + re-tween on a screen that's already live.
      if (state.operatorCeremonyId === msg.ceremonyId && state.init !== null) {
        return state;
      }
      return {
        operatorCeremonyId: msg.ceremonyId,
        localCeremonyId: state.localCeremonyId + 1,
        init: msg.payload,
        themeKey: msg.payload.themeKey,
        speed: msg.payload.speed,
        actionLog: msg.payload.actionLog.slice()
      };
    case 'theme':
    case 'speed':
    case 'append':
      if (msg.ceremonyId !== state.operatorCeremonyId) return state;
      if (msg.kind === 'theme') return { ...state, themeKey: msg.themeKey };
      if (msg.kind === 'speed') return { ...state, speed: msg.speed };
      return { ...state, actionLog: [...state.actionLog, msg.action] };
  }
}
