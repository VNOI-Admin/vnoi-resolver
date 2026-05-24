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
import { useAnimationJob } from './animation';
import { easeOutCubic } from './easing';
import { useAnimationSpeed } from './animationSpeed';

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

function PillInner({
  x,
  w,
  points,
  status,
  scoreClass,
  highlighted,
  problemCode
}: {
  x: number;
  w: number;
  points: number;
  status: ProblemAttemptStatus;
  scoreClass: string;
  highlighted: boolean;
  problemCode: string;
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
        const t = Math.min(1, (performance.now() - start) / COLOR_TWEEN_MS);
        const c = lerpColor(fromColor, toColor, easeOutCubic(t));
        repaintPill(g, c);
        if (t >= 1) colorTween.current.fromColor = toColor;
        else colorActive = true;
      }
    }

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
    const targetUnchanged = colorTween.current.toColor === targetColor;
    const inFlight =
      colorTween.current.fromColor !== colorTween.current.toColor;
    if (targetUnchanged && !inFlight) return;
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

  // Static paint when not tweening. Pixi calls this when the draw prop
  // identity changes (i.e. on prop changes affecting shape/color).
  const drawPill = useCallback(
    (g: PixiGraphics) => {
      const { fromColor, toColor } = colorTween.current;
      const color = fromColor === toColor ? targetColor : fromColor;
      repaintPill(g, color);
    },
    [repaintPill, targetColor]
  );

  const label = isUnattempted
    ? problemCode
    : isPending
      ? `${points || ''}?`
      : String(points);

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
