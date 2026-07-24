import { useEffect, useState } from 'react';

import { THEMES, type ThemeKey } from '../canvas/theme';
import type { AwardFit, SafeInsets } from '../util/safeArea';
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
  onCycleTheme,
  safeInsets,
  awardFit,
  onToggleAwardFit
}: {
  cursor: number;
  previewCursor: number | null;
  total: number;
  startedAt: number | null;
  themeKey: ThemeKey;
  onCycleTheme: () => void;
  safeInsets: SafeInsets;
  awardFit: AwardFit;
  onToggleAwardFit: () => void;
}) {
  const effective = previewCursor ?? cursor;
  const pct = total > 0 ? Math.round((effective / total) * 1000) / 10 : 0;
  const themeName = THEMES[themeKey].name;
  // Two readout pairs matching the two key families: Shift works the
  // top/left edges, ⌥ the bottom/right — but visually top+bottom belong
  // together (vertical) as do left+right (horizontal).
  const verticalActive = safeInsets.top !== 0 || safeInsets.bottom !== 0;
  const horizontalActive = safeInsets.left !== 0 || safeInsets.right !== 0;
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
          className={
            'op-status-cell op-margins' +
            (verticalActive ? ' op-margins-active' : '')
          }
          title={
            'Vertical safe margins on the audience display (px). ' +
            'Top edge: Shift+↓ in / Shift+↑ out. Bottom edge: ⌥+↑ in / ⌥+↓ out.'
          }
        >
          top {safeInsets.top} · bottom {safeInsets.bottom}
        </span>
        <span
          className={
            'op-status-cell op-margins' +
            (horizontalActive ? ' op-margins-active' : '')
          }
          title={
            'Horizontal safe margins on the audience display (px). ' +
            'Left edge: Shift+→ in / Shift+← out. Right edge: ⌥+← in / ⌥+→ out.'
          }
        >
          left {safeInsets.left} · right {safeInsets.right}
        </span>
        <button
          type="button"
          className="op-status-cell op-theme-pill"
          onClick={onToggleAwardFit}
          title="Toggle award image fit (I): fill stretches to the safe box, contain letterboxes"
        >
          award: {awardFit}
        </button>
        <button
          type="button"
          className="op-status-cell op-theme-pill"
          onClick={onCycleTheme}
          title="Cycle colour theme (T)"
        >
          theme: {themeName.toLowerCase()}
        </button>
        <span
          className="op-status-cell op-conn op-conn-live"
          title="Audience window is open and receiving updates"
        >
          <span className="op-conn-dot" aria-hidden />
          audience: live
        </span>
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
