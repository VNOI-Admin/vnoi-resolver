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
      const inputData = JSON.parse(fileReader.result as string);
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
  const { columns, data, initialize, step } = useResolver({ inputData });

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
      <button onClick={() => initialize(15)}>Initialize</button>
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
            {table.getRowModel().rows.map((row) => (
              <motion.tr key={row.original.userId} layout transition={spring}>
                {row.getVisibleCells().map((cell) => (
                  <motion.td key={cell.id} layout transition={spring}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </motion.td>
                ))}
              </motion.tr>
            ))}
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
