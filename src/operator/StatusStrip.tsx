import { useEffect, useState } from 'react';

import { THEMES, type ThemeKey } from '../canvas/theme';
import { formatElapsed } from './format';

// Top band. Compact, single-line, theme-aware.
//
// `previewCursor` is non-null while hovering queue/timeline. The cursor cell
// then shows BOTH values and the % cell switches to the previewed cursor —
// keeps the strip honest with NOW/NEXT instead of asserting a stale live
// position.
//
// The audience-connected indicator is always "live" here: this component
// only renders inside console mode, which by definition means the audience
// is connected (the parent flips to scoreboard mode and unmounts this on
// disconnect).
export function StatusStrip({
  cursor,
  previewCursor,
  total,
  startedAt,
  themeKey,
  onCycleTheme
}: {
  cursor: number;
  previewCursor: number | null;
  total: number;
  startedAt: number | null;
  themeKey: ThemeKey;
  onCycleTheme: () => void;
}) {
  const effective = previewCursor ?? cursor;
  const pct = total > 0 ? Math.round((effective / total) * 1000) / 10 : 0;
  const themeName = THEMES[themeKey].name;
  return (
    <div className="op-status">
      <div className="op-status-left">
        <span className="op-status-cell op-status-cursor">
          <span className="op-status-num">{cursor}</span>
          {previewCursor !== null ? (
            <>
              <span className="op-status-sep" aria-hidden>
                →
              </span>
              <span
                className="op-status-num op-status-num-preview"
                title="Previewed cursor (hover queue/timeline)"
              >
                {previewCursor}
              </span>
            </>
          ) : null}
          <span className="op-status-sep">/</span>
          <span className="op-status-num op-status-num-muted">{total}</span>
        </span>
        <span className="op-status-cell">
          {pct.toFixed(1)}% revealed
          {previewCursor !== null ? (
            <span className="op-status-preview-tag"> · preview</span>
          ) : null}
        </span>
        <ElapsedCell startedAt={startedAt} />
      </div>
      <div className="op-status-right">
        <span
          className="op-status-cell op-conn op-conn-live"
          title="Audience window is open and receiving updates"
        >
          <span className="op-conn-dot" aria-hidden />
          audience: live
        </span>
        <button
          type="button"
          className="op-status-cell op-theme-pill"
          onClick={onCycleTheme}
          title="Cycle colour theme (T)"
        >
          theme: {themeName.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

// Isolated 1Hz tick so the elapsed cell re-renders alone, not the whole
// console (panes + queue + timeline).
function ElapsedCell({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsedMs = startedAt === null ? 0 : now - startedAt;
  return (
    <span className="op-status-cell">{formatElapsed(elapsedMs)} elapsed</span>
  );
}
