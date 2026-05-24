import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import confetti from 'canvas-confetti';

import { useKeyPress } from './hooks';
import { InputData, AwardImageMap, useResolver } from './resolver';
import { FpsHud } from './FpsHud';

// Code-split: Pixi + @pixi/react is ~500 KB. Loading screen renders without
// it; we only pay the chunk download when the user clicks Run. The
// `.then(m => ({ default: m.Scoreboard }))` shim adapts the named export to
// the default-export shape `lazy()` requires.
const Scoreboard = lazy(() =>
  import('./canvas/Scoreboard').then((m) => ({ default: m.Scoreboard }))
);

const CONFETTI_COLORS = ['#22d3ee', '#4ade80', '#fbbf24', '#f97316', '#a855f7'];

function fireAwardConfetti() {
  const common = {
    particleCount: 140,
    spread: 65,
    startVelocity: 55,
    scalar: 1.1,
    ticks: 240,
    colors: CONFETTI_COLORS
  };
  confetti({ ...common, angle: 60, origin: { x: 0, y: 0.85 } });
  confetti({ ...common, angle: 120, origin: { x: 1, y: 0.85 } });
}

export function Ranking({
  inputData,
  imageData,
  frozenTime,
  unofficialContestants,
  hideUnofficialContestants
}: {
  inputData: InputData;
  imageData: AwardImageMap;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
}) {
  const _inputData = useMemo(
    () =>
      !hideUnofficialContestants
        ? inputData
        : {
            ...inputData,
            users: inputData.users.filter(
              (user) => !unofficialContestants.includes(user.username)
            )
          },
    [inputData, unofficialContestants, hideUnofficialContestants]
  );

  const {
    data,
    currentRowIndex,
    markedUserId,
    markedProblemId,
    imageSrc,
    step,
    rollback
  } = useResolver({
    inputData: _inputData,
    imageData,
    unofficialContestants,
    frozenTime: frozenTime * 60
  });

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // steps per second
  const [showControls, setShowControls] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFps, setShowFps] = useState(false);

  // Pause autoplay on any manual keypress so user can take over instantly.
  const pause = useCallback(() => setPlaying(false), []);
  const manualStep = useCallback(
    (choice?: number) => {
      pause();
      step(choice);
    },
    [pause, step]
  );
  const manualRollback = useCallback(() => {
    pause();
    rollback();
  }, [pause, rollback]);

  // All shortcuts except H are gated on `!showHelp` so they don't reach
  // through the modal. H stays active so it can also close the modal.
  const shortcutsEnabled = !showHelp;
  useKeyPress('ArrowLeft', manualRollback, shortcutsEnabled);
  useKeyPress('ArrowRight', manualStep, shortcutsEnabled);
  useKeyPress('1', () => manualStep(0), shortcutsEnabled);
  useKeyPress('2', () => manualStep(1), shortcutsEnabled);
  useKeyPress('3', () => manualStep(2), shortcutsEnabled);
  useKeyPress('4', () => manualStep(3), shortcutsEnabled);
  useKeyPress('5', () => manualStep(4), shortcutsEnabled);
  useKeyPress('6', () => manualStep(5), shortcutsEnabled);
  useKeyPress('7', () => manualStep(6), shortcutsEnabled);
  useKeyPress('8', () => manualStep(7), shortcutsEnabled);
  useKeyPress('9', () => manualStep(8), shortcutsEnabled);
  useKeyPress(' ', () => setPlaying((p) => !p), shortcutsEnabled);
  useKeyPress('c', () => setShowControls((s) => !s), shortcutsEnabled);
  // H toggles regardless of `shortcutsEnabled` so it can also close the modal.
  useKeyPress('h', () => setShowHelp((s) => !s));
  useKeyPress('f', () => setShowFps((s) => !s), shortcutsEnabled);

  // Auto-pause when the reveal finishes.
  useEffect(() => {
    if (currentRowIndex < 0 && playing) setPlaying(false);
  }, [currentRowIndex, playing]);

  // Confetti every time imageSrc transitions to a new non-null value — fires on
  // forward reveal AND when rolling back into an award. Tracked via prev ref
  // (not transition source) so StrictMode's double-effect doesn't double-fire.
  const prevImageSrc = useRef(imageSrc);
  useEffect(() => {
    if (imageSrc !== null && imageSrc !== prevImageSrc.current) {
      fireAwardConfetti();
    }
    prevImageSrc.current = imageSrc;
  }, [imageSrc]);

  // Keep a live ref to step so the autoplay interval below doesn't tear down
  // and rebuild every time a dispatch updates `step`'s identity (it depends on
  // `data`, which changes on every event). Without this, at high speeds the
  // interval can effectively halve as it's cleared just before firing.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Autoplay loop. Suspended while help overlay is open.
  useEffect(() => {
    if (!playing || showHelp) return;
    const id = setInterval(() => stepRef.current(), 1000 / speed);
    return () => clearInterval(id);
  }, [playing, showHelp, speed]);

  return (
    <>
      <Suspense fallback={<div className="canvas-fallback">Loading…</div>}>
        <Scoreboard
          data={data}
          problems={inputData.problems}
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
      {showFps && <FpsHud />}
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h2>Keyboard shortcuts</h2>
            <dl>
              <dt>
                <kbd>→</kbd>
              </dt>
              <dd>Step forward</dd>
              <dt>
                <kbd>←</kbd>
              </dt>
              <dd>Step back</dd>
              <dt>
                <kbd>1</kbd>–<kbd>9</kbd>
              </dt>
              <dd>Reveal the N-th pending submission for the current user</dd>
              <dt>
                <kbd>Space</kbd>
              </dt>
              <dd>Play / pause autoplay</dd>
              <dt>
                <kbd>C</kbd>
              </dt>
              <dd>Toggle autoplay controls</dd>
              <dt>
                <kbd>F</kbd>
              </dt>
              <dd>Toggle FPS counter</dd>
              <dt>
                <kbd>T</kbd>
              </dt>
              <dd>Cycle color theme</dd>
              <dt>
                <kbd>H</kbd>
              </dt>
              <dd>Toggle this help</dd>
            </dl>
            <p className="hint">Click anywhere or press H to close.</p>
          </div>
        </div>
      )}
      {showControls && (
        <div className="controls">
          <button
            type="button"
            className="play-btn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <label className="speed">
            <span>{speed.toFixed(1)}×</span>
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
            />
          </label>
        </div>
      )}
    </>
  );
}
