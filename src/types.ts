import { RowData } from '@tanstack/react-table';

declare module '@tanstack/table-core' {
  // Type parameter names must match the upstream ColumnMeta declaration for
  // module augmentation merging, so we can't rename them to silence the unused-vars rule.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    isProblem?: boolean;
    problemId?: number;
    points?: number;
  }
}

export {};
