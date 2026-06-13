export type Environment = "local" | "dev" | "prod";
export type DbKind = "postgres" | "mongodb" | "redis";
export type OperationClass = "read" | "write" | "dangerous";

// ─── SSH config (required for dev/prod) ──────────────────────────────────────

export interface SshConfig {
  host: string;
  port: number;
  username: string;
  /** Path to private key file OR inline private key string */
  privateKey: string;
  /** If the key is a file path (starts with / or ~), it will be read from disk */
  privateKeyIsPath?: boolean;
  passphrase?: string;
}

// ─── Per-database connection configs ─────────────────────────────────────────

export interface PostgresConnection {
  kind: "postgres";
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface MongoConnection {
  kind: "mongodb";
  uri: string; // full MongoDB URI, e.g. mongodb://user:pass@host:27017/db
  database: string;
}

export interface RedisConnection {
  kind: "redis";
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
}

export type DatabaseConnection = PostgresConnection | MongoConnection | RedisConnection;

// ─── Environment entry ────────────────────────────────────────────────────────

export interface EnvironmentEntry {
  environment: Environment;
  /** SSH tunnel config — required when environment is dev or prod */
  ssh?: SshConfig;
  connections: Record<string, DatabaseConnection>;
}

// ─── Top-level config ─────────────────────────────────────────────────────────

export interface AppConfig {
  environments: Record<string, EnvironmentEntry>;
}

// ─── Adapter interface ────────────────────────────────────────────────────────

export interface QueryResult {
  rows?: unknown[];
  rowCount?: number;
  raw?: unknown;
}

export interface DatabaseAdapter {
  readonly kind: DbKind;
  readonly connectionName: string;
  readonly environment: Environment;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  executeRaw(operation: string, params: unknown[]): Promise<QueryResult>;
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
