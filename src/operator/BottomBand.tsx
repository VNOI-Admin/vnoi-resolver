import { useMemo, useRef } from 'react';

import type { ResolverEvent } from '../lib/resolver';

/**
 * Full-width progress bar with award ticks. Hover-to-preview only — the bar
 * itself never commits (footgun); commits happen via ← / →, the transport
 * buttons, or queue-row clicks.
 */
export function Timeline({
  events,
  cursor,
  hoverCursor,
  onHoverCursor,
  onLeaveCursor
}: {
  events: readonly ResolverEvent[];
  cursor: number;
  hoverCursor: number | null;
  onHoverCursor: (cursor: number) => void;
  onLeaveCursor: () => void;
}) {
  const total = events.length;
  const ref = useRef<HTMLDivElement>(null);

  const awardTicks = useMemo(() => {
    if (total === 0) return [] as number[];
    const out: number[] = [];
    events.forEach((e, i) => {
      if (e.kind === 'show_award') out.push(i);
    });
    return out;
  }, [events, total]);

  const handleMove: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (total === 0) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    onHoverCursor(Math.round(ratio * total));
  };

  const pctFor = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div
      ref={ref}
      className="op-timeline"
      onMouseMove={handleMove}
      onMouseLeave={onLeaveCursor}
      aria-label="Reveal timeline"
    >
      <div className="op-timeline-track" />
      <div
        className="op-timeline-fill"
        style={{ width: `${pctFor(cursor)}%` }}
      />
      {awardTicks.map((i) => (
        <div
          key={i}
          className="op-timeline-tick op-timeline-tick-award"
          style={{ left: `${pctFor(i)}%` }}
          title={`Award reveal at event ${i + 1}`}
        />
      ))}
      <div
        className="op-timeline-cursor"
        style={{ left: `${pctFor(cursor)}%` }}
        title={`Live cursor: event ${cursor} / ${total}`}
      />
      {hoverCursor !== null && hoverCursor !== cursor ? (
        <div
          className="op-timeline-cursor op-timeline-cursor-preview"
          style={{ left: `${pctFor(hoverCursor)}%` }}
        />
      ) : null}
    </div>
  );
}

// Jump-navigation callbacks + availability flags. `can*` disable a button
// when there's no target in that direction (e.g. no further award).
export type SeekControls = {
  prevAward: () => void;
  nextAward: () => void;
  prevMove: () => void;
  nextMove: () => void;
  canPrevAward: boolean;
  canNextAward: boolean;
  canPrevMove: boolean;
  canNextMove: boolean;
};

/** Rollback / play-pause / step / speed slider + a seek cluster (jump to
 *  prev/next award and rank-change). The step/play buttons advertise their
 *  hotkeys; the seek cluster is deliberately mouse-ONLY — jumps cross many
 *  events at once and lost their key bindings after a fat-finger incident. */
export function Transport({
  playing,
  speed,
  onTogglePlay,
  onStep,
  onRollback,
  onSpeed,
  seek
}: {
  playing: boolean;
  speed: number;
  onTogglePlay: () => void;
  onStep: () => void;
  onRollback: () => void;
  onSpeed: (n: number) => void;
  seek: SeekControls;
}) {
  return (
    <div className="op-transport">
      <div className="op-transport-seek">
        <button
          type="button"
          className="op-transport-btn op-transport-btn-seek"
          onClick={() => seek.prevMove()}
          disabled={!seek.canPrevMove}
          title="Jump back to previous rank change"
          aria-label="Previous rank change"
        >
          <span className="op-transport-glyph">⤒</span>
        </button>
        <button
          type="button"
          className="op-transport-btn op-transport-btn-seek"
          onClick={() => seek.prevAward()}
          disabled={!seek.canPrevAward}
          title="Jump back to previous award"
          aria-label="Previous award"
        >
          <span className="op-transport-glyph">🏆‹</span>
        </button>
        <button
          type="button"
          className="op-transport-btn op-transport-btn-seek"
          onClick={() => seek.nextAward()}
          disabled={!seek.canNextAward}
          title="Jump to next award"
          aria-label="Next award"
        >
          <span className="op-transport-glyph">›🏆</span>
        </button>
        <button
          type="button"
          className="op-transport-btn op-transport-btn-seek"
          onClick={() => seek.nextMove()}
          disabled={!seek.canNextMove}
          title="Jump to next rank change"
          aria-label="Next rank change"
        >
          <span className="op-transport-glyph">⤓</span>
        </button>
      </div>
      <div className="op-transport-btn-group">
        <button
          type="button"
          className="op-transport-btn"
          onClick={() => onRollback()}
          title="Step back (←)"
          aria-label="Step back"
        >
          <span className="op-transport-glyph">⏮</span>
          <kbd className="op-transport-key">←</kbd>
        </button>
        <button
          type="button"
          className="op-transport-btn op-transport-btn-primary"
          onClick={() => onTogglePlay()}
          title={playing ? 'Pause autoplay (Space)' : 'Play autoplay (Space)'}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          <span className="op-transport-glyph">{playing ? '❚❚' : '▶'}</span>
          <kbd className="op-transport-key">Space</kbd>
        </button>
        <button
          type="button"
          className="op-transport-btn"
          // Wrapped so React doesn't pass the MouseEvent into onStep's
          // `choice?: number` parameter.
          onClick={() => onStep()}
          title="Step forward (→)"
          aria-label="Step forward"
        >
          <span className="op-transport-glyph">⏭</span>
          <kbd className="op-transport-key">→</kbd>
        </button>
      </div>
      <label className="op-transport-speed">
        <span className="op-transport-speed-label">autoplay</span>
        <input
          type="range"
          min={0.2}
          max={5}
          step={0.1}
          value={speed}
          onChange={(e) => onSpeed(parseFloat(e.target.value))}
        />
        <span className="op-transport-speed-num">{speed.toFixed(1)}×</span>
      </label>
    </div>
  );
}
