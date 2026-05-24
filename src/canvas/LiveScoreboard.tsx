import { Suspense, lazy } from 'react';

import type { InputProblem, UserRow } from '../lib/resolver';
import { AnimationSpeedProvider } from './animationSpeed';

// Pixi + @pixi/react is ~500 KB. Code-split so the splash form / operator
// console don't pay the cost; only loaded when a live scoreboard mounts.
const Scoreboard = lazy(() =>
  import('./Scoreboard').then((m) => ({ default: m.Scoreboard }))
);

/**
 * Pixi canvas + award-image overlay. Rendered identically by the operator
 * scoreboard mode and the audience window — shared here so the lazy
 * boundary, fallback, and overlay markup live in one place.
 *
 * Confetti is NOT included here; callers fire it independently because the
 * trigger logic differs per surface.
 */
export function LiveScoreboard({
  data,
  problems,
  currentRowIndex,
  markedUserId,
  markedProblemId,
  imageSrc,
  speed
}: {
  data: UserRow[];
  problems: InputProblem[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  imageSrc: string | null;
  speed: number;
}) {
  return (
    <AnimationSpeedProvider speed={speed}>
      <Suspense fallback={<div className="canvas-fallback">Loading…</div>}>
        <Scoreboard
          data={data}
          problems={problems}
          currentRowIndex={currentRowIndex}
          markedUserId={markedUserId}
          markedProblemId={markedProblemId}
        />
      </Suspense>
      {imageSrc !== null && (
        <div className="award-overlay">
          <img src={imageSrc} alt="" />
        </div>
      )}
    </AnimationSpeedProvider>
  );
}
