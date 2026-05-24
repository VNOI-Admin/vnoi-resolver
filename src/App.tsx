import React, {
  Dispatch,
  SetStateAction,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import queryString from 'query-string';

import Select, { MultiValue } from 'react-select';

import confetti from 'canvas-confetti';

import './App.css';
import { useKeyPress } from './hooks';
import {
  InputData,
  AwardImageMap,
  parseInputData,
  useResolver
} from './resolver';

// Code-split: Pixi + @pixi/react is ~500 KB. Loading screen renders without
// it; we only pay the chunk download when the user clicks Run. The
// `.then(m => ({ default: m.Scoreboard }))` shim adapts the named export to
// the default-export shape `lazy()` requires.
const Scoreboard = lazy(() =>
  import('./canvas/Scoreboard').then((m) => ({ default: m.Scoreboard }))
);

const CONFETTI_COLORS = ['#22d3ee', '#4ade80', '#fbbf24', '#f97316', '#a855f7'];

function fireAwardConfetti() {
  const common = {
    particleCount: 140,
    spread: 65,
    startVelocity: 55,
    scalar: 1.1,
    ticks: 240,
    colors: CONFETTI_COLORS
  };
  confetti({ ...common, angle: 60, origin: { x: 0, y: 0.85 } });
  confetti({ ...common, angle: 120, origin: { x: 1, y: 0.85 } });
}

function readJsonFile<T>(file: File, parse: (raw: unknown) => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(reader.result as string);
        resolve(parse(raw));
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

// Best-effort extraction of a filename from a URL, used as a display label
// when data/image was loaded from `?data=...` / `?image=...`. Falls back to
// the raw URL on parse failure.
function urlBasename(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop();
    return last || url;
  } catch {
    return url;
  }
}

type DropKind = 'data' | 'image';

function Loading({
  inputData,
  frozenTime,
  unofficialContestants,
  hideUnofficialContestants,
  dataUrl,
  imageUrl,
  setLoading,
  setInputData,
  setImageData,
  setFrozenTime,
  setUnofficialContestants,
  setHideUnofficialContestants
}: {
  inputData: InputData | null;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
  dataUrl: string | null;
  imageUrl: string | null;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setInputData: Dispatch<SetStateAction<InputData | null>>;
  setImageData: Dispatch<SetStateAction<AwardImageMap>>;
  setFrozenTime: Dispatch<SetStateAction<number>>;
  setUnofficialContestants: Dispatch<SetStateAction<string[]>>;
  setHideUnofficialContestants: Dispatch<SetStateAction<boolean>>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DropKind | null>(null);
  const [dataFileName, setDataFileName] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);
  // True until every `?data=` / `?image=` fetch from the URL has settled
  // (success or failure). Gates the Run button so the user can't proceed
  // before the image arrives, which would otherwise mean awards silently
  // render without art.
  const [urlFetchPending, setUrlFetchPending] = useState<boolean>(
    !!dataUrl || !!imageUrl
  );

  // Share-link modal state. Pre-fill from the URL the page was opened with
  // (if any) so a recipient re-sharing the same contest doesn't have to
  // re-type the hosted URLs.
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareDataUrl, setShareDataUrl] = useState(dataUrl ?? '');
  const [shareImageUrl, setShareImageUrl] = useState(imageUrl ?? '');
  const [copyToast, setCopyToast] = useState<string | null>(null);

  // Live-update preview URL. Includes ceremony settings even if no data URL
  // is provided — the recipient sees a pre-filled loading screen and has to
  // upload their own files.
  const generatedShareUrl = useMemo(() => {
    const params: Record<string, string> = {};
    if (shareDataUrl) params.data = shareDataUrl;
    if (shareImageUrl) params.image = shareImageUrl;
    if (frozenTime !== 240) params.frozenTime = String(frozenTime);
    if (unofficialContestants.length > 0)
      params.unofficial = unofficialContestants.join(',');
    if (!hideUnofficialContestants) params.hideUnofficial = '0';
    const search = queryString.stringify(params);
    const { origin, pathname } = window.location;
    return search ? `${origin}${pathname}?${search}` : `${origin}${pathname}`;
  }, [
    shareDataUrl,
    shareImageUrl,
    frozenTime,
    unofficialContestants,
    hideUnofficialContestants
  ]);

  // Track the pending toast timer so unmount (or rapid re-clicks) doesn't
  // leave stale timers firing setState on an unmounted component.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleCopyShareLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(generatedShareUrl);
      setCopyToast('Copied to clipboard');
    } catch {
      setCopyToast('Copy failed — select the link above to copy manually');
    }
    if (toastTimerRef.current !== null) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setCopyToast(null);
      toastTimerRef.current = null;
    }, 2500);
  }, [generatedShareUrl]);

  const loadData = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = await readJsonFile(file, parseInputData);
        setInputData(parsed);
        setDataFileName(file.name);
      } catch (e) {
        setError(`Couldn't parse data file: ${(e as Error).message}`);
        setDataFileName(null);
      }
    },
    [setInputData]
  );

  const loadImage = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const parsed = await readJsonFile(file, (raw) => raw as AwardImageMap);
        setImageData(parsed);
        setImageFileName(file.name);
      } catch (e) {
        setError(`Couldn't parse image file: ${(e as Error).message}`);
        setImageFileName(null);
      }
    },
    [setImageData]
  );

  // Auto-fetch data/image when the page is opened with `?data=...` / `?image=...`.
  // Data and image are independent — image is documented as optional in the
  // share-link modal, so a data-only URL must still load.
  useEffect(() => {
    if (!dataUrl && !imageUrl) return;
    let cancelled = false;
    const run = async () => {
      if (dataUrl) {
        try {
          const raw = await (await fetch(dataUrl)).json();
          if (cancelled) return;
          setInputData(parseInputData(raw));
          setDataFileName(urlBasename(dataUrl));
        } catch (e) {
          if (cancelled) return;
          setError(`Couldn't load data URL: ${(e as Error).message}`);
        }
      }
      if (imageUrl) {
        try {
          const raw = (await (await fetch(imageUrl)).json()) as AwardImageMap;
          if (cancelled) return;
          setImageData(raw);
          setImageFileName(urlBasename(imageUrl));
        } catch (e) {
          if (cancelled) return;
          setError(`Couldn't load image URL: ${(e as Error).message}`);
        }
      }
      if (!cancelled) setUrlFetchPending(false);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [dataUrl, imageUrl, setInputData, setImageData]);

  const onDataChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) loadData(f);
    },
    [loadData]
  );

  const onImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) loadImage(f);
    },
    [loadImage]
  );

  const handleFrozenTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const raw = (e.target as HTMLInputElement).value;
      const n = parseInt(raw, 10);
      setFrozenTime(Math.max(0, Number.isFinite(n) ? n : 0));
    },
    [setFrozenTime]
  );

  const handleSelectChange = useCallback(
    (selectedOptions: MultiValue<{ value: string; label: string }>) => {
      setUnofficialContestants(selectedOptions.map((option) => option.value));
    },
    [setUnofficialContestants]
  );

  const handleCheckboxChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      setHideUnofficialContestants((e.target as HTMLInputElement).checked);
    },
    [setHideUnofficialContestants]
  );

  const handleSubmit = useCallback(() => {
    setLoading(false);
  }, [setLoading]);

  const usernames = useMemo(
    () =>
      inputData?.users?.map((user) => ({
        value: user.username,
        label: user.username
      })) ?? [],
    [inputData]
  );

  // Track dragenter/dragleave with a counter — `dragleave` fires on every
  // child boundary crossing, so the "leave the whole dropzone" event can't be
  // identified by inspecting `target`. Counting enters vs leaves makes it
  // robust against hovering over child elements.
  const dragDepth = useRef<Record<DropKind, number>>({ data: 0, image: 0 });
  const dropHandlers = useCallback(
    (kind: DropKind, loader: (f: File) => void) => ({
      onDragEnter: (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[kind] += 1;
        if (dragDepth.current[kind] === 1) setDragOver(kind);
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[kind] = Math.max(0, dragDepth.current[kind] - 1);
        if (dragDepth.current[kind] === 0) setDragOver(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        dragDepth.current[kind] = 0;
        setDragOver(null);
        const f = e.dataTransfer.files?.[0];
        if (f) loader(f);
      }
    }),
    []
  );

  return (
    <form className="loading-form" onSubmit={(e) => e.preventDefault()}>
      <span className="subtitle">Contest reveal · press H for shortcuts</span>
      <div
        className={`form-group dropzone${dragOver === 'data' ? ' drag-over' : ''}${dataFileName ? ' has-file' : ''}`}
        {...dropHandlers('data', loadData)}
      >
        <label htmlFor="data-input">Data</label>
        <input id="data-input" type="file" onChange={onDataChange} />
        {dataFileName && (
          <span className="file-name" title={dataFileName}>
            {dataFileName}
          </span>
        )}
        <span className="dropzone-hint">or drop a .json file here</span>
      </div>
      <div
        className={`form-group dropzone${dragOver === 'image' ? ' drag-over' : ''}${imageFileName ? ' has-file' : ''}`}
        {...dropHandlers('image', loadImage)}
      >
        <label htmlFor="image-input">Image</label>
        <input id="image-input" type="file" onChange={onImageChange} />
        {imageFileName && (
          <span className="file-name" title={imageFileName}>
            {imageFileName}
          </span>
        )}
        <span className="dropzone-hint">or drop a .json file here</span>
      </div>
      <div className="form-group">
        <label htmlFor="frozen-input">
          Frozen time (since start of contest)
        </label>
        <input
          id="frozen-input"
          type="number"
          value={frozenTime}
          onChange={handleFrozenTimeChange}
        />
      </div>
      <div className="form-group">
        <Select
          placeholder="Unofficial contestants"
          options={usernames}
          isMulti={true}
          closeMenuOnSelect={false}
          hideSelectedOptions={false}
          onChange={handleSelectChange}
        />
      </div>
      <div className="form-group form-check">
        <input
          id="hide-unofficial"
          type="checkbox"
          checked={hideUnofficialContestants}
          onChange={handleCheckboxChange}
        />
        <label htmlFor="hide-unofficial">Hide unofficial contestants</label>
      </div>
      {error && (
        <div className="error-toast" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => setShowShareModal(true)}
        >
          Generate share link
        </button>
        <button
          type="button"
          className="primary"
          disabled={!inputData || urlFetchPending}
          onClick={handleSubmit}
          title={urlFetchPending ? 'Loading data/image from URL…' : undefined}
        >
          {urlFetchPending ? 'Loading…' : 'Run'}
        </button>
      </div>
      {showShareModal && (
        <div
          className="share-modal-overlay"
          onClick={() => setShowShareModal(false)}
        >
          <div className="share-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Generate share link</h3>
            <p className="hint">
              Paste public URLs for your hosted data and image files. Local file
              uploads can&apos;t be embedded — host the JSON on a gist, S3, or
              your own server first. The link also captures ceremony settings
              (frozen time, unofficial contestants, hide flag).
            </p>
            <label className="share-field">
              <span>Data URL</span>
              <input
                type="url"
                value={shareDataUrl}
                placeholder="https://example.com/data.json"
                onChange={(e) => setShareDataUrl(e.target.value)}
              />
            </label>
            <label className="share-field">
              <span>
                Image URL <em>(optional)</em>
              </span>
              <input
                type="url"
                value={shareImageUrl}
                placeholder="https://example.com/images.json"
                onChange={(e) => setShareImageUrl(e.target.value)}
              />
            </label>
            <label className="share-field">
              <span>Generated link</span>
              <textarea
                readOnly
                rows={3}
                value={generatedShareUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
            </label>
            {copyToast && (
              <div className="share-toast" role="status">
                {copyToast}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setShowShareModal(false)}
              >
                Close
              </button>
              <button
                type="button"
                className="primary"
                onClick={handleCopyShareLink}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

function FpsHud() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames++;
      const elapsed = now - last;
      if (elapsed >= 250) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div className="fps-hud">{fps} fps</div>;
}

function Ranking({
  inputData,
  imageData,
  frozenTime,
  unofficialContestants,
  hideUnofficialContestants
}: {
  inputData: InputData;
  imageData: AwardImageMap;
  frozenTime: number;
  unofficialContestants: string[];
  hideUnofficialContestants: boolean;
}) {
  const _inputData = useMemo(
    () =>
      !hideUnofficialContestants
        ? inputData
        : {
            ...inputData,
            users: inputData.users.filter(
              (user) => !unofficialContestants.includes(user.username)
            )
          },
    [inputData, unofficialContestants, hideUnofficialContestants]
  );

  const {
    data,
    currentRowIndex,
    markedUserId,
    markedProblemId,
    imageSrc,
    step,
    rollback
  } = useResolver({
    inputData: _inputData,
    imageData,
    unofficialContestants,
    frozenTime: frozenTime * 60
  });

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // steps per second
  const [showControls, setShowControls] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showFps, setShowFps] = useState(false);

  // Pause autoplay on any manual keypress so user can take over instantly.
  const pause = useCallback(() => setPlaying(false), []);
  const manualStep = useCallback(
    (choice?: number) => {
      pause();
      step(choice);
    },
    [pause, step]
  );
  const manualRollback = useCallback(() => {
    pause();
    rollback();
  }, [pause, rollback]);

  // All shortcuts except H are gated on `!showHelp` so they don't reach
  // through the modal. H stays active so it can also close the modal.
  const shortcutsEnabled = !showHelp;
  useKeyPress('ArrowLeft', manualRollback, shortcutsEnabled);
  useKeyPress('ArrowRight', manualStep, shortcutsEnabled);
  useKeyPress('1', () => manualStep(0), shortcutsEnabled);
  useKeyPress('2', () => manualStep(1), shortcutsEnabled);
  useKeyPress('3', () => manualStep(2), shortcutsEnabled);
  useKeyPress('4', () => manualStep(3), shortcutsEnabled);
  useKeyPress('5', () => manualStep(4), shortcutsEnabled);
  useKeyPress('6', () => manualStep(5), shortcutsEnabled);
  useKeyPress('7', () => manualStep(6), shortcutsEnabled);
  useKeyPress('8', () => manualStep(7), shortcutsEnabled);
  useKeyPress('9', () => manualStep(8), shortcutsEnabled);
  useKeyPress(' ', () => setPlaying((p) => !p), shortcutsEnabled);
  useKeyPress('c', () => setShowControls((s) => !s), shortcutsEnabled);
  // H toggles regardless of `shortcutsEnabled` so it can also close the modal.
  useKeyPress('h', () => setShowHelp((s) => !s));
  useKeyPress('f', () => setShowFps((s) => !s), shortcutsEnabled);

  // Auto-pause when the reveal finishes.
  useEffect(() => {
    if (currentRowIndex < 0 && playing) setPlaying(false);
  }, [currentRowIndex, playing]);

  // Confetti every time imageSrc transitions to a new non-null value — fires on
  // forward reveal AND when rolling back into an award. Tracked via prev ref
  // (not transition source) so StrictMode's double-effect doesn't double-fire.
  const prevImageSrc = useRef(imageSrc);
  useEffect(() => {
    if (imageSrc !== null && imageSrc !== prevImageSrc.current) {
      fireAwardConfetti();
    }
    prevImageSrc.current = imageSrc;
  }, [imageSrc]);

  // Keep a live ref to step so the autoplay interval below doesn't tear down
  // and rebuild every time a dispatch updates `step`'s identity (it depends on
  // `data`, which changes on every event). Without this, at high speeds the
  // interval can effectively halve as it's cleared just before firing.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // Autoplay loop. Suspended while help overlay is open.
  useEffect(() => {
    if (!playing || showHelp) return;
    const id = setInterval(() => stepRef.current(), 1000 / speed);
    return () => clearInterval(id);
  }, [playing, showHelp, speed]);

  return (
    <>
      <Suspense fallback={<div className="canvas-fallback">Loading…</div>}>
        <Scoreboard
          data={data}
          problems={inputData.problems}
          currentRowIndex={currentRowIndex}
          markedUserId={markedUserId}
          markedProblemId={markedProblemId}
        />
      </Suspense>
      {imageSrc !== null && (
        <div className="award-overlay">
          <img src={imageSrc} alt="" />
        </div>
      )}
      {showFps && <FpsHud />}
      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-card" onClick={(e) => e.stopPropagation()}>
            <h2>Keyboard shortcuts</h2>
            <dl>
              <dt>
                <kbd>→</kbd>
              </dt>
              <dd>Step forward</dd>
              <dt>
                <kbd>←</kbd>
              </dt>
              <dd>Step back</dd>
              <dt>
                <kbd>1</kbd>–<kbd>9</kbd>
              </dt>
              <dd>Reveal the N-th pending submission for the current user</dd>
              <dt>
                <kbd>Space</kbd>
              </dt>
              <dd>Play / pause autoplay</dd>
              <dt>
                <kbd>C</kbd>
              </dt>
              <dd>Toggle autoplay controls</dd>
              <dt>
                <kbd>F</kbd>
              </dt>
              <dd>Toggle FPS counter</dd>
              <dt>
                <kbd>H</kbd>
              </dt>
              <dd>Toggle this help</dd>
            </dl>
            <p className="hint">Click anywhere or press H to close.</p>
          </div>
        </div>
      )}
      {showControls && (
        <div className="controls">
          <button
            type="button"
            className="play-btn"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <label className="speed">
            <span>{speed.toFixed(1)}×</span>
            <input
              type="range"
              min={0.2}
              max={5}
              step={0.1}
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
            />
          </label>
        </div>
      )}
    </>
  );
}

// Query params we read on mount only. `data` / `image` are fetched; the others
// seed UI state so a shared link lands the recipient on a pre-filled loading
// screen. The URL is *not* kept in sync after mount — the "Copy share link"
// button on the loading screen builds a fresh URL from current state on demand.
// Defaults: frozenTime=240, hideUnofficial=1 (true), unofficial=[].
function readUrlConfig() {
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

  // (URL-fetch lives in <Loading> so it can update the form's filename/error
  // state alongside the data it fetches.)

  return (
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
        ></Ranking>
      )}
    </div>
  );
}

export default App;
