import { getAvailableConfigs, getConfig } from "../config/index.js";
import { openTunnel } from "../tunnel/manager.js";
import {
  Config,
  DbKind,
  Environment,
  MongoConfig,
  PostgresConfig,
  RedisConfig,
} from "../types/index.js";
import { DatabaseAdapter } from "./dbAdapter.js";
import { MongoAdapter } from "./mongodb.js";
import { PostgresAdapter } from "./postgres.js";
import { RedisAdapter } from "./redis.js";

/** Live adapter instances, keyed by "envName/connectionName" */
const adapters = new Map<string, DatabaseAdapter>();

/**
 * Builds a connected adapter for the given env + connection.
 * For dev/prod, rewrites host/port to go through an SSH tunnel first.
 */
async function buildAdapter(config: Config): Promise<DatabaseAdapter> {
  const requireSsh = config.requireSsh;
  const sshConfig = config.sshConfig;
  switch (config.kind) {
    case "postgres": {
      const dbConfig = config.dbConfig as PostgresConfig;
      let host = dbConfig.host;
      let port = dbConfig.port;
      if (requireSsh && sshConfig) {
        port = await openTunnel(sshConfig, dbConfig.host, dbConfig.port);
        host = "127.0.0.1";
      }
      return new PostgresAdapter(config.connectionName, config.environment, {
        ...dbConfig,
        host,
        port,
      });
    }

    case "mongodb": {
      const dbConfig = config.dbConfig as MongoConfig;
      let uri = dbConfig.uri;
      if (requireSsh && sshConfig) {
        const url = new URL(dbConfig.uri);
        const remoteHost = url.hostname;
        const remotePort = parseInt(url.port || "27017", 10);
        const localPort = await openTunnel(sshConfig, remoteHost, remotePort);
        url.hostname = "127.0.0.1";
        url.port = String(localPort);
        uri = url.toString();
      }
      return new MongoAdapter(config.connectionName, config.environment, {
        ...dbConfig,
        uri,
      });
    }

    case "redis": {
      const dbConfig = config.dbConfig as RedisConfig;
      let host = dbConfig.host;
      let port = dbConfig.port;
      if (requireSsh && sshConfig) {
        port = await openTunnel(sshConfig, dbConfig.host, dbConfig.port);
        host = "127.0.0.1";
      }
      return new RedisAdapter(config.connectionName, config.environment, {
        ...dbConfig,
        host,
        port,
      });
    }
    default:
      throw new Error(`Unknown Database Type : ${config.kind}`);
  }
}

/**
 * Returns (and lazily connects) an adapter for the given env + connection.
 */
export async function getAdapter(
  connectionName: string,
): Promise<DatabaseAdapter> {
  if (adapters.has(connectionName)) return adapters.get(connectionName)!;

  const config = getConfig(connectionName);
  if (!config) {
    throw new Error(
      `Unknown connection "${connectionName}"` +
        `Available: ${getAvailableConfigs()}`,
    );
  }

  const adapter = await buildAdapter(config);
  await adapter.connect();
  adapters.set(connectionName, adapter);
  return adapter;
}

/**
 * Eagerly connects all connections in an environment.
 * Useful for startup validation; errors are logged but non-fatal.
 */
export async function connectAll(): Promise<void> {
  const availableConnections = getAvailableConfigs();
  for (const conn of availableConnections) {
    try {
      await getAdapter(conn.connectionName);
      console.error(
        `[registry] Connected ConnectionName: ${conn.connectionName} Environment: ${conn.environment} Kind: ${conn.kind}`,
      );
    } catch (err) {
      console.error(
        `[registry] Failed to connect ConnectionName: ${conn.connectionName} Environment: ${conn.environment} Kind: ${conn.kind}`,
        err,
      );
    }
  }
}

export function listAdapters(): Array<{
  connectionName: string;
  environment: Environment;
  kind: DbKind;
}> {
  return [...adapters.entries()].map(([key, a]) => ({
    connectionName: key,
    environment: a.environment,
    kind: a.kind,
  }));
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...adapters.values()].map((a) => a.disconnect()));
  adapters.clear();
}
