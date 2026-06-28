import { Config, DbKind, Environment, QueryResult } from "../types/index.js";

/**
 * All adapters extend this. Subclasses implement connect/disconnect/ping/executeRaw.
 * executeRaw receives a string operation name and typed params — each adapter
 * interprets these in its own way (SQL string, mongo command object, redis command array).
 */
export abstract class DatabaseAdapter {
  abstract readonly kind: DbKind;

  constructor(
    public readonly connectionName: string,
    public readonly environment: Environment,
  ) {}

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract ping(): Promise<boolean>;
  abstract executeRaw(
    operation: string,
    params: unknown[],
  ): Promise<QueryResult>;
}
