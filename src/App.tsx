import React, { Dispatch, SetStateAction, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table';
import { motion, AnimatePresence } from 'framer-motion';

import './App.css';
import { InputData, useResolver } from './resolver';

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
      inputData.users = inputData.users.filter((user) =>
        [
          'fextivity',
          'Hollowed',
          'hollwo_pelw',
          'ngpin04',
          'phucthg',
          'nghiass001',
          '6aren',
          'magnified',
          'Khuepr123',
          'flashhh'
        ].includes(user.username)
      );
      setInputData(inputData);
    };
    fileReader.readAsText((e.target as HTMLInputElement).files![0]);
  };

  return (
    <>
      <h1>Upload data:</h1>
      <input type='file' onChange={handleChange} />
    </>
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
      damping: 50,
      stiffness: 100
    }),
    []
  );

  return (
    <>
      <button onClick={() => step()}>Step</button>
      <table>
        <thead>
          {table.getHeaderGroups().map((headerGroup, i) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} colSpan={header.colSpan}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          <AnimatePresence>
            {table.getRowModel().rows.map((row) => {
              const style = {} as React.CSSProperties;
              if (row.original.userId === markedUserId) {
                style.backgroundColor = '#ffa500';
              }
              return (
                <motion.tr
                  key={row.original.userId}
                  layout
                  transition={spring}
                  style={style}
                >
                  {row.getVisibleCells().map((cell) => {
                    const style = {} as React.CSSProperties;
                    const isProblem = cell.column.id.startsWith('problem_');
                    if (
                      isProblem &&
                      cell.row.original.userId === markedUserId &&
                      cell.column.id === `problem_${markedProblemId}`
                    ) {
                      style.backgroundColor = '#00ff00';
                    }
                    return (
                      <motion.td
                        key={cell.id}
                        layout
                        transition={spring}
                        style={style}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </motion.td>
                    );
                  })}
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
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
