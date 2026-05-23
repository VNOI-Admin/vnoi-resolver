import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { motion, Target } from 'framer-motion';
import queryString from 'query-string';

import Select, { MultiValue } from 'react-select';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
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

  const spring = React.useMemo(
    () => ({
      type: 'spring',
      bounce: 0,
      damping: 30,
      stiffness: 100
    }),
    []
  );

  const scrollRowIndex = Math.max(0, currentRowIndex - 12);

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

  useEffect(() => {
    const interval = setInterval(() => {
      if (currentRowIndex === data.length - 1) {
        document.getElementById('end-row')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'start'
        });
      } else if (currentRowIndex < 12) {
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      } else {
        document.getElementById('scroll-row')?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'start'
        });
      }
    }, 50);
    return () => clearInterval(interval);
  });

  if (imageSrc !== null) {
    return (
      <div className="d-flex align-items-center h-100">
        <img className="mx-auto" src={imageSrc} alt="" />;
      </div>
    );
  }

  return (
    <>
      <Table striped className="ranking-table">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const isProblem = !!header.column.columnDef.meta?.isProblem;
                return (
                  <th key={header.id} colSpan={header.colSpan}>
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
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, ind) => {
            let className = '';
            const animate = {} as Target;
            if (row.original.userId === markedUserId) {
              className = 'current-row';
              animate.position = 'relative';
              animate.zIndex = 999;
            }

            return (
              <motion.tr
                className={className}
                animate={animate}
                key={row.original.userId}
                transition={spring}
                layout
                {...(ind === scrollRowIndex ? { id: 'scroll-row' } : {})}
                {...(ind === data.length - 1 ? { id: 'end-row' } : {})}
              >
                {row.getVisibleCells().map((cell) => {
                  if (
                    cell.column.columnDef.id === 'rank' ||
                    cell.column.columnDef.id === 'total'
                  ) {
                    return (
                      <td key={cell.id} className={'user-points'}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  }

                  if (cell.column.columnDef.id === 'penalty') {
                    return (
                      <td key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  }

                  if (cell.column.columnDef.id === 'name') {
                    const { fullName, username } = cell.getValue() as {
                      fullName: string;
                      username: string;
                    };
                    return (
                      <td key={cell.id}>
                        <b>{fullName}</b>
                        &nbsp;({username})
                      </td>
                    );
                  }

                  const problemId = cell.column.columnDef.meta!.problemId!;
                  const submissionPoints = cell.getValue() as number;
                  const status = cell.row.original.status[problemId];
                  const scoreClass = cell.row.original.scoreClass[problemId];
                  const isPending = !!(status & ProblemAttemptStatus.PENDING);
                  let className =
                    'score-cell ' + (isPending ? 'score_pending' : scoreClass);

                  if (
                    cell.row.original.userId === markedUserId &&
                    cell.column.id === `problem_${markedProblemId}`
                  ) {
                    className += ' highlighted-cell';
                  }

                  return (
                    <td key={cell.id}>
                      <div className={className}>
                        {status !== ProblemAttemptStatus.UNATTEMPTED &&
                          submissionPoints}
                        {isPending && <span>?</span>}
                      </div>
                    </td>
                  );
                })}
              </motion.tr>
            );
          })}
        </tbody>
      </Table>
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
