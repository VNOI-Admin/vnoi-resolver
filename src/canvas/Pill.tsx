import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type {
  Container as PixiContainer,
  Graphics as PixiGraphics
} from 'pixi.js';
import { ProblemAttemptStatus } from '../lib/resolver';
import { COLORS, TEXT, pillColorForClass } from './theme';
import {
  PILL_HEIGHT,
  PILL_MARGIN_X,
  PROBLEM_WIDTH,
  ROW_HEIGHT
} from './layout';
import { useAnimationJob } from './animation';

const COLOR_TWEEN_MS = 500;

const LABEL_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.pillSize,
  fontWeight: 'bold' as const,
  fill: 0xffffff
};

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) << 8) |
    Math.round(ab + (bb - ab) * t)
  );
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function PillInner({
  x,
  points,
  status,
  scoreClass,
  highlighted
}: {
  x: number;
  points: number;
  status: ProblemAttemptStatus;
  scoreClass: string;
  highlighted: boolean;
}) {
  const isPending = !!(status & ProblemAttemptStatus.PENDING);
  const isUnattempted = status === ProblemAttemptStatus.UNATTEMPTED;
  const targetColor = pillColorForClass(scoreClass, isPending);
  const pillX = x + PILL_MARGIN_X;
  const pillY = (ROW_HEIGHT - PILL_HEIGHT) / 2;
  const pillW = PROBLEM_WIDTH - PILL_MARGIN_X * 2;

  // --- Color tween ------------------------------------------------------
  const colorTween = useRef<{
    fromColor: number;
    toColor: number;
    start: number;
    initialized: boolean;
  }>({
    fromColor: targetColor,
    toColor: targetColor,
    start: 0,
    initialized: false
  });

  // --- Halo for the marked problem --------------------------------------
  const haloRef = useRef<PixiContainer>(null);
  const phaseStart = useRef<number | null>(null);
  const pillGfxRef = useRef<PixiGraphics>(null);

  const repaintPill = useCallback(
    (g: PixiGraphics, color: number) => {
      g.clear();
      if (isUnattempted) return;
      g.roundRect(pillX, pillY, pillW, PILL_HEIGHT, 11).fill({ color });
    },
    [isUnattempted, pillX, pillY, pillW]
  );

  const job = useAnimationJob(() => {
    // Halo pulse.
    const halo = haloRef.current;
    if (halo && highlighted) {
      if (phaseStart.current === null) phaseStart.current = performance.now();
      const t =
        ((performance.now() - phaseStart.current) / 1000) * Math.PI * 1.6;
      halo.alpha = 0.1 + 0.35 * (1 - Math.cos(t));
    }

    // Color tween — repaint with interpolated color when in flight.
    const g = pillGfxRef.current;
    let colorActive = false;
    if (g) {
      const { fromColor, toColor, start } = colorTween.current;
      if (fromColor !== toColor) {
        const t = Math.min(1, (performance.now() - start) / COLOR_TWEEN_MS);
        const c = lerpColor(fromColor, toColor, easeOutCubic(t));
        repaintPill(g, c);
        if (t >= 1) colorTween.current.fromColor = toColor;
        else colorActive = true;
      }
    }

    // Self-stop when nothing is animating.
    if (!colorActive && !highlighted) {
      job.stop();
    }
  });

  useEffect(() => {
    if (!colorTween.current.initialized) {
      colorTween.current = {
        fromColor: targetColor,
        toColor: targetColor,
        start: 0,
        initialized: true
      };
      return;
    }
    if (colorTween.current.toColor === targetColor) return;
    const t = Math.min(
      1,
      (performance.now() - colorTween.current.start) / COLOR_TWEEN_MS
    );
    const currentVisual = lerpColor(
      colorTween.current.fromColor,
      colorTween.current.toColor,
      easeOutCubic(t)
    );
    colorTween.current = {
      fromColor: currentVisual,
      toColor: targetColor,
      start: performance.now(),
      initialized: true
    };
    job.start();
  }, [targetColor, job]);

  // Halo needs the job running while highlighted. Reset alpha synchronously
  // on the trailing edge so the job can self-stop without leaving the halo lit.
  useLayoutEffect(() => {
    if (highlighted) {
      job.start();
    } else if (haloRef.current) {
      haloRef.current.alpha = 0;
      phaseStart.current = null;
    }
  }, [highlighted, job]);

  const drawHalo = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.roundRect(pillX - 5, pillY - 6, pillW + 10, PILL_HEIGHT + 12, 16).fill({
        color: COLORS.accent
      });
    },
    [pillX, pillY, pillW]
  );

  // Static-state paint when not tweening — Pixi calls this when the draw prop
  // identity changes (i.e. on prop changes that affect the pill shape/color).
  const drawPill = useCallback(
    (g: PixiGraphics) => {
      const { fromColor, toColor } = colorTween.current;
      const color = fromColor === toColor ? targetColor : fromColor;
      repaintPill(g, color);
    },
    [repaintPill, targetColor]
  );

  const label = isPending
    ? `${points || ''}?`
    : isUnattempted
      ? ''
      : String(points);

  return (
    <pixiContainer>
      <pixiContainer ref={haloRef} alpha={0}>
        <pixiGraphics draw={drawHalo} />
      </pixiContainer>
      <pixiGraphics ref={pillGfxRef} draw={drawPill} />
      {label && (
        <pixiText
          text={label}
          x={pillX + pillW / 2}
          y={ROW_HEIGHT / 2}
          anchor={0.5}
          style={LABEL_STYLE}
        />
      )}
    </pixiContainer>
  );
}

// All Pill props are primitives, so the default shallow-compare correctly
// skips re-renders when neither the score nor the highlight state changed
// on this column.
export const Pill = memo(PillInner);
