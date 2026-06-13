import { getEnvironmentEntry } from "../config/index.js";
import { openTunnel } from "../tunnel/manager.js";
import { DatabaseAdapter, DatabaseConnection, Environment } from "../types/index.js";
import { MongoAdapter } from "./mongodb.js";
import { PostgresAdapter } from "./postgres.js";
import { RedisAdapter } from "./redis.js";

/** Live adapter instances, keyed by "envName/connectionName" */
const adapters = new Map<string, DatabaseAdapter>();

function adapterKey(envName: string, connectionName: string): string {
  return `${envName}/${connectionName}`;
}

/**
 * Builds a connected adapter for the given env + connection.
 * For dev/prod, rewrites host/port to go through an SSH tunnel first.
 */
async function buildAdapter(
  envName: string,
  connectionName: string,
  conn: DatabaseConnection,
  entry: ReturnType<typeof getEnvironmentEntry>
): Promise<DatabaseAdapter> {
  const environment: Environment = entry.environment;
  const needsTunnel = environment !== "local";
  const ssh = entry.ssh;

  switch (conn.kind) {
    case "postgres": {
      let host = conn.host;
      let port = conn.port;
      if (needsTunnel && ssh) {
        port = await openTunnel(ssh, conn.host, conn.port);
        host = "127.0.0.1";
      }
      return new PostgresAdapter(connectionName, environment, { ...conn, host, port });
    }

    case "mongodb": {
      let uri = conn.uri;
      if (needsTunnel && ssh) {
        const url = new URL(conn.uri);
        const remoteHost = url.hostname;
        const remotePort = parseInt(url.port || "27017", 10);
        const localPort = await openTunnel(ssh, remoteHost, remotePort);
        url.hostname = "127.0.0.1";
        url.port = String(localPort);
        uri = url.toString();
      }
      return new MongoAdapter(connectionName, environment, { ...conn, uri });
    }

    case "redis": {
      let host = conn.host;
      let port = conn.port;
      if (needsTunnel && ssh) {
        port = await openTunnel(ssh, conn.host, conn.port);
        host = "127.0.0.1";
      }
      return new RedisAdapter(connectionName, environment, { ...conn, host, port });
    }
  }
}

/**
 * Returns (and lazily connects) an adapter for the given env + connection.
 */
export async function getAdapter(
  envName: string,
  connectionName: string
): Promise<DatabaseAdapter> {
  const key = adapterKey(envName, connectionName);
  if (adapters.has(key)) return adapters.get(key)!;

  const entry = getEnvironmentEntry(envName);
  const conn = entry.connections[connectionName];
  if (!conn) {
    throw new Error(
      `Unknown connection "${connectionName}" in environment "${envName}". ` +
        `Available: ${Object.keys(entry.connections).join(", ")}`
    );
  }

  const adapter = await buildAdapter(envName, connectionName, conn, entry);
  await adapter.connect();
  adapters.set(key, adapter);
  return adapter;
}

/**
 * Eagerly connects all connections in an environment.
 * Useful for startup validation; errors are logged but non-fatal.
 */
export async function connectAll(envName: string): Promise<void> {
  const entry = getEnvironmentEntry(envName);
  for (const connName of Object.keys(entry.connections)) {
    try {
      await getAdapter(envName, connName);
      console.error(`[registry] Connected ${envName}/${connName}`);
    } catch (err) {
      console.error(`[registry] Failed to connect ${envName}/${connName}:`, err);
    }
  }
}

export function listAdapters(): Array<{ key: string; kind: string; environment: string }> {
  return [...adapters.entries()].map(([key, a]) => ({
    key,
    kind: a.kind,
    environment: a.environment,
  }));
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...adapters.values()].map((a) => a.disconnect()));
  adapters.clear();
}
