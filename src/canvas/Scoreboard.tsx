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
import {
  HEADER_HEIGHT,
  CARD_HEIGHT,
  boardContentWidth,
  computeLayout
} from './layout';
import { ZERO_INSETS, type SafeInsets } from '../util/safeArea';
import { Header } from './Header';
import { Row } from './Row';
import { useTheme } from './theme';
import { AnimationRoot, useAnimationJob } from './animation';
import { easeOutCubic } from './easing';
import { useAnimationSpeed } from './animationSpeed';
import {
  cameraTargetY as cameraTargetYFor,
  framingIndex,
  rowRenderList,
  visibleRowRange
} from './cameraGeometry';
import {
  isTweenDone,
  isTweening,
  retarget,
  tweenValue,
  type Tween
} from './tween';

// Register Pixi classes for JSX use (<pixiContainer>, <pixiGraphics>, <pixiText>).
extend({ Container, Graphics, Text });

// Tween base, divided by speed at consumption. 800 keeps the camera pan
// inside the 1000/speed autoplay interval at every speed.
const CAMERA_TWEEN_MS_BASE = 800;

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

// The backgroundColor prop on <Application> is init-only: @pixi/react passes
// applicationProps to app.init() exactly once, and later renders assign an
// inert own property (Pixi's Application has no backgroundColor accessor —
// the clear color lives on the renderer's BackgroundSystem). Theme cycles
// therefore have to push the color imperatively. app.renderer doesn't exist
// until async init completes and the context gives no reactive signal for
// that (verified live: an isInitialised-gated effect never fired), so this
// retries on rAF until the renderer is there — a handful of frames at most.
function BackgroundSync({ color }: { color: number }) {
  const { app } = useApplication();
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      if (app.renderer) {
        app.renderer.background.color = color;
        return;
      }
      raf = requestAnimationFrame(apply);
    };
    apply();
    return () => cancelAnimationFrame(raf);
  }, [app, color]);
  return null;
}

export function Scoreboard({
  data,
  problems,
  currentRowIndex,
  markedUserId,
  markedProblemId,
  safeInsets = ZERO_INSETS
}: {
  data: UserRow[];
  problems: InputProblem[];
  currentRowIndex: number;
  markedUserId: number;
  markedProblemId: number;
  safeInsets?: SafeInsets;
}) {
  const theme = useTheme();
  const viewport = useViewportSize();

  // Safe-area bands: physical obstructions (curtain valance, side drapes)
  // cover edges of the hall wall, so the board renders inside the inset box
  // and the bands outside it are just canvas background.
  const contentHeight = Math.max(
    0,
    viewport.height - safeInsets.top - safeInsets.bottom
  );
  const availWidth = Math.max(
    0,
    viewport.width - safeInsets.left - safeInsets.right
  );
  const boardWidth = boardContentWidth(availWidth, contentHeight);
  const layout = useMemo(
    () => computeLayout(boardWidth, problems.length),
    [boardWidth, problems.length]
  );
  // Center the pillarboxed board inside the safe box; a many-problem
  // overflow (totalWidth wider than the box) stays left-aligned like before.
  const offsetX =
    safeInsets.left +
    Math.max(0, Math.floor((availWidth - layout.totalWidth) / 2));

  const bodyHeight = Math.max(0, contentHeight - HEADER_HEIGHT);

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
      <BackgroundSync color={theme.colors.bg} />
      <AnimationRoot>
        <pixiContainer x={offsetX} y={safeInsets.top}>
          <Body
            currentRowIndex={currentRowIndex}
            bodyHeight={bodyHeight}
            layout={layout}
            data={data}
            problems={problems}
            markedUserId={markedUserId}
            markedProblemId={markedProblemId}
          />
          <Header problems={problems} layout={layout} />
        </pixiContainer>
      </AnimationRoot>
    </Application>
  );
}

