import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react';
import type {
  Container as PixiContainer,
  Graphics as PixiGraphics
} from 'pixi.js';
import { ProblemAttemptStatus } from '../lib/resolver';
import { TEXT, useTheme } from './theme';
import { PILL_HEIGHT, PILL_Y } from './layout';
import { pillLabel } from './pillLabel';
import { useAnimationJob } from './animation';
import { useAnimationSpeed } from './animationSpeed';
import { tweenColorNow } from './colorTween';

const COLOR_TWEEN_MS_BASE = 500;
// Rounded rect (not stadium) so adjacent pills read as a tight band instead
// of drifting capsules.
const PILL_RADIUS = 8;

const SCORE_LABEL_STYLE = {
  fontFamily: TEXT.family,
  fontSize: 18,
  fontWeight: 'bold' as const,
  fill: 0xffffff
};

function PillInner({
  x,
  w,
  points,
  status,
  scoreClass,
  highlighted,
  problemCode,
  attempts
}: {
  x: number;
  w: number;
  points: number;
  status: ProblemAttemptStatus;
  scoreClass: string;
  highlighted: boolean;
  problemCode: string;
  attempts: number;
}) {
  const theme = useTheme();
  const isPending = !!(status & ProblemAttemptStatus.PENDING);
  const isUnattempted = status === ProblemAttemptStatus.UNATTEMPTED;
  const targetColor = theme.pillColorForClass(scoreClass, isPending);
  const speed = useAnimationSpeed();
  const COLOR_TWEEN_MS = COLOR_TWEEN_MS_BASE / speed;

  const unattemptedLabelStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 18,
      fontWeight: '600' as const,
      fill: theme.colors.textMuted
    }),
    [theme]
  );

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

  const haloRef = useRef<PixiContainer>(null);
  const phaseStart = useRef<number | null>(null);
  const pillGfxRef = useRef<PixiGraphics>(null);

  const borderColor = theme.colors.border;
  const repaintPill = useCallback(
    (g: PixiGraphics, color: number) => {
      g.clear();
      if (isUnattempted) {
        // Subtle outlined ghost — the muted problem letter does the visual work.
        g.roundRect(x, PILL_Y, w, PILL_HEIGHT, PILL_RADIUS).stroke({
          width: 1,
          color: borderColor,
          alpha: 0.5
        });
        return;
      }
      g.roundRect(x, PILL_Y, w, PILL_HEIGHT, PILL_RADIUS).fill({ color });
    },
    [isUnattempted, x, w, borderColor]
  );

  const job = useAnimationJob(() => {
    const halo = haloRef.current;
    if (halo && highlighted) {
      if (phaseStart.current === null) phaseStart.current = performance.now();
      const t =
        ((performance.now() - phaseStart.current) / 1000) * Math.PI * 1.6;
      halo.alpha = 0.1 + 0.35 * (1 - Math.cos(t));
    }

    const g = pillGfxRef.current;
    let colorActive = false;
    if (g) {
      const { fromColor, toColor, start } = colorTween.current;
      if (fromColor !== toColor) {
        const now = performance.now();
        repaintPill(
          g,
          tweenColorNow(colorTween.current, targetColor, COLOR_TWEEN_MS, now)
        );
        if (now - start >= COLOR_TWEEN_MS)
          colorTween.current.fromColor = toColor;
        else colorActive = true;
      }
    }

    if (!colorActive && !highlighted) {
      job.stop();
    }
  });

  // The snapshot below must use the duration the tick was painting with
  // until this render (the prev ref), not the new one: on a mid-flight
  // speed change the new duration clamps in-flight progress to 1, so
  // snapshotting with it would capture the FINAL colour and the pill would
  // snap instead of finishing its fade.
  const prevColorTweenMs = useRef(COLOR_TWEEN_MS);
  useEffect(() => {
    const shownMs = prevColorTweenMs.current;
    prevColorTweenMs.current = COLOR_TWEEN_MS;
    if (!colorTween.current.initialized) {
      colorTween.current = {
        fromColor: targetColor,
        toColor: targetColor,
        start: 0,
        initialized: true
      };
      return;
    }
    const targetUnchanged = colorTween.current.toColor === targetColor;
    const inFlight =
      colorTween.current.fromColor !== colorTween.current.toColor;
    if (targetUnchanged && !inFlight) return;
    // Snapshot the colour shown right now as the new tween's start. Pass the
    // current toColor (not the new target) so a settled tween yields its
    // resting colour rather than jumping to the new target.
    const currentVisual = tweenColorNow(
      colorTween.current,
      colorTween.current.toColor,
      shownMs,
      performance.now()
    );
    colorTween.current = {
      fromColor: currentVisual,
      toColor: targetColor,
      start: performance.now(),
      initialized: true
    };
    job.start();
  }, [targetColor, job, COLOR_TWEEN_MS]);

  // Reset alpha synchronously on the trailing edge so the job can self-stop
  // without leaving the halo lit.
  useLayoutEffect(() => {
    if (highlighted) {
      job.start();
    } else if (haloRef.current) {
      haloRef.current.alpha = 0;
      phaseStart.current = null;
    }
  }, [highlighted, job]);

  const accentColor = theme.colors.accent;
  const drawHalo = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.roundRect(
        x - 7,
        PILL_Y - 7,
        w + 14,
        PILL_HEIGHT + 14,
        PILL_RADIUS + 6
      ).fill({ color: accentColor });
    },
    [x, w, accentColor]
  );

  // Pixi calls this when the draw prop identity changes (geometry/color prop
  // change, e.g. a resize). It paints through tweenColorNow — the SAME function
  // the tick uses — so a redraw mid-tween shows the live colour, never the
  // tween's start colour for a frame.
  const drawPill = useCallback(
    (g: PixiGraphics) => {
      repaintPill(
        g,
        tweenColorNow(
          colorTween.current,
          targetColor,
          COLOR_TWEEN_MS,
          performance.now()
        )
      );
    },
    [repaintPill, targetColor, COLOR_TWEEN_MS]
  );

  const label = pillLabel(points, status, attempts, problemCode);

  return (
    <pixiContainer>
      <pixiContainer ref={haloRef} alpha={0}>
        <pixiGraphics draw={drawHalo} />
      </pixiContainer>
      <pixiGraphics ref={pillGfxRef} draw={drawPill} />
      <pixiText
        text={label}
        x={x + w / 2}
        y={PILL_Y + PILL_HEIGHT / 2}
        anchor={0.5}
        alpha={isUnattempted ? 0.5 : 1}
        style={isUnattempted ? unattemptedLabelStyle : SCORE_LABEL_STYLE}
      />
    </pixiContainer>
  );
}

// All props are primitives — default shallow-compare is correct.
export const Pill = memo(PillInner);
