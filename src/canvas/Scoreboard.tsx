import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Application, extend, useApplication } from '@pixi/react';
import { Container, Graphics, Text } from 'pixi.js';
import type {
  Container as PixiContainer,
  Graphics as PixiGraphics
} from 'pixi.js';
import type { InputProblem, UserRow } from '../lib/resolver';
import { HEADER_HEIGHT, CARD_HEIGHT, computeLayout } from './layout';
import { Header } from './Header';
import { Row } from './Row';
import { useTheme } from './theme';
import { AnimationRoot, useAnimationJob } from './animation';
import { easeOutCubic } from './easing';
import { useAnimationSpeed } from './animationSpeed';

// Register Pixi classes for JSX use (<pixiContainer>, <pixiGraphics>, <pixiText>).
extend({ Container, Graphics, Text });

// Tween base, divided by speed at consumption. 800 keeps the camera pan
// inside the 1000/speed autoplay interval at every speed.
const CAMERA_TWEEN_MS_BASE = 800;

// Padding above/below the visible window to keep in-flight row tweens
// mounted when they slide in from outside the viewport.
const OVERSCAN = 20;

// How many rows the camera leaves visible below the current cursor. Putting
// the cursor at the very bottom worked but the audience couldn't see the
// next contenders, and a row glued to the bottom edge is harder to read
// than one a couple of rows up. Lookahead also implicitly centres the
// cursor a bit more — when the camera maxes out near the end of the
// reveal, the clamp keeps the cursor in frame at the top of the band.
const CURSOR_LOOKAHEAD_ROWS = 2;

