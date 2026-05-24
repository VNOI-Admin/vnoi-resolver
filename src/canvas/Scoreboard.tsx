import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Application, extend } from '@pixi/react';
import { Container, Graphics, Text } from 'pixi.js';
import type {
  Container as PixiContainer,
  Graphics as PixiGraphics
} from 'pixi.js';
import type { InputProblem, UserRow } from '../lib/resolver';
import { HEADER_HEIGHT, ROW_HEIGHT, computeLayout } from './layout';
import { Header } from './Header';
import { Row } from './Row';
import { COLORS } from './theme';
import { AnimationRoot, useAnimationJob } from './animation';

// Register Pixi classes for JSX use (<pixiContainer>, <pixiGraphics>, <pixiText>).
extend({ Container, Graphics, Text });

const CAMERA_TWEEN_MS = 1500;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Virtualization: render rows whose targetIndex falls inside the camera's
// visible window, padded by OVERSCAN rows above/below to absorb in-flight row
// tweens (a row sliding into view from outside should already be mounted).
const OVERSCAN = 20;

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  useEffect(() => {
    const onResize = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function Scoreboard({
  data,
  problems,
  currentRowIndex,
  markedUserId,
  markedProblemId
}: {
  data: UserRow[];
  problems: InputProblem[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
}) {
  const viewport = useViewportSize();
  const layout = useMemo(
    () => computeLayout(viewport.width, problems.length),
    [viewport.width, problems.length]
  );

  const bodyHeight = Math.max(0, viewport.height - HEADER_HEIGHT);
  const contentHeight = data.length * ROW_HEIGHT;

  // Target camera Y: align cursor's row bottom to viewport bottom.
  const cameraTargetY = useMemo(() => {
    if (currentRowIndex < 0) return 0;
    const bottom = (currentRowIndex + 1) * ROW_HEIGHT;
    const max = Math.max(0, contentHeight - bodyHeight);
    return Math.min(Math.max(0, bottom - bodyHeight), max);
  }, [currentRowIndex, contentHeight, bodyHeight]);

  return (
    <Application
      width={viewport.width}
      height={viewport.height}
      resizeTo={window}
      backgroundColor={COLORS.bg}
      antialias
      resolution={window.devicePixelRatio || 1}
      autoDensity
    >
      <AnimationRoot>
        <Body
          cameraTargetY={cameraTargetY}
          bodyHeight={bodyHeight}
          layout={layout}
          data={data}
          problems={problems}
          markedUserId={markedUserId}
          markedProblemId={markedProblemId}
        />
        <Header problems={problems} layout={layout} />
      </AnimationRoot>
    </Application>
  );
}

function Body({
  cameraTargetY,
  bodyHeight,
  layout,
  data,
  problems,
  markedUserId,
  markedProblemId
}: {
  cameraTargetY: number;
  bodyHeight: number;
  layout: ReturnType<typeof computeLayout>;
  data: UserRow[];
  problems: InputProblem[];
  markedUserId: number;
  markedProblemId: number;
}) {
  const containerRef = useRef<PixiContainer>(null);
  const tween = useRef<{
    fromY: number;
    toY: number;
    start: number;
    initialized: boolean;
  }>({
    fromY: cameraTargetY,
    toY: cameraTargetY,
    start: 0,
    initialized: false
  });
  const cameraY = useRef(cameraTargetY);

  // Track the latest scroll max so the tick can clamp cameraY against it.
  // (When the viewport shrinks mid-tween, the old target may now be past the
  // content end.)
  const maxCameraY = Math.max(0, data.length * ROW_HEIGHT - bodyHeight);
  const maxCameraYRef = useRef(maxCameraY);
  maxCameraYRef.current = maxCameraY;

  const lastSetY = useRef<number | null>(null);

  const job = useAnimationJob(() => {
    const el = containerRef.current;
    if (!el) return;
    const { fromY, toY, start } = tween.current;
    let needsPaint = false;
    if (fromY !== toY) {
      const t = Math.min(1, (performance.now() - start) / CAMERA_TWEEN_MS);
      cameraY.current = fromY + (toY - fromY) * easeOutCubic(t);
      if (t >= 1) tween.current.fromY = toY;
      needsPaint = true;
    }
    // Clamp against the current scroll max — guards an in-flight tween whose
    // target is no longer reachable after a window resize.
    if (cameraY.current > maxCameraYRef.current) {
      cameraY.current = maxCameraYRef.current;
      needsPaint = true;
    } else if (cameraY.current < 0) {
      cameraY.current = 0;
      needsPaint = true;
    }
    const newY = HEADER_HEIGHT - cameraY.current;
    if (lastSetY.current !== newY) {
      el.y = newY;
      lastSetY.current = newY;
      needsPaint = true;
    }
    if (!needsPaint && tween.current.fromY === tween.current.toY) {
      job.stop();
    }
  });

  // Synchronous init/start. First mount: snap camera and paint. Subsequent
  // cameraTargetY changes: kick off a tween. Either way, ensure the job is
  // running so the next frame paints.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!tween.current.initialized) {
      cameraY.current = cameraTargetY;
      el.y = HEADER_HEIGHT - cameraTargetY;
      lastSetY.current = HEADER_HEIGHT - cameraTargetY;
      tween.current = {
        fromY: cameraTargetY,
        toY: cameraTargetY,
        start: 0,
        initialized: true
      };
      // Idle until the next change — nothing to animate yet.
      return;
    }
    if (tween.current.toY === cameraTargetY) return;
    tween.current = {
      fromY: cameraY.current,
      toY: cameraTargetY,
      start: performance.now(),
      initialized: true
    };
    job.start();
  }, [cameraTargetY, job]);

  // Re-check on resize (bodyHeight changes): may need a one-shot clamp pass.
  useLayoutEffect(() => {
    if (cameraY.current > maxCameraY || cameraY.current < 0) job.start();
  }, [maxCameraY, job]);

  // Mask the body so panned rows don't render above the header or below the
  // viewport. Attached imperatively in useLayoutEffect — going through React
  // state would cause one paint where the body renders unmasked.
  const drawMask = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, HEADER_HEIGHT, layout.totalWidth, bodyHeight).fill(0xffffff);
    },
    [layout.totalWidth, bodyHeight]
  );

  const maskRef = useRef<PixiGraphics>(null);
  // Re-assert the mask link whenever the mask geometry could have changed —
  // the deps mirror those of `drawMask`. Cheap: just two property assignments
  // per resize. Worth the defensiveness because if the Graphics ref ever gets
  // re-instantiated (StrictMode, future conditional render), a once-only
  // attach silently leaves the body unmasked.
  useLayoutEffect(() => {
    if (containerRef.current) {
      // Enable per-frame z-sort so tweening rows can lift above static ones
      // via zIndex. The marked-row-last render order is a separate belt-and-
      // suspenders mechanism so the marked row stays on top even if the sort
      // bookkeeping ever desyncs.
      containerRef.current.sortableChildren = true;
      if (maskRef.current) containerRef.current.mask = maskRef.current;
    }
  }, [layout.totalWidth, bodyHeight]);

  // Render the marked row LAST so Pixi draws it last → always on top of any
  // passersby. We don't rely on sortableChildren + zIndex because under rapid
  // forward/backward cycles the sortDirty bookkeeping can desync and a moving
  // row ends up rendered behind the marked one.
  const markedRowIndex =
    markedUserId === -1 ? -1 : data.findIndex((r) => r.userId === markedUserId);
  const markedRow = markedRowIndex >= 0 ? data[markedRowIndex] : undefined;

  // Track the previous cameraTargetY so a big-jump dispatch (e.g. cursor
  // moves rank 600 → 100) still mounts the rows along the entire camera path.
  // Without this, the 1.5s camera tween would fly over an unmounted range and
  // briefly show a blank stripe where rows should be. Updated post-commit so
  // the value we read on render is the target from the *previous* render.
  //
  // We also include `cameraY.current` — where the camera physically *is right
  // now*, which can differ from both prev and new targets if the user
  // dispatches mid-tween. Including it ensures the path-from-here-to-target is
  // always mounted.
  const prevCameraTargetY = useRef(cameraTargetY);
  useEffect(() => {
    prevCameraTargetY.current = cameraTargetY;
  }, [cameraTargetY]);

  const minTargetY = Math.min(
    prevCameraTargetY.current,
    cameraTargetY,
    cameraY.current
  );
  const maxTargetY =
    Math.max(prevCameraTargetY.current, cameraTargetY, cameraY.current) +
    bodyHeight;
  const firstVisibleIndex = Math.max(
    0,
    Math.floor(minTargetY / ROW_HEIGHT) - OVERSCAN
  );
  const lastVisibleIndex = Math.min(
    data.length - 1,
    Math.ceil(maxTargetY / ROW_HEIGHT) + OVERSCAN
  );
  const visibleData =
    data.length === 0
      ? data
      : data.slice(firstVisibleIndex, lastVisibleIndex + 1);

  return (
    <pixiContainer>
      <pixiGraphics ref={maskRef} draw={drawMask} />
      <pixiContainer ref={containerRef}>
        {visibleData.map((row, localIdx) => {
          if (row.userId === markedUserId) return null;
          // Slice-relative index → absolute targetIndex (= position in `data`).
          const targetIndex = firstVisibleIndex + localIdx;
          return (
            <Row
              key={row.userId}
              row={row}
              problems={problems}
              layout={layout}
              targetIndex={targetIndex}
              isCurrent={false}
              markedProblemId={-1}
            />
          );
        })}
        {markedRow && (
          <Row
            key={markedRow.userId}
            row={markedRow}
            problems={problems}
            layout={layout}
            targetIndex={markedRowIndex}
            isCurrent={true}
            markedProblemId={markedProblemId}
          />
        )}
      </pixiContainer>
    </pixiContainer>
  );
}
