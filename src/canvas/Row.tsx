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
import { easeInCubic, easeOutCubic } from './easing';
import { useAnimationSpeed } from './animationSpeed';
import { isTweening, retarget, tweenValue, type Tween } from './tween';

// Row Y uses ease-IN so the row visibly lingers at the just-resolved score
// before leaving its old rank. Score / penalty count-ups use ease-OUT.
//
// BASE durations are at 1× and divided by AnimationSpeed at consumption.
// 800 keeps tween < autoplay-interval (1000/speed) at every speed, leaving a
// 200/speed settle gap before the next step — otherwise tweens chase each
// other indefinitely.
const TWEEN_MS_BASE = 800;
const SCORE_TWEEN_MS_BASE = 500;

// Name sits in the upper 40px (pills tile underneath it). Side columns
// (rank / score / time) have nothing under them, so center against the
// FULL card to avoid top-stuck whitespace.
const NAME_Y = TOP_ROW_HEIGHT / 2;
const SIDE_COL_Y = CARD_HEIGHT / 2;

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
  const speed = useAnimationSpeed();
  const TWEEN_MS = TWEEN_MS_BASE / speed;
  const SCORE_TWEEN_MS = SCORE_TWEEN_MS_BASE / speed;
  // useMemo on theme so Pixi only re-validates the text texture once per
  // theme change, not once per render.
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

  // Position username after the name. Name width isn't known until after
  // Pixi lays it out; read in a layout effect and reposition before paint.
  useLayoutEffect(() => {
    const nameEl = nameTextRef.current;
    const userEl = usernameTextRef.current;
    if (!nameEl || !userEl) return;
    userEl.x = layout.name.x + 8 + nameEl.width + USERNAME_GAP;
  }, [row.fullName, layout.name.x]);

  const tween = useRef<Tween & { initialized: boolean }>({
    from: targetY,
    to: targetY,
    start: 0,
    initialized: false
  });

  const scoreTextRef = useRef<PixiText>(null);
  const scoreTween = useRef<Tween & { initialized: boolean }>({
    from: row.total,
    to: row.total,
    start: 0,
    initialized: false
  });

  const penaltyTextRef = useRef<PixiText>(null);
  const penaltyTween = useRef<Tween & { initialized: boolean }>({
    from: row.penalty,
    to: row.penalty,
    start: 0,
    initialized: false
  });

  // Skip formatPenalty + texture regen when the visible seconds haven't
  // changed (the underlying float may be lerping sub-second).
  const lastRenderedPenalty = useRef<number>(Math.floor(row.penalty));

  const job = useAnimationJob(() => {
    const now = performance.now();
    const el = ref.current;
    let hasYTween = false;
    if (el) {
      if (isTweening(tween.current)) {
        el.y = tweenValue(tween.current, now, TWEEN_MS, easeInCubic);
        if (now - tween.current.start >= TWEEN_MS) {
          tween.current.from = tween.current.to;
        } else hasYTween = true;
      }
      // zIndex priority: marked > tweening > stationary. Marked-row-last
      // render order in Body is the primary mechanism; this layer adds the
      // per-tween lift for non-marked rows shifting past static ones.
      el.zIndex = isCurrent ? 2 : hasYTween ? 1 : 0;
    }

    const scoreEl = scoreTextRef.current;
    let hasScoreTween = false;
    if (scoreEl && isTweening(scoreTween.current)) {
      const v = Math.round(
        tweenValue(scoreTween.current, now, SCORE_TWEEN_MS, easeOutCubic)
      );
      if (scoreEl.text !== String(v)) scoreEl.text = String(v);
      if (now - scoreTween.current.start >= SCORE_TWEEN_MS) {
        scoreTween.current.from = scoreTween.current.to;
      } else hasScoreTween = true;
    }

    const penaltyEl = penaltyTextRef.current;
    let hasPenaltyTween = false;
    if (penaltyEl && isTweening(penaltyTween.current)) {
      const v = tweenValue(
        penaltyTween.current,
        now,
        SCORE_TWEEN_MS,
        easeOutCubic
      );
      const rounded = Math.floor(Math.max(0, v));
      if (rounded !== lastRenderedPenalty.current) {
        lastRenderedPenalty.current = rounded;
        penaltyEl.text = formatPenalty(v);
      }
      if (now - penaltyTween.current.start >= SCORE_TWEEN_MS) {
        penaltyTween.current.from = penaltyTween.current.to;
      } else hasPenaltyTween = true;
    }

    if (!hasYTween && !hasScoreTween && !hasPenaltyTween) {
      job.stop();
    }
  });

  // Synchronous so the row never paints at y=0 before init. Also includes
  // TWEEN_MS in deps so a mid-tween speed change re-snapshots from the
  // CURRENT y (otherwise t = elapsed/TWEEN_MS would jump past 1 and the
  // tween snaps to target). Idle tweens (toY === targetY, no active flight)
  // short-circuit and don't restart.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!tween.current.initialized) {
      el.y = targetY;
      tween.current = {
        from: targetY,
        to: targetY,
        start: 0,
        initialized: true
      };
      return;
    }
    const targetUnchanged = tween.current.to === targetY;
    if (targetUnchanged && !isTweening(tween.current)) return;
    // Snapshot the rendered el.y (the value the tick last wrote) so a re-aim or
    // a mid-flight speed change continues from there without a jump.
    tween.current = {
      ...retarget(el.y, targetY, performance.now()),
      initialized: true
    };
    job.start();
  }, [targetY, job, TWEEN_MS]);

  // The count-ups re-aim when the target OR the duration changes, like the
  // Y tween above — the mid-flight duration case (a speed-slider drag) must
  // re-snapshot too, or the tick divides the old elapsed by the NEW duration
  // and the number snaps to its end value. Unlike Y there is no rendered
  // pixel to read back, so the snapshot is computed with the duration the
  // tick was using until this render (the prev ref); computing it with the
  // new duration would bake the same jump into the snapshot.
  const prevScoreTweenMs = useRef(SCORE_TWEEN_MS);
  useEffect(() => {
    const shownMs = prevScoreTweenMs.current;
    prevScoreTweenMs.current = SCORE_TWEEN_MS;
    if (!scoreTween.current.initialized) {
      scoreTween.current = {
        from: row.total,
        to: row.total,
        start: 0,
        initialized: true
      };
      return;
    }
    if (scoreTween.current.to === row.total && !isTweening(scoreTween.current))
      return;
    const now = performance.now();
    const shown = Math.round(
      tweenValue(scoreTween.current, now, shownMs, easeOutCubic)
    );
    scoreTween.current = {
      ...retarget(shown, row.total, now),
      initialized: true
    };
    job.start();
  }, [row.total, job, SCORE_TWEEN_MS]);

  const prevPenaltyTweenMs = useRef(SCORE_TWEEN_MS);
  useEffect(() => {
    const shownMs = prevPenaltyTweenMs.current;
    prevPenaltyTweenMs.current = SCORE_TWEEN_MS;
    if (!penaltyTween.current.initialized) {
      penaltyTween.current = {
        from: row.penalty,
        to: row.penalty,
        start: 0,
        initialized: true
      };
      return;
    }
    if (
      penaltyTween.current.to === row.penalty &&
      !isTweening(penaltyTween.current)
    )
      return;
    const now = performance.now();
    const shown = tweenValue(penaltyTween.current, now, shownMs, easeOutCubic);
    penaltyTween.current = {
      ...retarget(shown, row.penalty, now),
      initialized: true
    };
    job.start();
  }, [row.penalty, job, SCORE_TWEEN_MS]);

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
        // Per-theme tint: themes pick colour + alpha that BRIGHTENS the row
        // against their bg (cyan on dark, highlighter yellow on white).
        g.rect(0, 0, layout.totalWidth, CARD_HEIGHT).fill({
          color: markedRowColor,
          alpha: markedRowAlpha
        });
      }
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
      {/* The marked pill's halo overflows by ~5px; render non-marked pills
          first, marked one last so the halo isn't clipped by the neighbour. */}
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

// rankUsers rebuilds every UserRow each dispatch, so shallow compare would
// always say "different". Compare the fields that actually affect render.
// points/status/scoreClass are inner refs shared with InternalUser — same
// reference when this row wasn't resolved, so this stays O(1).
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
