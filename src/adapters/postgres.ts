import { Pool, PoolConfig } from "pg";
import { BaseAdapter } from "./base.js";
import { Environment, PostgresConnection, QueryResult } from "../types/index.js";

export class PostgresAdapter extends BaseAdapter {
  readonly kind = "postgres" as const;
  private pool: Pool | null = null;

  constructor(
    connectionName: string,
    environment: Environment,
    private readonly config: PostgresConnection & { host: string; port: number }
  ) {
    super(connectionName, environment);
  }

  async connect(): Promise<void> {
    const cfg: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
      max: 5,
      idleTimeoutMillis: 30_000,
    };
    this.pool = new Pool(cfg);
    await this.pool.query("SELECT 1"); // validate connection
  }

  async disconnect(): Promise<void> {
    await this.pool?.end();
    this.pool = null;
  }

  async ping(): Promise<boolean> {
    try {
      await this.pool?.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * operation: SQL query string
   * params[0]: array of bind parameters (optional)
   */
  async executeRaw(operation: string, params: unknown[]): Promise<QueryResult> {
    if (!this.pool) throw new Error(`[postgres:${this.connectionName}] Not connected`);
    const bindParams = (params[0] as unknown[]) ?? [];
    const result = await this.pool.query(operation, bindParams);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0,
    };
  }

  /** Convenience: list all tables in the public schema */
  async listTables(): Promise<string[]> {
    const result = await this.executeRaw(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`,
      []
    );
    return (result.rows as { table_name: string }[]).map((r) => r.table_name);
  }

  /** Convenience: describe a table's columns */
  async describeTable(table: string): Promise<QueryResult> {
    return this.executeRaw(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [[table]]
    );
  }
}
