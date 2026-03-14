/// <reference types="nuxt/schema" />

declare module 'better-sqlite3' {
  interface Database {
    exec(sql: string): void;
    prepare<T = unknown>(sql: string): Statement<T>;
  }

  interface Statement<T> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): T;
    all(...params: unknown[]): T[];
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  function Database(filename: string): Database;
  export = Database;
}
