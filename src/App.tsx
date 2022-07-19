import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useMemo,
  useState
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { motion } from 'framer-motion';

import Select, { MultiValue } from 'react-select';

import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Table from 'react-bootstrap/Table';
import 'bootstrap/dist/css/bootstrap.min.css';

import './App.css';
import { useKeyPress } from './hooks';
import { InputData, ProblemAttemptStatus, useResolver } from './resolver';

function Loading({
  inputData,
  frozenTime,
  setLoading,
  setInputData,
  setFrozenTime,
  setUnofficialContestants
}: {
  inputData: InputData | null;
  frozenTime: number;
  setLoading: Dispatch<SetStateAction<boolean>>;
  setInputData: Dispatch<SetStateAction<InputData | null>>;
  setFrozenTime: Dispatch<SetStateAction<number>>;
  setUnofficialContestants: Dispatch<SetStateAction<string[]>>;
}) {
  const handleFileChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const fileReader = new FileReader();
      fileReader.onload = () => {
        const inputData = JSON.parse(fileReader.result as string) as InputData;
        inputData.submissions = inputData.submissions.map((submission) => ({
          ...submission,
          time: parseFloat(submission.time as any)
        }));
        setInputData(inputData);
      };
      fileReader.readAsText((e.target as HTMLInputElement).files![0]);
    },
    [setInputData]
  );

  const handleFrozenTimeChange = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
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
    <Form className='w-50 mt-5 mx-auto'>
      <Form.Group className='mb-3'>
        <Form.Label>Data</Form.Label>
        <Form.Control type='file' onChange={handleFileChange as any} />
      </Form.Group>
      <Form.Group className='mb-3'>
        <Form.Label>Frozen time (since start of contest)</Form.Label>
        <Form.Control
          type='number'
          value={frozenTime}
          onChange={handleFrozenTimeChange as any}
        />
      </Form.Group>{' '}
      <Form.Group className='mb-3 '>
        <Select
          placeholder='Unofficial contestants'
          options={usernames}
          isMulti={true}
          onChange={handleSelectChange}
        />
      </Form.Group>
      <Button variant='primary' disabled={!inputData} onClick={handleSubmit}>
        Run
      </Button>
    </Form>
  );
}

function Ranking({
  inputData,
  frozenTime,
  unofficialContestants
}: {
  inputData: InputData;
  frozenTime: number;
  unofficialContestants: string[];
}) {
  const { columns, data, markedUserId, markedProblemId, step } = useResolver({
    inputData,
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

  useKeyPress('Enter', step);

  return (
    <>
      <Table className='ranking-table'>
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
                      <div className='point-denominator'>
                        {header.column.columnDef.meta?.points!}
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const style = {} as React.CSSProperties;
            if (row.original.userId === markedUserId) {
              style.backgroundColor = '#ced4da';
            }

            return (
              <motion.tr
                style={style}
                key={row.original.userId}
                layout
                transition={spring}
              >
                {row.getVisibleCells().map((cell) => {
                  const isProblem = !!cell.column.columnDef.meta?.isProblem;
                  if (!isProblem) {
                    if (cell.column.columnDef.id === 'total') {
                    }
                    return (
                      <td
                        key={cell.id}
                        className={
                          cell.column.columnDef.id === 'total'
                            ? 'user-points'
                            : ''
                        }
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    );
                  }

                  const style = {} as React.CSSProperties;
                  if (
                    isProblem &&
                    cell.row.original.userId === markedUserId &&
                    cell.column.id === `problem_${markedProblemId}`
                  ) {
                    style.backgroundColor = 'black';
                  }

                  const problemId = cell.column.columnDef.meta?.problemId!;
                  const submissionPoints = cell.getValue() as number;
                  const status = cell.row.original.status[problemId];
                  const isPending = !!(status & ProblemAttemptStatus.PENDING);
                  const className = isPending
                    ? 'pending-score'
                    : status === ProblemAttemptStatus.ACCEPTED
                    ? 'full-score'
                    : status === ProblemAttemptStatus.PARTIAL
                    ? 'partial-score'
                    : status === ProblemAttemptStatus.INCORRECT
                    ? 'failed-score'
                    : '';

                  return (
                    <td className={className} style={style} key={cell.id}>
                      {status !== ProblemAttemptStatus.UNATTEMPTED &&
                        submissionPoints}
                      {isPending && <span>?</span>}
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
  const [frozenTime, setFrozenTime] = useState<number>(90);
  const [unofficialContestants, setUnofficialContestants] = useState<string[]>(
    []
  );

  return (
    <div className='App'>
      {loading || !inputData ? (
        <Loading
          inputData={inputData}
          frozenTime={frozenTime}
          setLoading={setLoading}
          setInputData={setInputData}
          setFrozenTime={setFrozenTime}
          setUnofficialContestants={setUnofficialContestants}
        />
      ) : (
        <Ranking
          inputData={inputData}
          frozenTime={frozenTime}
          unofficialContestants={unofficialContestants}
        ></Ranking>
      )}
    </div>
  );
}

export default App;
