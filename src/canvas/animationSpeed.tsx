/* eslint-disable react-refresh/only-export-components */
// Provider + hook share a private Context and are always used together.

import { createContext, useContext, type ReactNode } from 'react';

// Playback-speed scalar consumed by canvas tween durations. Every tween
// (rows / score count-up / camera pan / pill colour) divides its base ms
// by this scalar — so a 1500ms reorder at 1× becomes 750ms at 2× and
// 300ms at 5×. Without this scaling the tweens overlap at high speeds and
// the audience sees a chasing-targets shimmer instead of discrete reveals.
//
// Default 1 so a canvas rendered outside a provider gets unscaled bases.
const AnimationSpeedContext = createContext<number>(1);

export function AnimationSpeedProvider({
  speed,
  children
}: {
  speed: number;
  children: ReactNode;
}) {
  return (
    <AnimationSpeedContext.Provider value={speed}>
      {children}
    </AnimationSpeedContext.Provider>
  );
}

export function useAnimationSpeed(): number {
  return useContext(AnimationSpeedContext);
}