// @pixi/react sets backgroundColor on mount but doesn't always flow prop
// changes through. Push the value imperatively on theme change.
function ThemeBgSync({ bg }: { bg: number }) {
  const { app } = useApplication();
  useEffect(() => {
    if (!app) return;
    app.renderer.background.color = bg;
  }, [app, bg]);
  return null;
}

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));
  useEffect(() => {
    // rAF-coalesce per-pixel resize events. Without this a slow drag fires
    // onResize hundreds of times per second, each one churning callback
    // identity and triggering Pixi repaints across every mounted Row + Pill.
    let rafId = 0;
    const onResize = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        setSize({ width: window.innerWidth, height: window.innerHeight });
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
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
  const theme = useTheme();
  const viewport = useViewportSize();
  const layout = useMemo(
    () => computeLayout(viewport.width, problems.length),
    [viewport.width, problems.length]
  );

  const bodyHeight = Math.max(0, viewport.height - HEADER_HEIGHT);
  const contentHeight = data.length * CARD_HEIGHT;

  // Target camera Y: align (cursor row's bottom + CURSOR_LOOKAHEAD_ROWS) to
  // the viewport bottom. Clamp to [0, max] for the edges — near the top of
  // the scoreboard the cursor naturally sits below the header; near the
  // bottom the lookahead is implicitly cut by the max-scroll clamp.
  const cameraTargetY = useMemo(() => {
    if (currentRowIndex < 0) return 0;
    const bottom = (currentRowIndex + 1 + CURSOR_LOOKAHEAD_ROWS) * CARD_HEIGHT;
    const max = Math.max(0, contentHeight - bodyHeight);
    return Math.min(Math.max(0, bottom - bodyHeight), max);
  }, [currentRowIndex, contentHeight, bodyHeight]);

  return (
    <Application
      width={viewport.width}
      height={viewport.height}
      resizeTo={window}
      backgroundColor={theme.colors.bg}
      antialias
      resolution={window.devicePixelRatio || 1}
      autoDensity
    >
      <AnimationRoot>
        <ThemeBgSync bg={theme.colors.bg} />
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
  const speed = useAnimationSpeed();
  const CAMERA_TWEEN_MS = CAMERA_TWEEN_MS_BASE / speed;
  const containerRef = useRef<PixiContainer | null>(null);
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

  // Ref'd so the tick can clamp against a mid-tween viewport shrink whose
  // old target is now past the content end.
  const maxCameraY = Math.max(0, data.length * CARD_HEIGHT - bodyHeight);
  const maxCameraYRef = useRef(maxCameraY);
  maxCameraYRef.current = maxCameraY;

  const lastSetY = useRef<number | null>(null);

  // Callback ref. If @pixi/react re-instantiates the inner container
  // (StrictMode, theme bridge, future conditional render), the new
  // Container starts at y=0 — but lastSetY would still hold the previous
  // written value and skip the next write, silently freezing the camera
  // at 0. Resetting lastSetY on attach closes that footgun.
  const attachContainer = useCallback((c: PixiContainer | null) => {
    containerRef.current = c;
    lastSetY.current = null;
  }, []);

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

  // First mount snaps to target; subsequent changes start a tween. Also
  // re-snapshots when CAMERA_TWEEN_MS changes (speed slider during a pan)
  // so t = elapsed/TWEEN_MS doesn't jump past 1 and snap.
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
      return;
    }
    const targetUnchanged = tween.current.toY === cameraTargetY;
    const inFlight = tween.current.fromY !== tween.current.toY;
    if (targetUnchanged && !inFlight) return;
    tween.current = {
      fromY: cameraY.current,
      toY: cameraTargetY,
      start: performance.now(),
      initialized: true
    };
    job.start();
  }, [cameraTargetY, job, CAMERA_TWEEN_MS]);

  // Resize-driven clamp pass. Also clamps tween.current.toY so the
  // self-stop check trips immediately instead of spinning 60Hz no-ops for
  // up to CAMERA_TWEEN_MS while fromY/toY drift apart.
  useLayoutEffect(() => {
    if (tween.current.toY > maxCameraY) tween.current.toY = maxCameraY;
    else if (tween.current.toY < 0) tween.current.toY = 0;
    if (tween.current.fromY > maxCameraY) tween.current.fromY = maxCameraY;
    else if (tween.current.fromY < 0) tween.current.fromY = 0;
    if (cameraY.current > maxCameraY || cameraY.current < 0) job.start();
  }, [maxCameraY, job]);

  const drawMask = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, HEADER_HEIGHT, layout.totalWidth, bodyHeight).fill(0xffffff);
    },
    [layout.totalWidth, bodyHeight]
  );

  // Callback ref so a re-instantiated Graphics is always linked (StrictMode
  // double-mount, future conditional render). The earlier dep-list approach
  // failed when the Graphics re-mounted without a geometry change.
  const maskRef = useRef<PixiGraphics | null>(null);
  const attachMask = useCallback((g: PixiGraphics | null) => {
    maskRef.current = g;
    const container = containerRef.current;
    if (container && g) {
      // sortableChildren lets tweening rows lift above static ones via zIndex.
      // Marked-row-render-last (below) is a belt-and-suspenders cover for
      // the case where the sort bookkeeping desyncs under rapid cycles.
      container.sortableChildren = true;
      container.mask = g;
    }
  }, []);
  // Container can re-mount independently of the mask (StrictMode, theme
  // bridge); re-assert sortableChildren + mask defensively.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const mask = maskRef.current;
    if (container) {
      container.sortableChildren = true;
      if (mask) container.mask = mask;
    }
  }, [layout.totalWidth, bodyHeight]);

  // Render marked row LAST. sortableChildren + zIndex isn't reliable enough
  // under rapid forward/backward cycles — the sortDirty bookkeeping can
  // desync and the marked row ends up behind a passerby.
  const markedRowIndex =
    markedUserId === -1 ? -1 : data.findIndex((r) => r.userId === markedUserId);
  const markedRow = markedRowIndex >= 0 ? data[markedRowIndex] : undefined;

  // Mount rows along the entire camera path (prev target → current camera Y
  // → new target + bodyHeight). A big-jump dispatch (rank 600 → 100) would
  // otherwise fly over an unmounted range and briefly show a blank stripe.
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
    Math.floor(minTargetY / CARD_HEIGHT) - OVERSCAN
  );
  const lastVisibleIndex = Math.min(
    data.length - 1,
    Math.ceil(maxTargetY / CARD_HEIGHT) + OVERSCAN
  );
  const visibleData =
    data.length === 0
      ? data
      : data.slice(firstVisibleIndex, lastVisibleIndex + 1);

  return (
    <pixiContainer>
      <pixiGraphics ref={attachMask} draw={drawMask} />
      <pixiContainer ref={attachContainer}>
        {visibleData.map((row, localIdx) => {
          if (row.userId === markedUserId) return null;
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
