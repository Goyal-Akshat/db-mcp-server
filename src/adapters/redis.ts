import Redis, { RedisOptions } from "ioredis";
import { Environment, QueryResult, RedisConfig } from "../types/index.js";
import { DatabaseAdapter } from "./dbAdapter.js";

export class RedisAdapter extends DatabaseAdapter {
  readonly kind = "redis" as const;
  private client: Redis | null = null;

  constructor(
    connectionName: string,
    environment: Environment,
    private readonly config: RedisConfig & { host: string; port: number },
  ) {
    super(connectionName, environment);
  }

  async connect(): Promise<void> {
    const opts: RedisOptions = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db ?? 0,
      tls: this.config.tls ? {} : undefined,
      lazyConnect: true,
      enableReadyCheck: true,
    };
    this.client = new Redis(opts);
    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    await this.client?.quit();
    this.client = null;
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client?.ping();
      return reply === "PONG";
    } catch {
      return false;
    }
  }

  /**
   * operation: Redis command name (e.g. "GET", "SET", "HGETALL")
   * params: Redis command arguments as strings/numbers
   *
   * Any valid Redis command can be issued this way.
   */
  async executeRaw(operation: string, params: unknown[]): Promise<QueryResult> {
    if (!this.client)
      throw new Error(`[redis:${this.connectionName}] Not connected`);

    const cmd = operation.toUpperCase();
    // ioredis accepts dynamic command via .call()
    const result = await (
      this.client as unknown as Record<
        string,
        (...a: unknown[]) => Promise<unknown>
      >
    )[cmd.toLowerCase()]?.(...params);

    if (result === undefined) {
      // Fallback: use sendCommand for commands not directly on the client
      const raw = await this.client.sendCommand(
        new Redis.Command(cmd, params as (string | number | Buffer)[]),
      );
      return { raw };
    }

    return { raw: result };
  }
}
