import { useEffect, useMemo, useRef, useState } from 'react';

import './App.css';
import { useKeyPress } from './hooks';
import {
  THEMES,
  ThemeProvider,
  cycleThemeKey,
  DEFAULT_THEME_KEY,
  type ThemeKey
} from './canvas/theme';
import { InputData, AwardImageMap } from './resolver';
import { Loading } from './Loading';
import { Ranking } from './Ranking';
import { readUrlConfig } from './util/urlConfig';

const THEME_LS_KEY = 'vnoi-resolver:theme';

function loadThemeKey(): ThemeKey {
  try {
    const saved = window.localStorage.getItem(THEME_LS_KEY);
    if (saved && saved in THEMES) return saved as ThemeKey;
  } catch {
    // localStorage can throw (private mode, quota). Fall through to default.
  }
  return DEFAULT_THEME_KEY;
}

function App() {
  // Read URL once for initial state — no live sync back.
  const initial = useMemo(readUrlConfig, []);

  const [loading, setLoading] = useState<boolean>(true);
  const [inputData, setInputData] = useState<InputData | null>(null);
  const [imageData, setImageData] = useState<AwardImageMap>({});
  const [frozenTime, setFrozenTime] = useState<number>(initial.frozenTime);
  const [unofficialContestants, setUnofficialContestants] = useState<string[]>(
    initial.unofficial
  );
  const [hideUnofficialContestants, setHideUnofficialContestants] = useState(
    initial.hideUnofficial
  );

  // Active theme. `T` cycles; persisted to localStorage so the next ceremony
  // load remembers the operator's pick.
  const [themeKey, setThemeKey] = useState<ThemeKey>(loadThemeKey);
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_LS_KEY, themeKey);
    } catch {
      // ignore — themed UI still works, just won't persist
    }
  }, [themeKey]);
  useKeyPress('t', () => setThemeKey(cycleThemeKey));

  // Bump a version every time the contest dataset identity changes. Used as a
  // remount key on <Ranking> so its useReducer re-initialises from the new
  // base state. (useReducer's init fn only runs once per instance.)
  const dataVersionRef = useRef({ data: inputData, version: 0 });
  if (dataVersionRef.current.data !== inputData) {
    dataVersionRef.current = {
      data: inputData,
      version: dataVersionRef.current.version + 1
    };
  }
  const dataVersion = dataVersionRef.current.version;

  // Sync body bg + UI CSS vars to the active theme on every screen. The CSS
  // vars (--ui-surface / --ui-text / --ui-accent / etc.) drive every HTML
  // chrome element — loading form, share modal, help overlay, autoplay
  // controls, FPS HUD — so they all re-tint when the theme cycles.
  //
  // The Pixi canvas paints its own bg each frame, but any gap (mid-tween row
  // movement, mask edges, device-pixel rounding) lets the document body show
  // through; on a light theme the CSS default would leak as dark navy.
  useEffect(() => {
    const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
    const root = document.documentElement.style;
    const theme = THEMES[themeKey];
    document.body.style.background = hex(theme.colors.bg);
    root.setProperty('--ui-surface', hex(theme.colors.bg));
    root.setProperty('--ui-surface-elevated', hex(theme.colors.bgStripe));
    root.setProperty('--ui-text', hex(theme.colors.text));
    root.setProperty('--ui-text-muted', hex(theme.colors.textMuted));
    root.setProperty('--ui-accent', hex(theme.colors.accent));
    root.setProperty('--ui-border', hex(theme.colors.border));
  }, [themeKey]);

  return (
    <ThemeProvider theme={THEMES[themeKey]}>
      <div className="App">
        {loading || !inputData ? (
          <Loading
            inputData={inputData}
            frozenTime={frozenTime}
            unofficialContestants={unofficialContestants}
            hideUnofficialContestants={hideUnofficialContestants}
            dataUrl={initial.dataUrl}
            imageUrl={initial.imageUrl}
            setLoading={setLoading}
            setInputData={setInputData}
            setImageData={setImageData}
            setFrozenTime={setFrozenTime}
            setUnofficialContestants={setUnofficialContestants}
            setHideUnofficialContestants={setHideUnofficialContestants}
          />
        ) : (
          <Ranking
            key={dataVersion}
            inputData={inputData}
            imageData={imageData}
            frozenTime={frozenTime}
            unofficialContestants={unofficialContestants}
            hideUnofficialContestants={hideUnofficialContestants}
          />
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