function Body({
  currentRowIndex,
  bodyHeight,
  layout,
  data,
  problems,
  markedUserId,
  markedProblemId
}: {
  currentRowIndex: number;
  bodyHeight: number;
  layout: ReturnType<typeof computeLayout>;
  data: UserRow[];
  problems: InputProblem[];
  markedUserId: number;
  markedProblemId: number;
}) {
  const speed = useAnimationSpeed();
  const CAMERA_TWEEN_MS = CAMERA_TWEEN_MS_BASE / speed;

  const markedRowIndex =
    markedUserId === -1 ? -1 : data.findIndex((r) => r.userId === markedUserId);
  const markedRow = markedRowIndex >= 0 ? data[markedRowIndex] : undefined;

  // Camera framing + clamping live in cameraGeometry (pure + tested).
  // framingIndex deliberately frames the cursor, not the marked row — see the
  // camera-monotonicity invariant test for why (no yo-yo on upward moves).
  const framedIndex = framingIndex(currentRowIndex, markedRowIndex);
  const contentHeight = data.length * CARD_HEIGHT;
  const cameraTargetY = useMemo(
    () => cameraTargetYFor(framedIndex, contentHeight, bodyHeight),
    [framedIndex, contentHeight, bodyHeight]
  );

  const containerRef = useRef<PixiContainer | null>(null);
  const tween = useRef<Tween & { initialized: boolean }>({
    from: cameraTargetY,
    to: cameraTargetY,
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
  const maskRef = useRef<PixiGraphics | null>(null);

  // Wire the body container to its clip mask. Idempotent and called from BOTH
  // attach callbacks, so the mask is linked regardless of which Pixi node
  // (re-)instantiates or in what order. The previous design linked only via a
  // geometry-keyed effect, so a container re-mount with unchanged geometry
  // lost its mask and let body rows render over the header.
  const linkMaskAndContainer = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    // sortableChildren lets tweening rows lift above static ones via zIndex.
    container.sortableChildren = true;
    if (maskRef.current) container.mask = maskRef.current;
  }, []);

  // Callback ref. A re-instantiated container starts at y=0; lastSetY would
  // still hold the previous written value and skip the next write, freezing
  // the camera at 0. Reset on attach, then (re)link the mask.
  const attachContainer = useCallback(
    (c: PixiContainer | null) => {
      containerRef.current = c;
      lastSetY.current = null;
      linkMaskAndContainer();
    },
    [linkMaskAndContainer]
  );

  const job = useAnimationJob(() => {
    const el = containerRef.current;
    if (!el) return;
    const now = performance.now();
    let needsPaint = false;
    if (isTweening(tween.current)) {
      cameraY.current = tweenValue(
        tween.current,
        now,
        CAMERA_TWEEN_MS,
        easeOutCubic
      );
      if (isTweenDone(tween.current, now, CAMERA_TWEEN_MS)) {
        tween.current.from = tween.current.to;
      }
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
    if (!needsPaint && !isTweening(tween.current)) {
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
        from: cameraTargetY,
        to: cameraTargetY,
        start: 0,
        initialized: true
      };
      return;
    }
    const targetUnchanged = tween.current.to === cameraTargetY;
    if (targetUnchanged && !isTweening(tween.current)) return;
    // Snapshot the CLAMPED on-screen value (cameraY.current), not the raw tween
    // value — the per-frame clamp can hold it inside content bounds, and
    // retargeting from the unclamped value would jump.
    tween.current = {
      ...retarget(cameraY.current, cameraTargetY, performance.now()),
      initialized: true
    };
    job.start();
  }, [cameraTargetY, job, CAMERA_TWEEN_MS]);

  // Resize-driven clamp pass. Also clamps tween.current.to so the self-stop
  // check trips immediately instead of spinning 60Hz no-ops for up to
  // CAMERA_TWEEN_MS while from/to drift apart.
  useLayoutEffect(() => {
    if (tween.current.to > maxCameraY) tween.current.to = maxCameraY;
    else if (tween.current.to < 0) tween.current.to = 0;
    if (tween.current.from > maxCameraY) tween.current.from = maxCameraY;
    else if (tween.current.from < 0) tween.current.from = 0;
    if (cameraY.current > maxCameraY || cameraY.current < 0) job.start();
  }, [maxCameraY, job]);

  const drawMask = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, HEADER_HEIGHT, layout.totalWidth, bodyHeight).fill(0xffffff);
    },
    [layout.totalWidth, bodyHeight]
  );

  // Callback ref so a re-instantiated mask Graphics is always re-linked,
  // independent of the container's mount order (see linkMaskAndContainer).
  const attachMask = useCallback(
    (g: PixiGraphics | null) => {
      maskRef.current = g;
      linkMaskAndContainer();
    },
    [linkMaskAndContainer]
  );

  // The marked row is rendered LAST (computed above). sortableChildren +
  // zIndex isn't reliable enough under rapid forward/backward cycles — the
  // sortDirty bookkeeping can desync and the marked row ends up behind a
  // passerby.

  // Track the previous camera target so visibleRowRange can mount the whole
  // camera path (prev → new target → live cameraY), not just the destination —
  // a big-jump pan would otherwise fly over an unmounted range.
  const prevCameraTargetY = useRef(cameraTargetY);
  useEffect(() => {
    prevCameraTargetY.current = cameraTargetY;
  }, [cameraTargetY]);

  const { first: firstVisibleIndex, last: lastVisibleIndex } = visibleRowRange({
    prevTargetY: prevCameraTargetY.current,
    targetY: cameraTargetY,
    cameraY: cameraY.current,
    bodyHeight,
    dataLength: data.length
  });
  const visibleData =
    data.length === 0
      ? data
      : data.slice(firstVisibleIndex, lastVisibleIndex + 1);
  const renderList = rowRenderList({
    visibleData,
    firstVisibleIndex,
    markedUserId,
    markedRow,
    markedRowIndex
  });

  return (
    <pixiContainer>
      <pixiGraphics ref={attachMask} draw={drawMask} />
      <pixiContainer ref={attachContainer}>
        {renderList.map((entry) => (
          <Row
            key={entry.row.userId}
            row={entry.row}
            problems={problems}
            layout={layout}
            targetIndex={entry.targetIndex}
            isCurrent={entry.isMarked}
            markedProblemId={entry.isMarked ? markedProblemId : -1}
          />
        ))}
      </pixiContainer>
    </pixiContainer>
  );
}
