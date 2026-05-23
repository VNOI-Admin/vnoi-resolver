import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { Application, extend, useTick } from '@pixi/react';
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

// Register Pixi classes for JSX use (<pixiContainer>, <pixiGraphics>, <pixiText>).
extend({ Container, Graphics, Text });

const CAMERA_TWEEN_MS = 1500;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

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

  // Map userId → target row index for stable identity across reorders.
  const targetIndexByUserId = useMemo(() => {
    const map = new Map<number, number>();
    data.forEach((row, idx) => map.set(row.userId, idx));
    return map;
  }, [data]);

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
      <Body
        cameraTargetY={cameraTargetY}
        bodyHeight={bodyHeight}
        layout={layout}
        data={data}
        problems={problems}
        targetIndexByUserId={targetIndexByUserId}
        markedUserId={markedUserId}
        markedProblemId={markedProblemId}
      />
      <Header problems={problems} layout={layout} />
    </Application>
  );
}

function Body({
  cameraTargetY,
  bodyHeight,
  layout,
  data,
  problems,
  targetIndexByUserId,
  markedUserId,
  markedProblemId
}: {
  cameraTargetY: number;
  bodyHeight: number;
  layout: ReturnType<typeof computeLayout>;
  data: UserRow[];
  problems: InputProblem[];
  targetIndexByUserId: Map<number, number>;
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

  // Synchronous so the very first paint sees the correct camera Y. Same path
  // handles subsequent target changes by kicking off a fresh tween.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!tween.current.initialized) {
      cameraY.current = cameraTargetY;
      el.y = HEADER_HEIGHT - cameraTargetY;
      tween.current = {
        fromY: cameraTargetY,
        toY: cameraTargetY,
        start: 0,
        initialized: true
      };
      return;
    }
    if (tween.current.toY === cameraTargetY) return;
    tween.current = {
      fromY: cameraY.current,
      toY: cameraTargetY,
      start: performance.now(),
      initialized: true
    };
  }, [cameraTargetY]);

  // Track the latest scroll max so the tick can clamp cameraY against it.
  // (When the viewport shrinks mid-tween, the old target may now be past the
  // content end.)
  const maxCameraY = Math.max(
    0,
    data.length * ROW_HEIGHT - Math.max(0, /* bodyHeight */ bodyHeight)
  );
  const maxCameraYRef = useRef(maxCameraY);
  maxCameraYRef.current = maxCameraY;

  useTick(() => {
    const el = containerRef.current;
    if (!el) return;
    const { fromY, toY, start } = tween.current;
    if (fromY !== toY) {
      const t = Math.min(1, (performance.now() - start) / CAMERA_TWEEN_MS);
      cameraY.current = fromY + (toY - fromY) * easeOutCubic(t);
      if (t >= 1) tween.current.fromY = toY;
    }
    // Clamp against the current scroll max — guards against an in-flight tween
    // whose target is no longer reachable after a window resize.
    if (cameraY.current > maxCameraYRef.current) {
      cameraY.current = maxCameraYRef.current;
    } else if (cameraY.current < 0) {
      cameraY.current = 0;
    }
    el.y = HEADER_HEIGHT - cameraY.current;
  });

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
  useLayoutEffect(() => {
    if (containerRef.current && maskRef.current) {
      containerRef.current.mask = maskRef.current;
    }
  }, []);

  return (
    <pixiContainer>
      <pixiGraphics ref={maskRef} draw={drawMask} />
      <pixiContainer ref={containerRef} sortableChildren>
        {data.map((row) => {
          const targetIndex = targetIndexByUserId.get(row.userId) ?? 0;
          const isCurrent = row.userId === markedUserId;
          return (
            <Row
              key={row.userId}
              row={row}
              problems={problems}
              layout={layout}
              targetIndex={targetIndex}
              isCurrent={isCurrent}
              markedProblemId={isCurrent ? markedProblemId : -1}
            />
          );
        })}
      </pixiContainer>
    </pixiContainer>
  );
}
