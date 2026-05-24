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
  Graphics as PixiGraphics,
  Text as PixiText
} from 'pixi.js';
import type { InputProblem, UserRow } from '../lib/resolver';
import { ProblemAttemptStatus, getProblemCodeFromIndex } from '../lib/resolver';
import { TEXT, useTheme } from './theme';
import { CARD_HEIGHT, Layout, TOP_ROW_HEIGHT, formatPenalty } from './layout';
import { Pill } from './Pill';
import { useAnimationJob } from './animation';

const TWEEN_MS = 1000;
const SCORE_TWEEN_MS = 700;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Name sits in the upper 40 px (pills tile underneath it). Rank / score / time
// columns have nothing under them, so vertically-center those against the FULL
// card so they don't look top-stuck with whitespace below.
const NAME_Y = TOP_ROW_HEIGHT / 2;
const SIDE_COL_Y = CARD_HEIGHT / 2;

// Sizes are biased for projector legibility from across a contest hall, not
// for compact local viewing. Color fills depend on the active theme, so the
// full style objects are built inside the component via useMemo.
const USERNAME_GAP = 10;

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
  const theme = useTheme();
  // Style objects bake the theme's text colors in. Pixi re-validates the text
  // texture when the style identity changes — useMemo keeps that to one
  // re-validation per theme change instead of one per render.
  // Rank shares the same text color as the score (theme.colors.text). Using
  // the accent color for rank pulled attention away from the actual numbers
  // the audience tracks (name, score, time) — keeping rank/score/time in one
  // color family lets the eye scan a row without distraction.
  const rankStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 30,
      fontWeight: 'bold' as const,
      fill: theme.colors.text
    }),
    [theme]
  );
  const nameStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 26,
      fontWeight: '700' as const,
      fill: theme.colors.text,
      wordWrap: false
    }),
    [theme]
  );
  const usernameStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 20,
      fontWeight: '400' as const,
      fill: theme.colors.textMuted,
      wordWrap: false
    }),
    [theme]
  );
  const scoreStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 32,
      fontWeight: 'bold' as const,
      fill: theme.colors.text
    }),
    [theme]
  );
  const timeStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 18,
      fill: theme.colors.textMuted
    }),
    [theme]
  );

  const ref = useRef<PixiContainer>(null);
  const nameTextRef = useRef<PixiText>(null);
  const usernameTextRef = useRef<PixiText>(null);
  const targetY = targetIndex * CARD_HEIGHT;

  // Position username right after the full name, with a small gap. Width of
  // the name text isn't known until after Pixi lays it out, so we read it
  // synchronously in a layout effect and reposition before paint.
  useLayoutEffect(() => {
    const nameEl = nameTextRef.current;
    const userEl = usernameTextRef.current;
    if (!nameEl || !userEl) return;
    userEl.x = layout.name.x + 8 + nameEl.width + USERNAME_GAP;
  }, [row.fullName, layout.name.x]);

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

    // Self-stop once nothing remains to animate. Marked-row indication is now
    // purely the static cyan bg tint in drawBg — no per-frame pulse needed.
    if (!hasYTween && !hasScoreTween && !hasPenaltyTween) {
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

  // Card background: alternating stripe; marked rows get an accent tint
  // overlay (ICPC-style full-row highlight). The 4px left accent bar of the
  // previous layout is dropped — redundant with the full tint.
  //
  // Divider stays neutral (theme.colors.border) — using the accent here made
  // the dividers compete with the header underline. Theme identity lives in
  // the header underline + marked-row tint + pill halo, not in the dividers.
  const bgColor = theme.colors.bg;
  const bgStripeColor = theme.colors.bgStripe;
  const borderColor = theme.colors.border;
  const markedRowColor = theme.markedRow.color;
  const markedRowAlpha = theme.markedRow.alpha;
  const drawBg = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      const base = targetIndex % 2 === 1 ? bgStripeColor : bgColor;
      g.rect(0, 0, layout.totalWidth, CARD_HEIGHT).fill(base);
      if (isCurrent) {
        // Per-theme marked-row tint. Themes pick a colour + alpha that
        // BRIGHTENS the row against their bg (cyan glow on dark, highlighter
        // yellow on white) — using one accent for both directions would
        // darken light themes.
        g.rect(0, 0, layout.totalWidth, CARD_HEIGHT).fill({
          color: markedRowColor,
          alpha: markedRowAlpha
        });
      }
      // Neutral divider between cards — full alpha so the row separation is
      // unambiguous from across the hall, but still in `border` colour so it
      // doesn't compete with the theme accent.
      g.rect(0, CARD_HEIGHT - 1, layout.totalWidth, 1).fill(borderColor);
    },
    [
      isCurrent,
      targetIndex,
      layout.totalWidth,
      bgColor,
      bgStripeColor,
      borderColor,
      markedRowColor,
      markedRowAlpha
    ]
  );

  return (
    <pixiContainer ref={ref}>
      <pixiGraphics draw={drawBg} />
      <pixiText
        text={row.rank}
        x={layout.rank.x + layout.rank.w / 2}
        y={SIDE_COL_Y}
        anchor={0.5}
        style={rankStyle}
      />
      <pixiText
        ref={nameTextRef}
        text={row.fullName}
        x={layout.name.x + 8}
        y={NAME_Y}
        anchor={{ x: 0, y: 0.5 }}
        style={nameStyle}
      />
      <pixiText
        ref={usernameTextRef}
        text={`(${row.username})`}
        x={layout.name.x + 8}
        y={NAME_Y}
        anchor={{ x: 0, y: 0.5 }}
        style={usernameStyle}
      />
      {/*
       * The marked pill's halo extends ~5px past the pill bounds. If we
       * rendered pills in column order, the neighbour to the right would
       * paint over that overflow and clip it. So: render every non-marked
       * pill first, then the marked one last (z-on-top). Same belt-and-
       * suspenders pattern as Body's marked-row-last render order.
       */}
      {problems.map((problem, i) => {
        const isMarked = isCurrent && problem.problemId === markedProblemId;
        if (isMarked) return null;
        const col = layout.problems[i]!;
        return (
          <Pill
            key={problem.problemId}
            x={col.x}
            w={col.w}
            problemCode={getProblemCodeFromIndex(i)}
            points={row.points[problem.problemId] ?? 0}
            status={
              row.status[problem.problemId] ?? ProblemAttemptStatus.UNATTEMPTED
            }
            scoreClass={row.scoreClass[problem.problemId] ?? ''}
            highlighted={false}
          />
        );
      })}
      {isCurrent &&
        markedProblemId !== -1 &&
        (() => {
          const i = problems.findIndex((p) => p.problemId === markedProblemId);
          if (i < 0) return null;
          const problem = problems[i]!;
          const col = layout.problems[i]!;
          return (
            <Pill
              key={problem.problemId}
              x={col.x}
              w={col.w}
              problemCode={getProblemCodeFromIndex(i)}
              points={row.points[problem.problemId] ?? 0}
              status={
                row.status[problem.problemId] ??
                ProblemAttemptStatus.UNATTEMPTED
              }
              scoreClass={row.scoreClass[problem.problemId] ?? ''}
              highlighted
            />
          );
        })()}
      <pixiText
        ref={scoreTextRef}
        text={String(row.total)}
        x={layout.score.x + layout.score.w / 2}
        y={SIDE_COL_Y}
        anchor={0.5}
        style={scoreStyle}
      />
      <pixiText
        ref={penaltyTextRef}
        text={formatPenalty(row.penalty)}
        x={layout.time.x + layout.time.w / 2}
        y={SIDE_COL_Y}
        anchor={0.5}
        style={timeStyle}
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
