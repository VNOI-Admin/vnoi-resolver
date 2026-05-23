import React, {
  Dispatch,
  SetStateAction,
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
import { InputData, ImageData, parseInputData, useResolver } from './resolver';
import { Scoreboard } from './canvas/Scoreboard';

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

type DropKind = 'data' | 'image';

function Loading({
  inputData,
  frozenTime,
  hideUnofficialContestants,
  setLoading,
  setInputData,
  setImageData,
  setFrozenTime,
  setUnofficialContestants,
  setHideUnofficialContestants
}: {
  inputData: InputData | null;
  frozenTime: number;
  hideUnofficialContestants: boolean;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setInputData: Dispatch<SetStateAction<InputData | null>>;
  setImageData: Dispatch<SetStateAction<ImageData>>;
  setFrozenTime: Dispatch<SetStateAction<number>>;
  setUnofficialContestants: Dispatch<SetStateAction<string[]>>;
  setHideUnofficialContestants: Dispatch<SetStateAction<boolean>>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<DropKind | null>(null);
  const [dataFileName, setDataFileName] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string | null>(null);

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
        const parsed = await readJsonFile(file, (raw) => raw as ImageData);
        setImageData(parsed);
        setImageFileName(file.name);
      } catch (e) {
        setError(`Couldn't parse image file: ${(e as Error).message}`);
        setImageFileName(null);
      }
    },
    [setImageData]
  );

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
      <button
        type="button"
        className="primary"
        disabled={!inputData}
        onClick={handleSubmit}
      >
        Run
      </button>
    </form>
  );
}

function Ranking({
  inputData,
  imageData,
  frozenTime,
  unofficialContestants,
  hideUnofficialContestants
}: {
  inputData: InputData;
  imageData: ImageData;
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

  // All non-Escape shortcuts are gated on `!showHelp` so they don't reach
  // through the modal. Escape stays active so it can close the modal.
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
  useKeyPress('h', () => setShowHelp((s) => !s), shortcutsEnabled);
  useKeyPress('Escape', () => setShowHelp(false));

  // Auto-pause when the reveal finishes.
  useEffect(() => {
    if (currentRowIndex < 0 && playing) setPlaying(false);
  }, [currentRowIndex, playing]);

  // Confetti the first time we see each award image. Rolling back past an
  // award and re-stepping forward won't re-fire on the same image.
  const celebrated = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (imageSrc !== null && !celebrated.current.has(imageSrc)) {
      celebrated.current.add(imageSrc);
      fireAwardConfetti();
    }
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
      <Scoreboard
        data={data}
        problems={inputData.problems}
        currentRowIndex={currentRowIndex}
        markedUserId={markedUserId}
        markedProblemId={markedProblemId}
      />
      {imageSrc !== null && (
        <div className="award-overlay">
          <img src={imageSrc} alt="" />
        </div>
      )}
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
                <kbd>H</kbd>
              </dt>
              <dd>Toggle this help</dd>
            </dl>
            <p className="hint">Click anywhere or press Esc to close.</p>
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

function App() {
  const [loading, setLoading] = useState<boolean>(true);
  const [inputData, setInputData] = useState<InputData | null>(null);
  const [imageData, setImageData] = useState<ImageData>({});
  const [frozenTime, setFrozenTime] = useState<number>(240);
  const [unofficialContestants, setUnofficialContestants] = useState<string[]>(
    []
  );
  const [hideUnofficialContestants, setHideUnofficialContestants] =
    useState(true);

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

  useEffect(() => {
    const load = async () => {
      const params = queryString.parse(window.location.search);
      if ('data' in params && 'image' in params) {
        const rawData = await (await fetch(params.data as string)).json();
        const image = (await (
          await fetch(params.image as string)
        ).json()) as ImageData;
        setInputData(parseInputData(rawData));
        setImageData(image);
      }
    };

    load();
  }, []);

  return (
    <div className="App">
      {loading || !inputData ? (
        <Loading
          inputData={inputData}
          frozenTime={frozenTime}
          hideUnofficialContestants={hideUnofficialContestants}
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
