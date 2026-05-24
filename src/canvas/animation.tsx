/* eslint-disable react-refresh/only-export-components */
// This module deliberately exports both AnimationRoot and useAnimationJob —
// they share a private Context and are always used together.

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode
} from 'react';
import { useTick } from '@pixi/react';

export type TickFn = (deltaMs: number) => void;

type AnimationApi = {
  add: (job: TickFn) => void;
  remove: (job: TickFn) => void;
};

const Ctx = createContext<AnimationApi | null>(null);

/**
 * Mount a single useTick at the canvas root and dispatch to a dynamic set of
 * animation jobs. Components register/unregister themselves via `useAnimationJob`
 * so an idle component contributes literally zero per-frame work — no closure
 * call, no ref read, no branch. Renders also stop re-creating ticker
 * subscriptions; we keep one for the whole tree.
 */
export function AnimationRoot({ children }: { children: ReactNode }) {
  const jobs = useRef<Set<TickFn>>(new Set());
  const lastTime = useRef(0);

  useTick(() => {
    if (jobs.current.size === 0) {
      // Reset so the next active frame computes a fresh dt instead of treating
      // the entire idle gap as one frame.
      lastTime.current = 0;
      return;
    }
    const now = performance.now();
    const dt = lastTime.current === 0 ? 16.6667 : now - lastTime.current;
    lastTime.current = now;
    for (const job of jobs.current) job(dt);
  });

  const api = useMemo<AnimationApi>(
    () => ({
      add: (job) => {
        jobs.current.add(job);
      },
      remove: (job) => {
        jobs.current.delete(job);
      }
    }),
    []
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/**
 * Returns a stable handle with `start()` / `stop()` methods. Call `start()`
 * when an animation should begin running, `stop()` once it settles (typically
 * inside the callback at the last frame). The job runs every frame only while
 * started. Unmount automatically stops + cleans up.
 */
export function useAnimationJob(callback: TickFn): {
  start: () => void;
  stop: () => void;
} {
  const ctx = useContext(Ctx);
  const cbRef = useRef(callback);
  // useLayoutEffect, not render: under concurrent rendering a discarded render
  // would otherwise still mutate the ref before commit, and a useTick fired in
  // that window would call a callback that closed over props that were never
  // committed. Layout-effect timing matches when the ticker can safely see it.
  useLayoutEffect(() => {
    cbRef.current = callback;
  });

  // Stable callback identity — closes over cbRef so it always sees the latest
  // implementation without re-registering.
  const stableJob = useMemo<TickFn>(() => (dt) => cbRef.current(dt), []);

  useEffect(() => () => ctx?.remove(stableJob), [ctx, stableJob]);

  return useMemo(
    () => ({
      start: () => ctx?.add(stableJob),
      stop: () => ctx?.remove(stableJob)
    }),
    [ctx, stableJob]
  );
}
