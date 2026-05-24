import { memo, useCallback, useMemo } from 'react';
import type { Graphics as PixiGraphics } from 'pixi.js';
import type { InputProblem } from '../lib/resolver';
import { getProblemCodeFromIndex } from '../lib/resolver';
import { TEXT, useTheme } from './theme';
import { HEADER_HEIGHT, Layout } from './layout';

// Problem letter sits up top with its point-value subscript underneath. The
// LETTER + POINTS pair forms a visual block; RANK / SCORE / TIME (which are
// single-line labels with nothing under them) sit at that block's midpoint so
// they read as visually-centered against the column headers.
const LETTER_Y = 26;
const POINTS_Y = 50;
const SIDE_LABEL_Y = (LETTER_Y + POINTS_Y) / 2;

function HeaderInner({
  problems,
  layout
}: {
  problems: InputProblem[];
  layout: Layout;
}) {
  const theme = useTheme();

  const headerLabelStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 16,
      fontWeight: '600' as const,
      fill: theme.colors.textMuted,
      letterSpacing: 1.5
    }),
    [theme]
  );
  const problemLetterStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 22,
      fontWeight: '700' as const,
      fill: theme.colors.text
    }),
    [theme]
  );
  const problemPointsStyle = useMemo(
    () => ({
      fontFamily: TEXT.family,
      fontSize: 14,
      fill: theme.colors.textMuted
    }),
    [theme]
  );

  const bgColor = theme.colors.bg;
  const borderColor = theme.colors.border;
  const drawBg = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, 0, layout.totalWidth, HEADER_HEIGHT).fill(bgColor);
      // Neutral 1 px rule separates header from the scoreboard body without
      // pulling attention. Theme identity now lives only in marked-row tint
      // and pill halo — both event-driven, not always-on.
      g.rect(0, HEADER_HEIGHT - 1, layout.totalWidth, 1).fill(borderColor);
    },
    [layout.totalWidth, bgColor, borderColor]
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBg} />
      {/* Side labels — vertically centered against the letter+points stack. */}
      <pixiText
        text="RANK"
        x={layout.rank.x + layout.rank.w / 2}
        y={SIDE_LABEL_Y}
        anchor={0.5}
        style={headerLabelStyle}
      />
      <pixiText
        text="SCORE"
        x={layout.score.x + layout.score.w / 2}
        y={SIDE_LABEL_Y}
        anchor={0.5}
        style={headerLabelStyle}
      />
      <pixiText
        text="TIME"
        x={layout.time.x + layout.time.w / 2}
        y={SIDE_LABEL_Y}
        anchor={0.5}
        style={headerLabelStyle}
      />
      {/* Problem column header: letter on top, point value subscript below. */}
      {problems.map((problem, i) => {
        const col = layout.problems[i]!;
        return (
          <pixiContainer key={problem.problemId}>
            <pixiText
              text={getProblemCodeFromIndex(i)}
              x={col.x + col.w / 2}
              y={LETTER_Y}
              anchor={0.5}
              style={problemLetterStyle}
            />
            <pixiText
              text={String(problem.points)}
              x={col.x + col.w / 2}
              y={POINTS_Y}
              anchor={0.5}
              style={problemPointsStyle}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
}

// Header content is determined entirely by `problems` + `layout`, both of which
// are referentially stable until viewport resize / contest change.
export const Header = memo(HeaderInner);
