import { useEffect, useState } from 'react';

import { TEXT } from './theme';

// Every (weight, size) the canvas rasterizes. The scoreboard must not mount
// before these faces are ready: Pixi positions the username from the
// measured name width and sizes the text texture from the same measurement,
// so measuring against a fallback font while painting with Inter clips the
// name's last characters and overlaps the username into them.
const FONT_SPECS = [
  `400 20px ${TEXT.loadFamily}`,
  `600 16px ${TEXT.loadFamily}`,
  `700 26px ${TEXT.loadFamily}`
];

// @fontsource splits Inter into unicode-range subsets that load lazily per
// code point. check/load without sample text only exercises the latin
// subset — the Vietnamese one would still stream in AFTER the first canvas
// paint of a diacritic name, re-opening the measure≠paint gap. Probe with
// the diacritics contestant names actually use.
const FONT_PROBE_TEXT =
  'AaĐđăâêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ';

// The show must never block on typography: if the faces are somehow still
// pending after this, mount anyway — a machine stuck without the webfont
// falls back consistently (measure and paint agree on the fallback).
const FONT_WAIT_CEILING_MS = 1500;

export function useFontsLoaded(): boolean {
  const [ready, setReady] = useState(
    () =>
      typeof document === 'undefined' ||
      !document.fonts ||
      FONT_SPECS.every((s) => document.fonts.check(s, FONT_PROBE_TEXT))
  );
  useEffect(() => {
    if (ready) return;
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        setReady(true);
      }
    };
    Promise.all(FONT_SPECS.map((s) => document.fonts.load(s, FONT_PROBE_TEXT)))
      .then(finish)
      .catch(finish);
    const failsafe = setTimeout(finish, FONT_WAIT_CEILING_MS);
    return () => {
      done = true;
      clearTimeout(failsafe);
    };
  }, [ready]);
  return ready;
}
