// Dark ceremony theme. Values as 0xRRGGBB ints (Pixi) — string equivalents in
// App.css must stay in sync.
export const COLORS = {
  bg: 0x0b1220,
  bgStripe: 0x111a2e,
  bgCurrent: 0x1b2842,
  border: 0x1f2a3f,
  accent: 0x22d3ee, // cyan-400, for marked emphasis
  text: 0xe2e8f0,
  textMuted: 0x94a3b8,
  textRank: 0xf8fafc,

  // Score gradient 0% → 100%, ordered low to high.
  pillPending: 0x8b5cf6, // violet-500
  score_0: 0xef4444, // red-500
  score_0_10: 0xf97316, // orange-500
  score_10_20: 0xfb923c, // orange-400
  score_20_30: 0xfbbf24, // amber-400
  score_30_40: 0xfacc15, // yellow-400
  score_40_50: 0xeab308, // yellow-500
  score_50_60: 0xa3e635, // lime-400
  score_60_70: 0x84cc16, // lime-500
  score_70_80: 0x4ade80, // green-400
  score_80_90: 0x22c55e, // green-500
  score_90_100: 0x16a34a, // green-600
  score_100: 0x10b981 // emerald-500
} as const;

const PILL_COLOR_BY_CLASS: Record<string, number> = {
  score_0: COLORS.score_0,
  score_0_10: COLORS.score_0_10,
  score_10_20: COLORS.score_10_20,
  score_20_30: COLORS.score_20_30,
  score_30_40: COLORS.score_30_40,
  score_40_50: COLORS.score_40_50,
  score_50_60: COLORS.score_50_60,
  score_60_70: COLORS.score_60_70,
  score_70_80: COLORS.score_70_80,
  score_80_90: COLORS.score_80_90,
  score_90_100: COLORS.score_90_100,
  score_100: COLORS.score_100
};

export function pillColorForClass(
  scoreClass: string,
  isPending: boolean
): number {
  if (isPending) return COLORS.pillPending;
  return PILL_COLOR_BY_CLASS[scoreClass] ?? COLORS.score_0;
}

export const TEXT = {
  family:
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  size: 14,
  rankSize: 17,
  pillSize: 13,
  denomSize: 10,
  headerSize: 13
} as const;
