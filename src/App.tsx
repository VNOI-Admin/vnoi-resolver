import React, { Dispatch, SetStateAction, useState } from 'react';
import { useTable } from 'react-table';
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
  const { columns, data, step } = useResolver({ inputData });

  const { getTableProps, getTableBodyProps, headerGroups, rows, prepareRow } =
    useTable({
      columns,
      data
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
      <button onClick={() => step()}>AAAAAAAAa</button>
      <table {...getTableProps()}>
        <thead>
          {headerGroups.map((headerGroup, i) => (
            <tr {...headerGroup.getHeaderGroupProps()}>
              {headerGroup.headers.map((column) => (
                <th
                  {...column.getHeaderProps({
                    style: {
                      minWidth: column.minWidth
                    }
                  })}
                >
                  <div>{column.render('Header')}</div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody {...getTableBodyProps()}>
          <AnimatePresence>
            {rows.map((row, i) => {
              prepareRow(row);
              return (
                <motion.tr
                  layout
                  transition={spring}
                  {...row.getRowProps({ key: (row.original as any).userId })}
                >
                  {row.cells.map((cell, i) => {
                    return (
                      <motion.td
                        layout
                        transition={spring}
                        {...cell.getCellProps()}
                      >
                        {cell.render('Cell')}
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
