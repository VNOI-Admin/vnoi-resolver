import { useMemo, useRef } from 'react';

import type { ResolverEvent } from '../lib/resolver';

/**
 * Full-width progress bar with award ticks. Hover-to-preview, no
 * click-to-commit (footgun) — only ← / → commit.
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

/** Rollback / play-pause / step / speed slider. Mouse-fallback for the
 *  keyboard bindings; each button advertises its hotkey for discoverability. */
export function Transport({
  playing,
  speed,
  onTogglePlay,
  onStep,
  onRollback,
  onSpeed
}: {
  playing: boolean;
  speed: number;
  onTogglePlay: () => void;
  onStep: () => void;
  onRollback: () => void;
  onSpeed: (n: number) => void;
}) {
  return (
    <div className="op-transport">
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
