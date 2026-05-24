// Award-reveal confetti burst. Shared between operator-scoreboard mode and
// audience window so tuning happens in one place.

import confetti from 'canvas-confetti';

const CONFETTI_COLORS = ['#22d3ee', '#4ade80', '#fbbf24', '#f97316', '#a855f7'];

const COMMON = {
  particleCount: 140,
  spread: 65,
  startVelocity: 55,
  scalar: 1.1,
  ticks: 240,
  colors: CONFETTI_COLORS
};

// Two diagonal bursts from the bottom corners, framing the centre.
export function fireAwardConfetti(): void {
  confetti({ ...COMMON, angle: 60, origin: { x: 0, y: 0.85 } });
  confetti({ ...COMMON, angle: 120, origin: { x: 1, y: 0.85 } });
}
