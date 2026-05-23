import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import queryString from 'query-string';

import Select, { MultiValue } from 'react-select';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import 'bootstrap/dist/css/bootstrap.min.css';

import './App.css';
import { useKeyPress } from './hooks';
import {
  InputData,
  ImageData,
  ProblemAttemptStatus,
  parseInputData,
  useResolver
} from './resolver';

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
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        const inputData = parseInputData(
          JSON.parse(fileReader.result as string)
        );
        setInputData(inputData);
      };
      fileReader.readAsText((e.target as HTMLInputElement).files![0]);
    },
    [setInputData]
  );

  const handleImageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        const imageData = JSON.parse(fileReader.result as string) as ImageData;
        setImageData(imageData);
      };
      fileReader.readAsText((e.target as HTMLInputElement).files![0]);
    },
    [setImageData]
  );

  const handleFrozenTimeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFrozenTime(parseInt((e.target as HTMLInputElement).value));
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

  return (
    <Form className="w-50 mt-5 mx-auto">
      <Form.Group className="mb-3">
        <Form.Label>Data</Form.Label>
        <Form.Control type="file" onChange={handleInputChange} />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Image</Form.Label>
        <Form.Control type="file" onChange={handleImageChange} />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Frozen time (since start of contest)</Form.Label>
        <Form.Control
          type="number"
          value={frozenTime}
          onChange={handleFrozenTimeChange}
        />
      </Form.Group>{' '}
      <Form.Group className="mb-3 ">
        <Select
          placeholder="Unofficial contestants"
          options={usernames}
          isMulti={true}
          onChange={handleSelectChange}
        />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          label="Hide unofficial contestants"
          checked={hideUnofficialContestants}
          onChange={handleCheckboxChange}
        />
      </Form.Group>
      <Button variant="primary" disabled={!inputData} onClick={handleSubmit}>
        Run
      </Button>
    </Form>
  );
}

const ROW_HEIGHT = 50;
const SCROLL_DURATION = 500;

