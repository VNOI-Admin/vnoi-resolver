/* eslint-disable react-refresh/only-export-components */
// AnimationRoot and useAnimationJob share a private Context and are always
// used together.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode
} from 'react';
import { useTick } from '@pixi/react';

export type TickFn = () => void;

type AnimationApi = {
  add: (job: TickFn) => void;
  remove: (job: TickFn) => void;
};

const Ctx = createContext<AnimationApi | null>(null);

/**
 * Single useTick at the canvas root dispatches to a dynamic set of jobs.
 * Components register via useAnimationJob, so an idle component contributes
 * literally zero per-frame work — no closure call, no ref read.
 */
export function AnimationRoot({ children }: { children: ReactNode }) {
  const jobs = useRef<Set<TickFn>>(new Set());

  // Stable identity so useTick doesn't tear down + re-add the ticker
  // subscription on every parent re-render (theme cycle, viewport resize,
  // speed context update).
  const tick = useCallback<TickFn>(() => {
    if (jobs.current.size === 0) return;
    // Safe to iterate the live Set: a job that stops itself deletes the
    // current element, which Set iteration tolerates. No job stops a sibling.
    for (const job of jobs.current) job();
  }, []);

  useTick(tick);

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
 * Returns { start, stop }. Call start() when an animation begins, stop()
 * once it settles. Job runs every frame only while started. Unmount cleans up.
 */
export function useAnimationJob(callback: TickFn): {
  start: () => void;
  stop: () => void;
} {
  const ctx = useContext(Ctx);
  const cbRef = useRef(callback);
  // useLayoutEffect (not render): under concurrent rendering a discarded
  // render could otherwise mutate the ref before commit, and a useTick
  // fired in that window would call props that were never committed.
  useLayoutEffect(() => {
    cbRef.current = callback;
  });

  const stableJob = useMemo<TickFn>(() => () => cbRef.current(), []);

  useEffect(() => () => ctx?.remove(stableJob), [ctx, stableJob]);

  return useMemo(
    () => ({
      start: () => ctx?.add(stableJob),
      stop: () => ctx?.remove(stableJob)
    }),
    [ctx, stableJob]
  );
}
