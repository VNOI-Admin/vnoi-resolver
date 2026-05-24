# VNOI Resolver

Contest reveal tool for [VNOI Cup](https://vnoi.info). At the awards ceremony you
load the final dataset and step through the frozen submissions one by one,
revealing each result as the audience watches scores shuffle. Modeled after
[ICPC Resolver](https://github.com/icpctools/icpctools).

The scoreboard renders to a `<canvas>` via PixiJS, so rank-shift animations,
pill colour fades, score-counter tweens, camera pans, and confetti bursts all
run at 60 fps regardless of dataset size.

## Stack

- **Vite** (build / dev server), **TypeScript** in strict mode, **React 19**
- **PixiJS 8** + **@pixi/react 8** for the canvas scoreboard
- **canvas-confetti** for award bursts
- **react-select** for the unofficial-contestants picker
- **Vitest** for the resolver simulation tests
- **Yarn 4** as the package manager (binary committed under `.yarn/releases/`)
- ESLint 9 + Prettier 3

## Scripts

| Script                              | What it does                                            |
| ----------------------------------- | ------------------------------------------------------- |
| `yarn dev` (or `yarn start`)        | Vite dev server on http://localhost:3000/vnoi-resolver/ |
| `yarn build`                        | Production build to `build/`                            |
| `yarn preview`                      | Preview the production build                            |
| `yarn typecheck`                    | `tsc --noEmit`                                          |
| `yarn test`                         | Vitest in watch mode                                    |
| `yarn test:run`                     | Vitest one-shot                                         |
| `yarn lint` / `yarn lint:fix`       | ESLint                                                  |
| `yarn format` / `yarn format:check` | Prettier                                                |
| `yarn deploy`                       | Build + push to gh-pages                                |

## Usage

Open the app and either:

- **Drop a `data.json` and `images.json` on the splash form**, or
- **Pass them as query params**: `?data=<url>&image=<url>` (used by the published
  ceremony links).

Configure frozen time, optionally mark unofficial contestants, hit **Run**.

### Keyboard shortcuts

| Key     | Action                                                 |
| ------- | ------------------------------------------------------ |
| `→`     | Step forward                                           |
| `←`     | Step back                                              |
| `1`–`9` | Reveal the Nth pending submission for the current user |
| `Space` | Play / pause autoplay                                  |
| `C`     | Toggle autoplay controls bar (scoreboard mode only)    |
| `F`     | Toggle fullscreen (drops the browser address bar)      |
| `P`     | Toggle perf / FPS counter                              |
| `T`     | Cycle colour theme (Newsprint → Terminal → Studio)     |
| `O`     | Open a second window as the audience display           |
| `H`     | Toggle help overlay (closes it too)                    |

### Themes

Three ceremony themes, switchable any time via `T`. Choice persists in `localStorage`.

| Theme         | Surface     | Accent          | Vibe                                        |
| ------------- | ----------- | --------------- | ------------------------------------------- |
| **Newsprint** | paper white | ink cobalt blue | printed sports page, bright pills (default) |
| **Terminal**  | dark navy   | cyan            | CRT phosphor, polished dev-tool feel        |
| **Studio**    | pure black  | bright orange   | primetime broadcast, dark studio set        |

Each theme has its own score-gradient ramp + marked-row tint (highlighter yellow on Newsprint, accent overlay on the dark themes). All HTML chrome (loading form, share modal, help overlay, autoplay controls, FPS HUD) re-tints from a single set of CSS variables driven by the active theme.

### Operator window: two modes

The operator window has two modes that swap automatically based on whether
a paired audience window is alive (detected via a 2-second heartbeat over
the BroadcastChannel).

- **Scoreboard mode** (default, no audience): the operator window IS the
  audience view. Same Pixi scoreboard, same award overlays, same confetti
  bursts. Press `C` to reveal the autoplay controls bar on top. Use this
  alone if you don't need a separate projector display.
- **Console mode** (audience window is open and pinging): the audience
  window has taken over the live scoreboard, so the operator window flips
  to a pure control surface (status strip · three panes · timeline +
  transport). `useResolver` state survives the switch, so cursor / playing
  / speed / hover preview never reset.

Close the audience window → operator flips back to scoreboard mode after
the alive-timeout (~5 s) so the operator can see the show again.

### Operator console (console mode)

When an audience window is connected, the operator window is a pure control
surface: status strip at top (cursor position, % revealed, elapsed time,
audience-connection dot, theme indicator), three panes (NOW · NEXT · QUEUE),
and a timeline + transport row at the bottom.

- **NOW** shows what the audience is currently looking at (active user, last
  resolved submission, current award thumbnail if one's overlaid).
- **NEXT** is the star pane. When the next event is `mark_problem` with 2+
  pending submissions, it becomes a chooser: every pending submission as a
  row, prefixed with its `1`–`9` hotkey and labelled with the eventual score.
  The operator sees that pressing `2` reveals the bigger / dramatic one while
  `→` takes the smaller default.
- **QUEUE** lists the next ~10 events. Hover any row → NOW + NEXT preview the
  state at that point in the reveal, without committing (the audience doesn't
  see it). Hover leaves → revert.
- **Timeline** is a 1px bar with award reveals marked as small cyan ticks
  and the live cursor as a vertical accent line. Hover anywhere on the bar →
  same preview as queue rows. No click-to-commit (footgun); ← / → are the
  only commit paths.
- **Transport** mirrors the keyboard: `⏮` `⏯` `⏭` buttons with their hotkey
  chips, plus the autoplay speed slider.

Look at the audience window for the live scoreboard view; look at the
operator window for what's about to happen. (If you don't open an audience
window, the operator window stays in scoreboard mode and behaves like
before.)

### Multi-screen ceremony

The realistic ceremony setup is one laptop, one HDMI cable to the projector,
two browser windows: operator on the laptop screen, audience on the projector.
Press `O` (or open the same URL with `?display=audience` appended) to spawn
the second window. `O` opens it as a popup — no address bar / tab strip /
toolbar — and the audience window tries to enter the Web Fullscreen API on
mount (some Chromium builds allow it, others require a user gesture — in
that case it triggers automatically on the first click anywhere in the
audience window, or on the first keypress). Press `F` to toggle fullscreen
manually if needed. This is more aggressive than `F11` / macOS green button,
which keep the address bar reachable on hover-top — Web Fullscreen drops
every shred of browser chrome cross-platform. The audience window:

- Strips all operator chrome: no controls bar, no autoplay slider, no FPS HUD,
  no help overlay, no keyboard shortcut surface.
- Auto-hides the mouse cursor after 2 s of no movement, so the projector image
  stays clean.
- Mirrors the operator in real time: every step / rollback / theme cycle
  appears on the audience window within a frame.
- Shows confetti bursts + award image overlays just like the operator window
  (those are part of the show).

Sync is local-only via `BroadcastChannel` — no server, works on the static
GitHub Pages deploy, but both windows must be in the same browser session
on the same machine. If you refresh the operator window mid-show, refresh
the audience window too so the action log replays from scratch.

## Data format

The data JSON has three top-level arrays:

```jsonc
{
  "users": [{ "userId": 1, "username": "alice", "fullName": "Alice" }],
  "problems": [{ "problemId": 26, "name": "Gộp Máy Chủ", "points": 500 }],
  "submissions": [
    {
      "submissionId": 1492,
      "userId": 1,
      "problemId": 26,
      "time": "2342.178705",
      "points": 0.0
    }
  ]
}
```

`time` is in seconds since contest start, accepted as either a number or a
numeric string. Scoring is partial-credit; penalty follows VNOI's own rules
(see [`src/lib/resolver/penalty.ts`](src/lib/resolver/penalty.ts)).

Image JSON is a `{ "<rank>": "<data: URL>" }` map — when the reveal lands on a
user with a matching rank, the image overlays the scoreboard with a confetti
burst.

## Architecture

- [`src/lib/resolver/`](src/lib/resolver/) — pure simulation. `buildInitialState`
  computes a frozen-time public state plus per-user pending submissions, then
  `applyEvent` / `computeNextEvent` drive the reveal as an event-sourced state
  machine. `simulation.ts` adds `precomputeFrom` + `makeReducer` on top: the
  default-choice sequence is precomputed up-front, so `step` and `rollback`
  become O(1) cursor moves on the precomputed `events[]` + `states[]` arrays.
  Picking a non-default problem at a `mark_problem` boundary diverges and
  re-precomputes the tail. Tested with Vitest, no React.
- [`src/resolver.ts`](src/resolver.ts) — `useResolver` hook: useReducer
  wrapper around the lib's `makeReducer` and `initSimState`. Exposes the
  current snapshot (data, marked ids, image), plus `cursor` / `totalEvents`
  / `events[]` / a memoised `peekAt(cursor)` so the operator console can
  render lookahead and hover-previews without dispatching.
- [`src/canvas/`](src/canvas/) — Pixi React components: `Scoreboard`, `Header`,
  `Row`, `Pill`. Used only by the audience window. Tweens (row Y, score,
  penalty, glow, pill colour/halo, camera pan) share a single `useTick` via
  [`animation.tsx`](src/canvas/animation.tsx)'s job registry, so idle rows
  contribute zero per-frame work. The body is virtualized — only rows whose
  target index falls inside the camera's visible window (plus overscan) are
  mounted, with the marked row always rendered last for stable z-order under
  rapid back-and-forth dispatches.
- [`src/operator/`](src/operator/) — operator-only console. `OperatorConsole`
  composes `StatusStrip` + `NowPane` / `NextPane` / `QueuePane` + `Timeline`
  - `Transport`. `format.ts` holds pure helpers (`describeEvent`,
    `summariseNow`, `formatElapsed`, `formatRankDelta`) covered by
    [`__tests__/format.test.ts`](src/operator/__tests__/format.test.ts).
    Theme-aware via the same `--ui-*` CSS vars as the rest of the app — the
    console restyles in lockstep when the operator cycles theme.
- [`src/App.tsx`](src/App.tsx) — top-level role split: `?display=audience` →
  `<Audience>`, otherwise `<Operator>` (splash + console). The Operator
  owns the BroadcastChannel, an action log, the theme-CSS bridge, and the
  audience-connection heartbeat (lit when an `alive` message has arrived
  within `ALIVE_TIMEOUT_MS`); it broadcasts an `init` payload in response to
  audience `hello` pings and broadcasts every step / rollback / theme cycle
  thereafter.
- [`src/Audience.tsx`](src/Audience.tsx) — audience-window mirror. Polls
  hello until it gets an `init`, replays the operator's action log into its
  own `useResolver`, then applies append + theme messages live. Emits an
  `alive` heartbeat for the operator's connection indicator. No operator
  chrome, cursor auto-hides after 2 s.
- [`src/sync.ts`](src/sync.ts) — `BroadcastChannel` wrapper + `SyncMessage`
  union (`hello` / `init` / `append` / `theme` / `alive`). Single schema both
  windows agree on.
- [`src/canvas/theme.ts`](src/canvas/theme.ts) — theme registry +
  `ThemeProvider` / `useTheme` hook. Every Pixi component reads colours from
  `useTheme()`; CSS chrome reads from `:root` vars (`--ui-surface`,
  `--ui-text`, `--ui-accent`, …) that App.tsx keeps in sync with the active
  theme. Adding a new theme is a one-place change: extend `THEMES` with all
  required colour keys + a `markedRow` overlay; the theme smoke test
  ([`src/canvas/__tests__/theme.test.ts`](src/canvas/__tests__/theme.test.ts))
  catches missing fields at CI time.

## Deploy

`yarn deploy` builds with `base: '/vnoi-resolver/'` and pushes `build/` to the
`gh-pages` branch via [`gh-pages`](https://www.npmjs.com/package/gh-pages).
