// Ambient declaration for node-oracledb@6 (THIN mode).
// The package ships no bundled .d.ts and @types/oracledb is unavailable offline;
// this declares the exact surface db.ts uses, typed faithfully (no `any` escapes to callers).

declare module "oracledb" {
  export interface PoolAttributes {
    user?: string;
    password?: string;
    connectString?: string;
    configDir?: string;
    walletLocation?: string;
    walletPassword?: string;
    poolMin?: number;
    poolMax?: number;
    queueTimeout?: number;
    queueMax?: number;
  }

  export type BindParameters = Record<string, unknown> | unknown[];

  export interface ExecuteOptions {
    outFormat?: number;
    autoCommit?: boolean;
  }

  export interface Result<T> {
    rows?: T[];
    rowsAffected?: number;
  }

  export interface Connection {
    execute<T = unknown>(
      sql: string,
      binds?: BindParameters,
      opts?: ExecuteOptions,
    ): Promise<Result<T>>;
    commit(): Promise<void>;
    close(): Promise<void>;
  }

  export interface Pool {
    getConnection(): Promise<Connection>;
    close(drainTime?: number): Promise<void>;
  }

  export const OUT_FORMAT_OBJECT: number;
  export const OUT_FORMAT_ARRAY: number;

  export function createPool(attrs: PoolAttributes): Promise<Pool>;

  const oracledb: {
    createPool(attrs: PoolAttributes): Promise<Pool>;
    OUT_FORMAT_OBJECT: number;
    OUT_FORMAT_ARRAY: number;
  };
  export default oracledb;
}
