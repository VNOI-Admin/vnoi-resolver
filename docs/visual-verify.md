# Rendering verification

The scoreboard renders to a `<canvas>` via PixiJS. Two tiers protect it.

## Tier 1 — automated (run in CI, `yarn test:run`)

The rendering **decisions** are pure functions with invariant tests, so the
bugs that used to slip through (camera yo-yo, blank-band-on-big-jump, pill
colour flash) now fail a unit test instead of needing an eyeball:

| Decision                | Module                                             | Test                                                                                                                          |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Camera framing + scroll | `src/canvas/cameraGeometry.ts`                     | `cameraGeometry.test.ts` — frames the cursor not the marked row; **camera target is monotonic over a full reveal (no yo-yo)** |
| Row mount window        | `src/canvas/cameraGeometry.ts` (`visibleRowRange`) | `cameraGeometry.test.ts` — **the marked row is always mounted, even rocketing across a tall board (no gap)**                  |
| Pill colour tween       | `src/canvas/colorTween.ts`                         | `colorTween.test.ts` — both writers paint through one `tweenColorNow`; ease curve + clamping pinned                           |
| Scalar tweens           | `src/canvas/tween.ts`                              | `tween.test.ts` — camera/row/score/penalty share one engine; **no jump on retarget** (the snap-on-speed-change class)         |
| Autoplay pacing         | `src/operator/scheduler.ts`                        | `scheduler.test.ts` — `nextWake` advances only on cursor move (no speed-drag stall)                                           |
| Jump targets            | `src/operator/seek.ts`                             | `seek.test.ts` — next/prev award + rank-change land on the right cursor                                                       |
| Reveal determinism      | `src/lib/resolver/*`                               | `replay.test.ts` — ranking oracle + chooser/choice-index invariant                                                            |
| Sync replay             | `src/sync.ts`                                      | `sync.test.ts` — `applySyncMessage` idempotent same-ceremony init                                                             |

If you change a rendering decision, change the function — the test will tell
you if you broke an invariant.

## Tier 2 — visual pass (before a ceremony / after touching canvas or operator UI)

Pixel output, tween smoothness, masking, theming, confetti, the operator
console panes, and two-window sync can't be unit-tested without a flaky
GPU/screenshot harness, so they need eyes on a running app. This pass is not
theatre: running it has caught real bugs — the award-auto-pause overshoot
(autoplay flashed the award past at high speed) and a chooser-hotkey leak (`1`–`9`
committed against the live cursor during a queue preview, despite the chooser's
own "Preview only" hint; the click path was already gated, the keys were not).

### How to run it

`yarn dev`, then drive it by hand in a browser or with the Claude Preview MCP.
Sections **A–D** and **F** are fully MCP-runnable on one page; **E** needs two
real windows.

- **Load the dataset.** `preview_start` the `vite` server, then `preview_eval`
  `window.location.href = '<base>/?data=/vnoi-resolver/vnoicup24/data.json&image=/vnoi-resolver/vnoicup24/images.json'`.
  (Navigate with the full URL each time — a bare `location.reload()` drops the
  query string.)
- **Drive with dispatched keys** —
  `window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))`. Bindings:
  `Space` play/pause · `ArrowRight`/`ArrowLeft` step · `1`–`9` chooser pick ·
  `t` theme · `f` fullscreen · `p` FPS · `c` controls bar (scoreboard mode) ·
  `o` audience window · `h` help. ←/→ are the ONLY navigation keys — every
  jump (award / rank-change) is mouse-only via the console transport buttons
  or a queue-row click; in scoreboard mode, reach an award by stepping or
  autoplay. Set autoplay speed via the slider:
  `.op-transport-speed input` (console) or `.controls input[type=range]`
  (scoreboard) — set it through the native value setter, the `c` toggle and the
  Run click can race in one eval.
