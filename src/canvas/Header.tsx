import { memo, useCallback } from 'react';
import type { Graphics as PixiGraphics } from 'pixi.js';
import type { InputProblem } from '../lib/resolver';
import { COLORS, TEXT } from './theme';
import { HEADER_HEIGHT, Layout, ROW_HEIGHT } from './layout';
import { getProblemCodeFromIndex } from '../lib/resolver';

const HEADER_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.headerSize,
  fontWeight: '600' as const,
  fill: COLORS.textMuted,
  letterSpacing: 0.5
};

const PROBLEM_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.size,
  fontWeight: '700' as const,
  fill: COLORS.text
};

const DENOM_STYLE = {
  fontFamily: TEXT.family,
  fontSize: TEXT.denomSize,
  fill: COLORS.textMuted
};

function HeaderInner({
  problems,
  layout
}: {
  problems: InputProblem[];
  layout: Layout;
}) {
  const drawBg = useCallback(
    (g: PixiGraphics) => {
      g.clear();
      g.rect(0, 0, layout.totalWidth, HEADER_HEIGHT).fill(COLORS.bg);
      // Subtle underline that fades toward the right for visual interest.
      g.rect(0, HEADER_HEIGHT - 1, layout.totalWidth, 1).fill({
        color: COLORS.accent,
        alpha: 0.35
      });
    },
    [layout.totalWidth]
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBg} />
      <pixiText
        text="RANK"
        x={layout.rank.x + layout.rank.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={HEADER_STYLE}
      />
      <pixiText
        text="NAME"
        x={layout.name.x + 8}
        y={ROW_HEIGHT / 2}
        anchor={{ x: 0, y: 0.5 }}
        style={HEADER_STYLE}
      />
      {problems.map((problem, i) => {
        const col = layout.problems[i]!; // i < problems.length === columns
        return (
          <pixiContainer key={problem.problemId}>
            <pixiText
              text={getProblemCodeFromIndex(i)}
              x={col.x + col.w / 2}
              y={ROW_HEIGHT / 2 - 7}
              anchor={0.5}
              style={PROBLEM_STYLE}
            />
            <pixiText
              text={String(problem.points)}
              x={col.x + col.w / 2}
              y={ROW_HEIGHT / 2 + 10}
              anchor={0.5}
              style={DENOM_STYLE}
            />
          </pixiContainer>
        );
      })}
      <pixiText
        text="SCORE"
        x={layout.score.x + layout.score.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={HEADER_STYLE}
      />
      <pixiText
        text="TIME"
        x={layout.time.x + layout.time.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={HEADER_STYLE}
      />
    </pixiContainer>
  );
}

// Header content is determined entirely by `problems` + `layout`, both of which
// are referentially stable until viewport resize / contest change.
export const Header = memo(HeaderInner);
