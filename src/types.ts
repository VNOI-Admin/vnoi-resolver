declare module '@tanstack/table-core' {
  interface ColumnMeta {
    isProblem?: boolean;
    problemId?: number;
    points?: number;
  }
}

export {};