- **Reach console mode without a second window.** Console mode only renders when
  an audience is connected. Fake the heartbeat from the same page:
  ```js
  const ch = new BroadcastChannel('vnoi-resolver:sync');
  window.__fake = setInterval(() => ch.postMessage({ kind: 'alive' }), 500);
  ```
  The operator flips to `.operator-console` within ~1–2s (BroadcastChannel
  delivers to the operator's own channel instance in the same page).
  `clearInterval(window.__fake)` flips it back to the scoreboard after the alive
  timeout. This is what makes sections **C/D** MCP-testable on one page.
- **Observe** with `preview_screenshot`, `preview_resize`, `preview_snapshot`,
  and `preview_eval` — e.g. `document.querySelector('.award-overlay')`, a 2nd
  `<canvas>` means confetti fired, `.op-pane-now` text, the play button's
  `aria-label` for paused state.

**Two real windows are the only exception** (section E): the MCP drives ONE
page, so a window opened with `O` is a separate popup it can't screenshot.
Verify E by hand. The sync _logic_ is unit-tested (`applySyncMessage`
idempotent-init + replay determinism), so E is only about the literal visual
mirror.

Report what you saw per item; don't write "looks fine" without having watched it.

### A. Splash / load (before the reveal runs) — MCP

1. **File load** — drop or pick a data `.json`: the filename chip appears and
   **Run** enables. A malformed file shows a red `.error-toast` and Run stays
   disabled. A `?data=` URL auto-loads and Run reads "Loading…" until the fetch
   settles (so awards never render without art).
2. **Frozen time** — clear `#frozen-input` to empty: it stays empty, does NOT
   snap to 0. Type a value, blur → commits. Clear it then Run → falls back to the
   last committed value, never a silent 0.
3. **Unofficial + hide** — pick teams in the multiselect and tick _Hide
   unofficial_; after Run those teams are gone from the board (or present but
   unranked when unticked).
4. **Share link** — _Generate share link_ opens the modal; pasting data/image
   URLs builds the link live (with frozen-time / unofficial params folded in);
   loading a disk file with no URL shows the "loaded from disk" warning; Copy
   toasts and clears.

### B. Live scoreboard (audience-facing canvas) — MCP

1. **Scroll feel** — Space to autoplay. The board creeps **up** smoothly as
   teams resolve; it must NOT swing up to chase a climbing team then snap back
   down (the yo-yo).
2. **Big jump** — a low team resolving a big problem leaps many ranks; the
   highlighted row rises through real rows, never a black band. (Most visible on
   a large contest; at ~23 rows everything is mounted regardless.)
3. **Mask clipping** — body rows clipped under the header, nothing spilling over
   the column titles. Cycle theme (T) and re-check (the mask survives re-mounts).
4. **Pill colour + buckets** — pills fade smoothly on resolve, and each matches
   its score: solved = full colour, partial = mid, failed = 0/fail tint, pending
   = "?", untried = ghost. `preview_resize` mid-reveal → no stale-colour flash,
   no layout break.
5. **Count-ups** — total score and penalty/time tween **up** on a resolve (they
   count, they don't snap); rolling back (`←`) counts them down.
6. **Theme** — T cycles Newsprint → Terminal → Studio; canvas background and
   every pill retint together, no stale colours left behind. Check the CANVAS
   clear colour specifically — the row gaps and the area below the last row
   (make the window taller than the board) — not just the body CSS: the
   `<Application backgroundColor>` prop is init-only (BackgroundSync pushes
   theme changes imperatively), and a stale clear colour hides perfectly
   behind row-covered screenshots (it did once).
7. **Award + confetti** — drive to a ranked award (sample ranks: 1, 2, 4, 6, 8,
   11, 17 — rank 17 is the first the reveal reaches). Confetti fires once AND the
   award image is HELD on screen (autoplay pauses on it). Bump to 5× and re-check
   it still holds — it must not flash the award past.
8. **End of reveal** — at rank 1 the final award shows and autoplay stops at the
   end (no loop, no error). `←` rewinds for a replay.

### C. Operator console (audience connected — fake the alive ping) — MCP

1. **Mode flip** — with `alive` pinging, the window becomes `.operator-console`
   (status strip · NOW/NEXT/QUEUE · timeline + transport), with no scoreboard
   canvas. Stop the ping → it flips back to the scoreboard within the alive
   timeout, cursor + autoplay state intact (the component never unmounts).
2. **NOW / NEXT** — NOW names the on-screen team (rank + pts) and the last
   reveal; NEXT shows the next event headline, points X/Y, and a rank delta (e.g.
   "23 → 18", highlighted when it shifts), with a ⚡ on dramatic events.
3. **Chooser** — at a `mark_problem` with ≥2 pendings, NEXT lists the choices
   `1`–`9` (code · name · pts · rank-delta, "default" on the first); pressing
   `1`–`9` or clicking a row commits the matching one; the board preview under it
   updates as you hover each choice ("Board if C revealed").
4. **Queue + board preview** — QUEUE lists the next ~20 with 🏆 on awards;
   hovering a row previews that future state in NOW/NEXT and the centre board
   window, and the status strip shows `cursor → preview` with a "preview" tag —
   all without the queue list itself shifting.
5. **Backward scrub** — hover an already-revealed point on the timeline: it
   previews (is NOT instantly wiped). Then let autoplay/step overtake a _forward_
   hover → that preview clears. (Exercises the prevCursor gate.)
6. **Click to act** — click a QUEUE row → live cursor jumps there (pausing
   first; queue clicks are live-relative, so they work during their own hover
   preview by design). Click a chooser row → reveals that submission — the
   chooser's clicks AND its `1`–`9` hotkeys must mute while a queue/timeline
   preview is active.
7. **Jump nav** — mouse-only: the 🏆‹/›🏆 transport buttons land exactly on
   award reveals (the timeline ticks) and ⤒/⤓ on rank-changes. A `]`, `[`,
   `.`, `,`, `Home`, or `End` keypress must NOT seek. The transport seek buttons
   disable when there's no target in that direction.

### D. Transport & autoplay — MCP

1. **Speed mid-play** — drag the speed slider during autoplay: pacing changes
   immediately and stepping never stalls (the speed-drag / double-accrue bug).
2. **Resume past award** — after the award auto-pause, Space resumes and the
   image hides as the reveal continues (the flip side of the overshoot fix).
3. **Help overlay** — H opens the dialog and autoplay pauses; Esc, H, or a click
   closes it and focus returns to where it was.
4. **Fullscreen** — F enters/exits fullscreen (drops the browser chrome); the
   board reflows to the new size with no clipping.

### E. Two-window sync (two real windows — hand only)

1. **Mirror** — press O for the audience window; every operator step / jump /
   theme change reflects there within a frame.
2. **Idempotent init** — open a SECOND audience window: the first must NOT flash
   or re-tween (init is a no-op for the same ceremony).
3. **Reconnect** — close the audience window; the operator flips back to
   scoreboard mode instantly (`bye` on pagehide; the ~10 s alive timeout is
   only the crash fallback). Reopen → it re-pairs.
4. **Late join / refresh** — refresh the audience mid-reveal; it replays the
   action log from the start and lands on the operator's exact cursor.

### F. Edge-case datasets — MCP

1. **All pending** (frozen time 0) — nothing pre-solved; the reveal still runs
   and ranks correctly through to the end.
2. **No award art** (image file omitted) — the reveal completes with no award
   pauses and no broken `<img>`.
