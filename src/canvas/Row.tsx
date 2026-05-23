import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useTick } from '@pixi/react';
import type {
  Container as PixiContainer,
  Graphics as PixiGraphics,
  Text as PixiText
} from 'pixi.js';
import type { InputProblem, UserRow } from '../lib/resolver';
import { COLORS, TEXT } from './theme';
import { Layout, ROW_HEIGHT, formatPenalty } from './layout';
import { Pill } from './Pill';

const TWEEN_MS = 1000;
const SCORE_TWEEN_MS = 700;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function Row({
  row,
  problems,
  layout,
  targetIndex,
  isCurrent,
  markedProblemId
}: {
  row: UserRow;
  problems: InputProblem[];
  layout: Layout;
  targetIndex: number;
  isCurrent: boolean;
  markedProblemId: number;
}) {
  const ref = useRef<PixiContainer>(null);
  const targetY = targetIndex * ROW_HEIGHT;

  // Tween row Y when its target index changes.
  const tween = useRef<{
    fromY: number;
    toY: number;
    start: number;
    initialized: boolean;
  }>({ fromY: targetY, toY: targetY, start: 0, initialized: false });

  // Synchronous so the row never paints at y=0 before the position-init
  // assignment lands. Subsequent targetY changes kick off a tween.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!tween.current.initialized) {
      el.y = targetY;
      tween.current = {
        fromY: targetY,
        toY: targetY,
        start: 0,
        initialized: true
      };
      return;
    }
    if (tween.current.toY === targetY) return;
    tween.current = {
      fromY: el.y,
      toY: targetY,
      start: performance.now(),
      initialized: true
    };
  }, [targetY]);

  // Tween the displayed total score when the underlying value changes.
  const scoreTextRef = useRef<PixiText>(null);
  const scoreTween = useRef<{
    from: number;
    to: number;
    start: number;
    initialized: boolean;
  }>({ from: row.total, to: row.total, start: 0, initialized: false });

  useEffect(() => {
    if (!scoreTween.current.initialized) {
      scoreTween.current = {
        from: row.total,
        to: row.total,
        start: 0,
        initialized: true
      };
      return;
    }
    if (scoreTween.current.to === row.total) return;
    // Snapshot the currently displayed value as the new "from".
    const t = Math.min(
      1,
      (performance.now() - scoreTween.current.start) / SCORE_TWEEN_MS
    );
    const currentlyShown = Math.round(
      scoreTween.current.from +
        (scoreTween.current.to - scoreTween.current.from) * easeOutCubic(t)
    );
    scoreTween.current = {
      from: currentlyShown,
      to: row.total,
      start: performance.now(),
      initialized: true
    };
  }, [row.total]);

  // Tween the displayed penalty (seconds, float). Reformatted to HH:MM:SS each
  // frame so the digits tick smoothly during the lerp window.
  const penaltyTextRef = useRef<PixiText>(null);
  const penaltyTween = useRef<{
    from: number;
    to: number;
    start: number;
    initialized: boolean;
  }>({ from: row.penalty, to: row.penalty, start: 0, initialized: false });

  useEffect(() => {
    if (!penaltyTween.current.initialized) {
      penaltyTween.current = {
        from: row.penalty,
        to: row.penalty,
        start: 0,
        initialized: true
      };
      return;
    }
    if (penaltyTween.current.to === row.penalty) return;
    const t = Math.min(
      1,
      (performance.now() - penaltyTween.current.start) / SCORE_TWEEN_MS
    );
    const currentlyShown =
      penaltyTween.current.from +
      (penaltyTween.current.to - penaltyTween.current.from) * easeOutCubic(t);
    penaltyTween.current = {
      from: currentlyShown,
      to: row.penalty,
      start: performance.now(),
      initialized: true
    };
  }, [row.penalty]);

  // Track the most recent rounded penalty so the per-frame tween skips
  // formatPenalty + texture regen when the visible seconds haven't ticked.
  const lastRenderedPenalty = useRef<number>(Math.floor(row.penalty));

  // Glow overlay on the current row.
  const glowRef = useRef<PixiContainer>(null);
  const glowPhaseStart = useRef<number | null>(null);

  useTick(() => {
    // Row Y reorder.
    const el = ref.current;
    if (el) {
      const { fromY, toY, start } = tween.current;
      if (fromY === toY) {
        if (el.zIndex !== 0) el.zIndex = 0;
      } else {
        const t = Math.min(1, (performance.now() - start) / TWEEN_MS);
        el.y = fromY + (toY - fromY) * easeOutCubic(t);
        // Lift any row in flight above stationary rows so it slides ON TOP of
        // the ones it passes. A constant value avoids z-fights when two rows
        // swap equal distances.
        el.zIndex = 1;
        if (t >= 1) {
          tween.current.fromY = toY;
          el.zIndex = 0;
        }
      }
    }

    // Score tween — repaint the score text in flight.
    const scoreEl = scoreTextRef.current;
    if (scoreEl) {
      const { from, to, start } = scoreTween.current;
      if (from !== to) {
        const t = Math.min(1, (performance.now() - start) / SCORE_TWEEN_MS);
        const v = Math.round(from + (to - from) * easeOutCubic(t));
        if (scoreEl.text !== String(v)) scoreEl.text = String(v);
        if (t >= 1) scoreTween.current.from = to;
      }
    }

    // Penalty tween — lerp seconds, reformat to HH:MM:SS.
    // `formatPenalty` rounds to integer seconds, so we skip the reformat (and
    // the canvas text-texture rebuild) when the rounded seconds haven't moved.
    const penaltyEl = penaltyTextRef.current;
    if (penaltyEl) {
      const { from, to, start } = penaltyTween.current;
      if (from !== to) {
        const t = Math.min(1, (performance.now() - start) / SCORE_TWEEN_MS);
        const v = from + (to - from) * easeOutCubic(t);
        const rounded = Math.floor(Math.max(0, v));
        if (rounded !== lastRenderedPenalty.current) {
          lastRenderedPenalty.current = rounded;
          penaltyEl.text = formatPenalty(v);
        }
        if (t >= 1) penaltyTween.current.from = to;
      }
    }

    // Row glow pulse on the current row.
    const glow = glowRef.current;
    if (glow) {
      if (!isCurrent) {
        glow.alpha = 0;
        glowPhaseStart.current = null;
      } else {
        if (glowPhaseStart.current === null)
          glowPhaseStart.current = performance.now();
        const t =
          ((performance.now() - glowPhaseStart.current) / 1000) * Math.PI * 1.2;
        glow.alpha = 0.04 + 0.06 * (1 - Math.cos(t));
      }
    }
  });

  const drawBg = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const color = isCurrent
        ? COLORS.bgCurrent
        : targetIndex % 2 === 1
          ? COLORS.bgStripe
          : COLORS.bg;
      g.rect(0, 0, layout.totalWidth, ROW_HEIGHT).fill(color);
      g.rect(0, ROW_HEIGHT - 1, layout.totalWidth, 1).fill({
        color: COLORS.border,
        alpha: 0.6
      });
      if (isCurrent) {
        g.rect(0, 0, 4, ROW_HEIGHT).fill(COLORS.accent);
      }
    },
    [isCurrent, targetIndex, layout.totalWidth]
  );

  const drawGlow = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, 0, layout.totalWidth, ROW_HEIGHT).fill(COLORS.accent);
    },
    [layout.totalWidth]
  );

  return (
    <pixiContainer ref={ref}>
      <pixiGraphics draw={drawBg} />
      <pixiContainer ref={glowRef} alpha={0}>
        <pixiGraphics draw={drawGlow} />
      </pixiContainer>
      <pixiText
        text={row.rank}
        x={layout.rank.x + layout.rank.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={{
          fontFamily: TEXT.family,
          fontSize: TEXT.rankSize,
          fontWeight: '700',
          fill: COLORS.textRank
        }}
      />
      <pixiText
        text={`${row.fullName} (${row.username})`}
        x={layout.name.x + 8}
        y={ROW_HEIGHT / 2}
        anchor={{ x: 0, y: 0.5 }}
        style={{
          fontFamily: TEXT.family,
          fontSize: TEXT.size,
          fill: COLORS.text,
          wordWrap: false
        }}
      />
      {problems.map((problem, i) => (
        <Pill
          key={problem.problemId}
          x={layout.problems[i].x}
          points={row.points[problem.problemId] ?? 0}
          status={row.status[problem.problemId]}
          scoreClass={row.scoreClass[problem.problemId] ?? ''}
          highlighted={isCurrent && problem.problemId === markedProblemId}
        />
      ))}
      <pixiText
        ref={scoreTextRef}
        text={String(row.total)}
        x={layout.score.x + layout.score.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={{
          fontFamily: TEXT.family,
          fontSize: TEXT.size,
          fontWeight: 'bold',
          fill: COLORS.text
        }}
      />
      <pixiText
        ref={penaltyTextRef}
        text={formatPenalty(row.penalty)}
        x={layout.time.x + layout.time.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={{
          fontFamily: TEXT.family,
          fontSize: TEXT.size,
          fill: COLORS.text
        }}
      />
    </pixiContainer>
  );
}
