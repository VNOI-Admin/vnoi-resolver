import { useEffect, useMemo, useRef, useState } from 'react';

import './App.css';
import { useKeyPress } from './hooks';
import {
  THEMES,
  THEME_LS_KEY,
  ThemeProvider,
  cycleThemeKey,
  loadThemeKey,
  type ThemeKey
} from './canvas/theme';
import { useThemeCssVars } from './canvas/useThemeCssVars';
import { InputData, AwardImageMap } from './resolver';
import { Loading } from './Loading';
import { OperatorConsole } from './operator/OperatorConsole';
import { Audience } from './Audience';
import {
  audienceWindowUrl,
  readDisplayRole,
  readUrlConfig
} from './util/urlConfig';
import { useSyncOperator } from './useSyncOperator';

function App() {
  const role = useMemo(readDisplayRole, []);
  if (role === 'audience') return <Audience />;
  return <Operator />;
}

function Operator() {
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

  const [themeKey, setThemeKey] = useState<ThemeKey>(loadThemeKey);
  useEffect(() => {
    try {
      window.localStorage.setItem(THEME_LS_KEY, themeKey);
    } catch {
      // localStorage may be disabled; theming still works in-memory.
    }
  }, [themeKey]);
  useKeyPress('t', () => setThemeKey(cycleThemeKey));

  const [speed, setSpeed] = useState(1);

  // Bump on any input the precomputed timeline is built from: dataset
  // identity, the unofficial partition, award images, or the freeze window.
  // Used as a remount key on OperatorConsole so useReducer re-initialises,
  // AND as the ceremony trigger in useSyncOperator so a connected audience
  // re-inits. imageData/frozenTime matter for the second use: an audience
  // that connects while the splash is still fetching ?image= (data resolves
  // first) adopts an init with imageData {} — an award-less timeline — and
  // without a bump here nothing would ever correct it. Same for a
  // frozen-time edit made on the splash after the data loaded.
  const dataVersionRef = useRef({
    data: inputData,
    imageData,
    frozenTime,
    unofficial: unofficialContestants,
    hideUnofficial: hideUnofficialContestants,
    version: 0
  });
  if (
    dataVersionRef.current.data !== inputData ||
    dataVersionRef.current.imageData !== imageData ||
    dataVersionRef.current.frozenTime !== frozenTime ||
    dataVersionRef.current.unofficial !== unofficialContestants ||
    dataVersionRef.current.hideUnofficial !== hideUnofficialContestants
  ) {
    dataVersionRef.current = {
      data: inputData,
      imageData,
      frozenTime,
      unofficial: unofficialContestants,
      hideUnofficial: hideUnofficialContestants,
      version: dataVersionRef.current.version + 1
    };
  }
  const dataVersion = dataVersionRef.current.version;

  useThemeCssVars(themeKey);

  const { broadcastAction, audienceConnected } = useSyncOperator(
    {
      inputData,
      imageData,
      frozenTime,
      unofficialContestants,
      hideUnofficialContestants,
      themeKey,
      speed
    },
    dataVersion
  );

  // `popup=yes` plus explicit width/height/top/left flips browsers out of
  // tab-default into popup mode — drops the address bar / tab strip /
  // toolbar so the projector sees only the page. Named target focuses an
  // existing window instead of spawning a duplicate.
  useKeyPress('o', () => {
    const w = window.screen.availWidth;
    const h = window.screen.availHeight;
    window.open(
      audienceWindowUrl(),
      'vnoi-audience',
      `popup=yes,width=${w},height=${h},top=0,left=0,noopener`
    );
  });

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
          <OperatorConsole
            key={dataVersion}
            inputData={inputData}
            imageData={imageData}
            frozenTime={frozenTime}
            unofficialContestants={unofficialContestants}
            hideUnofficialContestants={hideUnofficialContestants}
            themeKey={themeKey}
            onCycleTheme={() => setThemeKey(cycleThemeKey)}
            speed={speed}
            setSpeed={setSpeed}
            audienceConnected={audienceConnected}
            onAction={broadcastAction}
          />
        )}
      </div>
    </ThemeProvider>
  );
}

export default App;
