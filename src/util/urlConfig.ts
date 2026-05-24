import queryString from 'query-string';

// Query params we read on mount only. `data` / `image` are fetched in the
// loading form; the others seed UI state so a shared link lands the recipient
// on a pre-filled loading screen. The URL is *not* kept in sync after mount —
// the "Generate share link" button builds a fresh URL from current state.
// Defaults: frozenTime=240, hideUnofficial=1 (true), unofficial=[].

export type UrlConfig = {
  frozenTime: number;
  unofficial: string[];
  hideUnofficial: boolean;
  dataUrl: string | null;
  imageUrl: string | null;
};

export function readUrlConfig(): UrlConfig {
  const p = queryString.parse(window.location.search);
  // query-string returns string for `?k=v`, string[] for `?k=v1&k=v2`, null
  // for `?k`. `first` collapses to the first defined string value (or null),
  // `all` flattens both shapes into a string[].
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
    frozenTime: Number.isFinite(ft) && ft >= 0 ? ft : 240,
    unofficial: all(p.unofficial),
    hideUnofficial: first(p.hideUnofficial) !== '0',
    dataUrl: first(p.data),
    imageUrl: first(p.image)
  };
}
