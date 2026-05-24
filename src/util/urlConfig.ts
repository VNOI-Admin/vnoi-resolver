import queryString from 'query-string';

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
  const p = queryString.parse(window.location.search);
  // query-string returns string for ?k=v, string[] for ?k=v1&k=v2, null
  // for ?k. first/all normalise both shapes.
  const first = (
    v: string | (string | null)[] | null | undefined
  ): string | null => {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      const found = v.find((x): x is string => typeof x === 'string');
      return found ?? null;
    }
    return null;
  };
  const all = (v: string | (string | null)[] | null | undefined): string[] => {
    if (typeof v === 'string') return v.split(',').filter(Boolean);
    if (Array.isArray(v)) {
      return v.flatMap((x) =>
        typeof x === 'string' ? x.split(',').filter(Boolean) : []
      );
    }
    return [];
  };

  const ftStr = first(p.frozenTime);
  const ft = ftStr !== null ? parseInt(ftStr, 10) : NaN;
  return {
    frozenTime: Number.isFinite(ft) && ft >= 0 ? ft : DEFAULT_FROZEN_TIME_MIN,
    unofficial: all(p.unofficial),
    hideUnofficial: first(p.hideUnofficial) !== '0',
    dataUrl: first(p.data),
    imageUrl: first(p.image)
  };
}

// 'audience' on ?display=audience; otherwise 'operator'.
export type DisplayRole = 'operator' | 'audience';

export function readDisplayRole(): DisplayRole {
  const p = queryString.parse(window.location.search);
  const v = Array.isArray(p.display) ? p.display[0] : p.display;
  return v === 'audience' ? 'audience' : 'operator';
}

// Preserves every other query param so ?data=…&image=… still resolves in
// the spawned audience window.
export function audienceWindowUrl(): string {
  const url = new URL(window.location.href);
  url.searchParams.set('display', 'audience');
  return url.toString();
}
