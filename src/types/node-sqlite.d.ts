declare module 'node:sqlite' {
  export interface RunResult {
    lastInsertRowid: number | bigint;
    changes: number | bigint;
  }

  export class StatementSync {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
