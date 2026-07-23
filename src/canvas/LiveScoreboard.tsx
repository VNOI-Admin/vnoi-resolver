import { Suspense, lazy, useEffect } from 'react';

import type { InputProblem, UserRow } from '../lib/resolver';
import { AnimationSpeedProvider } from './animationSpeed';
import { useFontsLoaded } from './fonts';
import type { AwardFit, SafeInsets } from '../util/safeArea';

// Pixi + @pixi/react is ~500 KB. Code-split so the splash form / operator
// console don't pay the cost; only loaded when a live scoreboard mounts.
// The import is memoised so the mount effect below can kick the fetch
// eagerly — the font gate would otherwise serialize chunk-after-fonts.
let scoreboardImport: Promise<typeof import('./Scoreboard')> | null = null;
const loadScoreboard = () => (scoreboardImport ??= import('./Scoreboard'));
const Scoreboard = lazy(() =>
  loadScoreboard().then((m) => ({ default: m.Scoreboard }))
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
  speed,
  safeInsets,
  awardFit
}: {
  data: UserRow[];
  problems: InputProblem[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  imageSrc: string | null;
  speed: number;
  safeInsets: SafeInsets;
  awardFit: AwardFit;
}) {
  // Hold the canvas until the bundled faces are ready (see fonts.ts). The
  // Pixi chunk fetch is kicked in parallel — the font gate keeps Scoreboard
  // unrendered, which would otherwise delay the lazy import() too.
  const fontsLoaded = useFontsLoaded();
  useEffect(() => {
    void loadScoreboard();
  }, []);
  return (
    <AnimationSpeedProvider speed={speed}>
      <Suspense fallback={<div className="canvas-fallback">Loading…</div>}>
        {fontsLoaded ? (
          <Scoreboard
            data={data}
            problems={problems}
            currentRowIndex={currentRowIndex}
            markedUserId={markedUserId}
            markedProblemId={markedProblemId}
            safeInsets={safeInsets}
          />
        ) : (
          <div className="canvas-fallback">Loading…</div>
        )}
      </Suspense>
      {imageSrc !== null && (
        // The safe-area bands (curtain-covered wall strips) apply to the
        // award art too — the winner's face must not sit behind the valance.
        <div
          className="award-overlay"
          style={{
            padding: `${safeInsets.top}px ${safeInsets.right}px ${safeInsets.bottom}px ${safeInsets.left}px`
          }}
        >
          <img src={imageSrc} alt="" style={{ objectFit: awardFit }} />
        </div>
      )}
    </AnimationSpeedProvider>
  );
}
