import { memo, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type {
  Container as PixiContainer,
  Graphics as PixiGraphics,
  Text as PixiText
} from 'pixi.js';
import type { InputProblem, UserRow } from '../lib/resolver';
import { ProblemAttemptStatus } from '../lib/resolver';
import { COLORS, TEXT } from './theme';
import { Layout, ROW_HEIGHT, formatPenalty } from './layout';
import { Pill } from './Pill';
import { useAnimationJob } from './animation';

const TWEEN_MS = 1000;
const SCORE_TWEEN_MS = 700;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Pixi's `style` prop is mutation-sensitive: a new object literal each render
// makes @pixi/react re-apply it and Pixi re-validate the text texture. These
// are invariant per row so we hoist them.
const RANK_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.rankSize,
  fontWeight: 'bold' as const,
  fill: COLORS.textRank
};
const NAME_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.size,
  fill: COLORS.text,
  wordWrap: false
};
const SCORE_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.size,
  fontWeight: 'bold' as const,
  fill: COLORS.text
};
const TIME_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.size,
  fill: COLORS.text
};

type RowProps = {
  row: UserRow;
  problems: InputProblem[];
  layout: Layout;
  targetIndex: number;
  isCurrent: boolean;
  markedProblemId: number;
};

function RowInner({
  row,
  problems,
  layout,
  targetIndex,
  isCurrent,
  markedProblemId
}: RowProps) {
  const ref = useRef<PixiContainer>(null);
  const targetY = targetIndex * ROW_HEIGHT;

  // Tween row Y when its target index changes.
  const tween = useRef<{
    fromY: number;
    toY: number;
    start: number;
    initialized: boolean;
  }>({ fromY: targetY, toY: targetY, start: 0, initialized: false });

  // Tween the displayed total score when the underlying value changes.
  const scoreTextRef = useRef<PixiText>(null);
  const scoreTween = useRef<{
    from: number;
    to: number;
    start: number;
    initialized: boolean;
  }>({ from: row.total, to: row.total, start: 0, initialized: false });

  // Tween the displayed penalty (seconds, float). Reformatted to HH:MM:SS each
  // frame so the digits tick smoothly during the lerp window.
  const penaltyTextRef = useRef<PixiText>(null);
  const penaltyTween = useRef<{
    from: number;
    to: number;
    start: number;
    initialized: boolean;
  }>({ from: row.penalty, to: row.penalty, start: 0, initialized: false });

  // Track the most recent rounded penalty so the per-frame tween skips
  // formatPenalty + texture regen when the visible seconds haven't ticked.
  const lastRenderedPenalty = useRef<number>(Math.floor(row.penalty));

  // Glow overlay on the current row.
  const glowRef = useRef<PixiContainer>(null);
  const glowPhaseStart = useRef<number | null>(null);

  const job = useAnimationJob(() => {
    // Row Y reorder.
    const el = ref.current;
    let hasYTween = false;
    if (el) {
      const { fromY, toY, start } = tween.current;
      if (fromY !== toY) {
        const t = Math.min(1, (performance.now() - start) / TWEEN_MS);
        el.y = fromY + (toY - fromY) * easeOutCubic(t);
        if (t >= 1) tween.current.fromY = toY;
        else hasYTween = true;
      }
      // zIndex priority: marked row > tweening row > stationary. Marked-row-
      // last render order in Body is the primary mechanism for keeping the
      // marked row on top; this zIndex layer adds the per-tween lift for
      // non-marked rows shifting past static ones.
      el.zIndex = isCurrent ? 2 : hasYTween ? 1 : 0;
    }

    // Score tween — repaint the score text in flight.
    const scoreEl = scoreTextRef.current;
    let hasScoreTween = false;
    if (scoreEl) {
      const { from, to, start } = scoreTween.current;
      if (from !== to) {
        const t = Math.min(1, (performance.now() - start) / SCORE_TWEEN_MS);
        const v = Math.round(from + (to - from) * easeOutCubic(t));
        if (scoreEl.text !== String(v)) scoreEl.text = String(v);
        if (t >= 1) scoreTween.current.from = to;
        else hasScoreTween = true;
      }
    }

    // Penalty tween — lerp seconds, reformat to HH:MM:SS.
    const penaltyEl = penaltyTextRef.current;
    let hasPenaltyTween = false;
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
        else hasPenaltyTween = true;
      }
    }

    // Glow pulse on the current row.
    const glow = glowRef.current;
    if (glow && isCurrent) {
      if (glowPhaseStart.current === null)
        glowPhaseStart.current = performance.now();
      const t =
        ((performance.now() - glowPhaseStart.current) / 1000) * Math.PI * 1.2;
      glow.alpha = 0.04 + 0.06 * (1 - Math.cos(t));
    }

    // Self-stop once nothing remains to animate.
    if (!hasYTween && !hasScoreTween && !hasPenaltyTween && !isCurrent) {
      job.stop();
    }
  });

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
    job.start();
  }, [targetY, job]);

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
    job.start();
  }, [row.total, job]);

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
    job.start();
  }, [row.penalty, job]);

  // Glow needs the job running while isCurrent. Reset alpha synchronously
  // when stepping off the current row — by the time the job stops itself, the
  // last alpha could be anything non-zero.
  useLayoutEffect(() => {
    if (isCurrent) {
      job.start();
    } else if (glowRef.current) {
      glowRef.current.alpha = 0;
      glowPhaseStart.current = null;
    }
  }, [isCurrent, job]);

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
        style={RANK_STYLE}
      />
      <pixiText
        text={`${row.fullName} (${row.username})`}
        x={layout.name.x + 8}
        y={ROW_HEIGHT / 2}
        anchor={{ x: 0, y: 0.5 }}
        style={NAME_STYLE}
      />
      {problems.map((problem, i) => {
        const col = layout.problems[i]!; // i < problems.length === columns
        return (
          <Pill
            key={problem.problemId}
            x={col.x}
            points={row.points[problem.problemId] ?? 0}
            status={
              row.status[problem.problemId] ?? ProblemAttemptStatus.UNATTEMPTED
            }
            scoreClass={row.scoreClass[problem.problemId] ?? ''}
            highlighted={isCurrent && problem.problemId === markedProblemId}
          />
        );
      })}
      <pixiText
        ref={scoreTextRef}
        text={String(row.total)}
        x={layout.score.x + layout.score.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={SCORE_STYLE}
      />
      <pixiText
        ref={penaltyTextRef}
        text={formatPenalty(row.penalty)}
        x={layout.time.x + layout.time.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={TIME_STYLE}
      />
    </pixiContainer>
  );
}

// `rankUsers` rebuilds `row` (a UserRow) every dispatch via `{ ...user, total,
// rank: '' }`, so the default shallow compare would say "different" every
// render. Compare the fields that actually affect rendering. `points`,
// `status`, `scoreClass` are inner refs shared with InternalUser — same ref
// across renders when this row wasn't resolved, so the comparison is O(1).
function rowEqual(a: RowProps, b: RowProps): boolean {
  return (
    a.targetIndex === b.targetIndex &&
    a.isCurrent === b.isCurrent &&
    a.markedProblemId === b.markedProblemId &&
    a.problems === b.problems &&
    a.layout === b.layout &&
    a.row.total === b.row.total &&
    a.row.penalty === b.row.penalty &&
    a.row.rank === b.row.rank &&
    a.row.points === b.row.points &&
    a.row.status === b.row.status &&
    a.row.scoreClass === b.row.scoreClass
  );
}

export const Row = memo(RowInner, rowEqual);
