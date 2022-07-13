import React, { Dispatch, SetStateAction, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { motion } from 'framer-motion';

import Table from 'react-bootstrap/Table';
import Form from 'react-bootstrap/Form';
import 'bootstrap/dist/css/bootstrap.min.css';

import './App.css';
import { useKeyPress } from './hooks';
import { InputData, ProblemAttemptStatus, useResolver } from './resolver';

function Loading({
  setInputData
}: {
  setInputData: Dispatch<SetStateAction<InputData | null>>;
}) {
  const handleChange = (e: React.FormEvent<HTMLInputElement>) => {
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
  };

  return (
    <div style={{ padding: '50px' }}>
      <Form.Group controlId='formFile' className='w-50 mb-3 mx-auto'>
        <Form.Control type='file' onChange={handleChange as any} />
      </Form.Group>
    </div>
  );
}

function Ranking({ inputData }: { inputData: InputData }) {
  const { columns, data, markedUserId, markedProblemId, step } = useResolver({
    inputData,
    freezeTime: 60 * 60
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

  useKeyPress('Shift', step);

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
  const [inputData, setInputData] = useState<InputData | null>(null);

  return (
    <div className='App'>
      {inputData === null ? (
        <Loading setInputData={setInputData} />
      ) : (
        <Ranking inputData={inputData}></Ranking>
      )}
    </div>
  );
}

export default App;