// Manual rAF-based smooth scroll. `element.scrollTo({behavior: 'smooth'})` is
// suppressed in some environments (headless / reduced-motion / certain iframes),
// so we drive scrollTop ourselves.
function animateScroll(
  el: HTMLElement,
  target: number,
  cancelRef: { id: number | null }
) {
  if (cancelRef.id !== null) cancelAnimationFrame(cancelRef.id);
  const start = el.scrollTop;
  const delta = target - start;
  if (delta === 0) return;
  const t0 = performance.now();
  const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / SCROLL_DURATION);
    el.scrollTop = start + delta * ease(t);
    if (t < 1) cancelRef.id = requestAnimationFrame(tick);
    else cancelRef.id = null;
  };
  cancelRef.id = requestAnimationFrame(tick);
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
    columns,
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

  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel()
  });

  const parentRef = useRef<HTMLDivElement>(null);
  const rowEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevPositions = useRef<Map<number, number>>(new Map());
  const scrollRaf = useRef<{ id: number | null }>({ id: null });

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (index) => data[index].userId
  });

  const virtualItems = rowVirtualizer.getVirtualItems();

  // FLIP: animate row reorder via Web Animations API
  useLayoutEffect(() => {
    const newPositions = new Map<number, number>();
    data.forEach((row, index) => {
      newPositions.set(row.userId, index * ROW_HEIGHT);
    });

    for (const vItem of virtualItems) {
      const userId = data[vItem.index].userId;
      const oldY = prevPositions.current.get(userId);
      const newY = newPositions.get(userId)!;
      if (oldY === undefined || oldY === newY) continue;

      const el = rowEls.current.get(userId);
      if (!el) continue;

      el.animate(
        [
          { transform: `translateY(${oldY}px)` },
          { transform: `translateY(${newY}px)` }
        ],
        { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      );
    }

    prevPositions.current = newPositions;
  }, [data, virtualItems]);

  // Keep the floor cursor in view (event-driven; replaces 50ms setInterval).
  // Fires on every dispatch (data identity changes), so re-marks that don't
  // change currentRowIndex still trigger a scroll re-check.
  useEffect(() => {
    const el = parentRef.current;
    if (!el || currentRowIndex < 0) return;
    // The sticky header is in-flow above the body, so its height contributes to
    // scrollTop coordinates. Read it at runtime so we don't hard-code it.
    const header = el.querySelector('.ranking-header') as HTMLElement | null;
    const headerHeight = header?.offsetHeight ?? 0;
    const targetBottom = headerHeight + (currentRowIndex + 1) * ROW_HEIGHT;
    const target = Math.max(0, targetBottom - el.clientHeight);
    animateScroll(el, target, scrollRaf.current);
  }, [currentRowIndex, data]);

  useKeyPress(',', rollback);
  useKeyPress('.', step);
  useKeyPress('1', () => step(0));
  useKeyPress('2', () => step(1));
  useKeyPress('3', () => step(2));
  useKeyPress('4', () => step(3));
  useKeyPress('5', () => step(4));
  useKeyPress('6', () => step(5));
  useKeyPress('7', () => step(6));
  useKeyPress('8', () => step(7));
  useKeyPress('9', () => step(8));

  return (
    <>
      <div
        ref={parentRef}
        className="ranking"
        style={
          {
            '--problems': inputData.problems.length
          } as React.CSSProperties
        }
      >
        <div className="ranking-header">
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => {
              const isProblem = !!header.column.columnDef.meta?.isProblem;
              return (
                <div className="ranking-cell" key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                  {isProblem && (
                    <div className="point-denominator">
                      {header.column.columnDef.meta!.points}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div
          className="ranking-body"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {virtualItems.map((vItem) => {
            const row = table.getRowModel().rows[vItem.index];
            const userId = row.original.userId;
            const isCurrent = userId === markedUserId;
            return (
              <div
                ref={(el) => {
                  if (el) rowEls.current.set(userId, el);
                  else rowEls.current.delete(userId);
                }}
                key={userId}
                className={`ranking-row${isCurrent ? ' current-row' : ''}`}
                data-stripe={vItem.index % 2 === 0 ? 'even' : 'odd'}
                style={{ transform: `translateY(${vItem.start}px)` }}
              >
                {row.getVisibleCells().map((cell) => {
                  if (
                    cell.column.columnDef.id === 'rank' ||
                    cell.column.columnDef.id === 'total'
                  ) {
                    return (
                      <div key={cell.id} className="ranking-cell user-points">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    );
                  }

                  if (cell.column.columnDef.id === 'penalty') {
                    return (
                      <div key={cell.id} className="ranking-cell">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </div>
                    );
                  }

                  if (cell.column.columnDef.id === 'name') {
                    const { fullName, username } = cell.getValue() as {
                      fullName: string;
                      username: string;
                    };
                    return (
                      <div key={cell.id} className="ranking-cell name-cell">
                        <b>{fullName}</b>
                        &nbsp;({username})
                      </div>
                    );
                  }

                  const problemId = cell.column.columnDef.meta!.problemId!;
                  const submissionPoints = cell.getValue() as number;
                  const status = row.original.status[problemId];
                  const scoreClass = row.original.scoreClass[problemId];
                  const isPending = !!(status & ProblemAttemptStatus.PENDING);
                  let pillClass =
                    'score-cell ' + (isPending ? 'score_pending' : scoreClass);

                  if (
                    isCurrent &&
                    cell.column.id === `problem_${markedProblemId}`
                  ) {
                    pillClass += ' highlighted-cell';
                  }

                  return (
                    <div key={cell.id} className="ranking-cell">
                      <div className={pillClass}>
                        {status !== ProblemAttemptStatus.UNATTEMPTED &&
                          submissionPoints}
                        {isPending && <span>?</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {imageSrc !== null && (
        <div className="award-overlay">
          <img src={imageSrc} alt="" />
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
