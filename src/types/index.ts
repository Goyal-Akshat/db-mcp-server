export type Environment = "local" | "dev" | "prod";
export type DbKind = "postgres" | "mongodb" | "redis";
export type OperationClass = "read" | "write" | "dangerous";
export type DBConfig = PostgresConfig | MongoConfig | RedisConfig;

export interface Config {
  connectionName: string;
  environment: Environment;
  kind: DbKind;
  requireSsh: boolean;
  sshConfig?: SshConfig;
  dbConfig: DBConfig;
}

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  privateKey: string;
  privateKeyIsPath: boolean;
  passphrase?: string;
}

// ─── Per-database connection configs ─────────────────────────────────────────

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface MongoConfig {
  uri: string; // full MongoDB URI, e.g. mongodb://user:pass@host:27017/db
  database: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface QueryResult {
  rows?: unknown[];
  rowCount?: number;
  raw?: unknown;
}

// ─── Guardrail types ──────────────────────────────────────────────────────────

export interface PendingOperation {
  id: string;
  connectionName: string;
  environment: Environment;
  dbKind: DbKind;
  operation: string;
  params: unknown[];
  operationClass: OperationClass;
  preview: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface GuardrailResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  pending?: PendingOperation;
  reason?: string;
}
