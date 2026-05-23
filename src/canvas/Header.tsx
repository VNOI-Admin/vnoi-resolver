import { useCallback } from 'react';
import type { Graphics as PixiGraphics } from 'pixi.js';
import type { InputProblem } from '../lib/resolver';
import { COLORS, TEXT } from './theme';
import { HEADER_HEIGHT, Layout, ROW_HEIGHT } from './layout';
import { getProblemCodeFromIndex } from '../lib/resolver';

export function Header({
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

  const headerStyle = {
    fontFamily: TEXT.family,
    fontSize: TEXT.headerSize,
    fontWeight: '600' as const,
    fill: COLORS.textMuted,
    letterSpacing: 0.5
  };

  const problemStyle = {
    fontFamily: TEXT.family,
    fontSize: TEXT.size,
    fontWeight: '700' as const,
    fill: COLORS.text
  };

  return (
    <pixiContainer>
      <pixiGraphics draw={drawBg} />
      <pixiText
        text="RANK"
        x={layout.rank.x + layout.rank.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={headerStyle}
      />
      <pixiText
        text="NAME"
        x={layout.name.x + 8}
        y={ROW_HEIGHT / 2}
        anchor={{ x: 0, y: 0.5 }}
        style={headerStyle}
      />
      {problems.map((problem, i) => (
        <pixiContainer key={problem.problemId}>
          <pixiText
            text={getProblemCodeFromIndex(i)}
            x={layout.problems[i].x + layout.problems[i].w / 2}
            y={ROW_HEIGHT / 2 - 7}
            anchor={0.5}
            style={problemStyle}
          />
          <pixiText
            text={String(problem.points)}
            x={layout.problems[i].x + layout.problems[i].w / 2}
            y={ROW_HEIGHT / 2 + 10}
            anchor={0.5}
            style={{
              fontFamily: TEXT.family,
              fontSize: TEXT.denomSize,
              fill: COLORS.textMuted
            }}
          />
        </pixiContainer>
      ))}
      <pixiText
        text="SCORE"
        x={layout.score.x + layout.score.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={headerStyle}
      />
      <pixiText
        text="TIME"
        x={layout.time.x + layout.time.w / 2}
        y={ROW_HEIGHT / 2}
        anchor={0.5}
        style={headerStyle}
      />
    </pixiContainer>
  );
}
