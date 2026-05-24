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
| `C`     | Toggle autoplay controls bar                           |
| `F`     | Toggle FPS counter                                     |
| `H`     | Toggle help overlay (closes it too)                    |

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
- [`src/resolver.ts`](src/resolver.ts) — `useResolver` hook: thin useReducer
  wrapper around the lib's `makeReducer` and `initSimState`.
- [`src/canvas/`](src/canvas/) — Pixi React components: `Scoreboard`, `Header`,
  `Row`, `Pill`. Tweens (row Y, score, penalty, glow, pill colour/halo, camera
  pan) are all easeOutCubic and share a single `useTick` via
  [`animation.tsx`](src/canvas/animation.tsx)'s job registry, so idle rows
  contribute zero per-frame work. The body is virtualized — only rows whose
  target index falls inside the camera's visible window (plus overscan) are
  mounted, with the marked row always rendered last for stable z-order under
  rapid back-and-forth dispatches.
- [`src/App.tsx`](src/App.tsx) — splash form (file upload + drag-drop + share
  link modal), autoplay loop, keyboard shortcuts, confetti glue, help overlay,
  optional FPS HUD.

## Deploy

`yarn deploy` builds with `base: '/vnoi-resolver/'` and pushes `build/` to the
`gh-pages` branch via [`gh-pages`](https://www.npmjs.com/package/gh-pages).
