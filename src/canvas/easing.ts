// easeInCubic is used only by row Y so the just-revealed score has time to
// settle on the row at its OLD rank before the row visibly takes off —
// the audience reads the number first, then follows the row.
// Everything else uses easeOutCubic (fast start, soft landing).

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number): number => t * t * t;
