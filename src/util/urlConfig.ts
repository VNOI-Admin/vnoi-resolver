// VNOI Cup standard reveal window: scoreboard freezes 4h before contest end.
export const DEFAULT_FROZEN_TIME_MIN = 240;

// Read on mount only. data/image are fetched by the loading form; the others
// seed UI state so a shared link lands on a pre-filled splash. The URL is
// NOT kept in sync — the "Generate share link" button builds a fresh URL
// from current state.

export type UrlConfig = {
  frozenTime: number;
  unofficial: string[];
  hideUnofficial: boolean;
  dataUrl: string | null;
  imageUrl: string | null;
};

export function readUrlConfig(): UrlConfig {
  const p = new URLSearchParams(window.location.search);
  const ftStr = p.get('frozenTime');
  const ft = ftStr !== null ? parseInt(ftStr, 10) : NaN;
  return {
    frozenTime: Number.isFinite(ft) && ft >= 0 ? ft : DEFAULT_FROZEN_TIME_MIN,
    // getAll() collects repeated ?unofficial=…; split() also accepts a CSV value.
    unofficial: p
      .getAll('unofficial')
      .flatMap((v) => v.split(',').filter(Boolean)),
    hideUnofficial: p.get('hideUnofficial') !== '0',
    dataUrl: p.get('data'),
    imageUrl: p.get('image')
  };
}

// 'audience' on ?display=audience; otherwise 'operator'.
export type DisplayRole = 'operator' | 'audience';

export function readDisplayRole(): DisplayRole {
  const v = new URLSearchParams(window.location.search).get('display');
  return v === 'audience' ? 'audience' : 'operator';
}

// Preserves every other query param so ?data=…&image=… still resolves in
// the spawned audience window.
export function audienceWindowUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set('display', 'audience');
  return url.toString();
}
