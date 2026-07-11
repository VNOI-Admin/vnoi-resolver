import { describe, expect, it } from 'vitest';

import {
  applySyncMessage,
  initialAudienceSyncState,
  type InitPayload
} from '../sync';
import type { SimAction } from '../lib/resolver';

function payload(actionLog: SimAction[]): InitPayload {
  return {
    inputData: { users: [], problems: [], submissions: [] },
    imageData: {},
    frozenTime: 240,
    unofficialContestants: [],
    hideUnofficialContestants: false,
    themeKey: 'newsprint',
    speed: 1,
    actionLog
  };
}

const step: SimAction = { type: 'step', choice: undefined };

describe('applySyncMessage', () => {
  it('adopts the operator ceremony and seeds the log/theme/speed on init', () => {
    const s = applySyncMessage(initialAudienceSyncState('terminal'), {
      kind: 'init',
      ceremonyId: 7,
      payload: { ...payload([step, step]), themeKey: 'studio', speed: 3 }
    });
    expect(s.operatorCeremonyId).toBe(7);
    expect(s.localCeremonyId).toBe(1);
    expect(s.themeKey).toBe('studio');
    expect(s.speed).toBe(3);
    expect(s.actionLog).toEqual([step, step]);
  });

  it('bumps localCeremonyId on every adopted init (drives the remount key)', () => {
    let s = initialAudienceSyncState('newsprint');
    s = applySyncMessage(s, {
      kind: 'init',
      ceremonyId: 1,
      payload: payload([])
    });
    s = applySyncMessage(s, {
      kind: 'init',
      ceremonyId: 2,
      payload: payload([])
    });
    expect(s.localCeremonyId).toBe(2);
    expect(s.operatorCeremonyId).toBe(2);
  });

  it('ignores a same-ceremony init echo (no remount of a live audience)', () => {
    let s = applySyncMessage(initialAudienceSyncState('newsprint'), {
      kind: 'init',
      ceremonyId: 4,
      payload: payload([step])
    });
    s = applySyncMessage(s, { kind: 'append', ceremonyId: 4, action: step });
    const live = s;
    // Operator replies to another window's hello → init fans out to us too.
    const after = applySyncMessage(live, {
      kind: 'init',
      ceremonyId: 4,
      payload: payload([])
    });
    expect(after).toBe(live); // same reference: no remount, log preserved
    expect(after.localCeremonyId).toBe(live.localCeremonyId);
    expect(after.actionLog).toEqual([step, step]);
  });

  it('appends a matching-ceremony action to the log', () => {
    let s = initialAudienceSyncState('newsprint');
    s = applySyncMessage(s, {
      kind: 'init',
      ceremonyId: 5,
      payload: payload([])
    });
    s = applySyncMessage(s, { kind: 'append', ceremonyId: 5, action: step });
    expect(s.actionLog).toEqual([step]);
  });

  it('DROPS a stale append that races a newer init (the ceremonyId guard)', () => {
    let s = initialAudienceSyncState('newsprint');
    s = applySyncMessage(s, {
      kind: 'init',
      ceremonyId: 1,
      payload: payload([step])
    });
    // New ceremony adopted; its log is empty.
    s = applySyncMessage(s, {
      kind: 'init',
      ceremonyId: 2,
      payload: payload([])
    });
    const before = s;
    // A late append tagged with the OLD ceremony must not corrupt the new one.
    const after = applySyncMessage(s, {
      kind: 'append',
      ceremonyId: 1,
      action: step
    });
    expect(after).toBe(before);
    expect(after.actionLog).toEqual([]);
  });

  it('drops theme/speed/append before any init has been adopted', () => {
    const s0 = initialAudienceSyncState('newsprint');
    expect(
      applySyncMessage(s0, { kind: 'append', ceremonyId: 0, action: step })
    ).toBe(s0);
    expect(
      applySyncMessage(s0, { kind: 'theme', ceremonyId: 0, themeKey: 'studio' })
    ).toBe(s0);
  });

  it('gates theme and speed deltas on the ceremony id', () => {
    let s = initialAudienceSyncState('newsprint');
    s = applySyncMessage(s, {
      kind: 'init',
      ceremonyId: 9,
      payload: payload([])
    });
    s = applySyncMessage(s, {
      kind: 'theme',
      ceremonyId: 9,
      themeKey: 'terminal'
    });
    s = applySyncMessage(s, { kind: 'speed', ceremonyId: 9, speed: 2.5 });
    expect(s.themeKey).toBe('terminal');
    expect(s.speed).toBe(2.5);
    const stale = applySyncMessage(s, {
      kind: 'theme',
      ceremonyId: 8,
      themeKey: 'studio'
    });
    expect(stale).toBe(s);
  });

  it('is a no-op (same reference) for hello / alive', () => {
    const s = initialAudienceSyncState('newsprint');
    expect(applySyncMessage(s, { kind: 'hello' })).toBe(s);
    expect(applySyncMessage(s, { kind: 'alive' })).toBe(s);
  });
});
