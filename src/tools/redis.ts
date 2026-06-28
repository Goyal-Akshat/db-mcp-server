import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getAdapter } from "../adapters/registry.js";
import { applyGuardrails } from "../guardrails/middleware.js";
import { ToolHandler } from "./registry.js";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const redisToolDefs: Tool[] = [
  {
    name: "redis_get",
    description:
      "Get the value of a Redis key (GET, HGETALL, LRANGE, SMEMBERS, ZRANGE).",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        key: { type: "string" },
        type: {
          type: "string",
          enum: ["string", "hash", "list", "set", "zset"],
          description: "Redis data type — determines the fetch command used",
        },
      },
      required: ["connectionName", "key"],
    },
  },
  {
    name: "redis_set",
    description:
      "Set a string key in Redis. Requires confirmation on dev/prod.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        key: { type: "string" },
        value: { type: "string" },
        exSeconds: { type: "number", description: "Optional TTL in seconds" },
      },
      required: ["connectionName", "key", "value"],
    },
  },
  {
    name: "redis_del",
    description:
      "Delete one or more Redis keys. Requires confirmation on dev/prod.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        keys: { type: "array", items: { type: "string" } },
      },
      required: ["connectionName", "keys"],
    },
  },
  {
    name: "redis_keys",
    description:
      "List keys matching a glob pattern (uses SCAN under the hood — safe for production).",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        pattern: { type: "string", description: "Glob pattern, e.g. 'user:*'" },
        count: {
          type: "number",
          description: "Approximate results per SCAN iteration (default 100)",
        },
      },
      required: ["connectionName", "pattern"],
    },
  },
  {
    name: "redis_command",
    description:
      "Execute an arbitrary Redis command. " +
      "Write/dangerous commands require confirmation on dev/prod.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        command: {
          type: "string",
          description: "Redis command name, e.g. HSET",
        },
        args: { type: "array", items: {}, description: "Command arguments" },
      },
      required: ["connectionName", "command"],
    },
  },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const Base = z.object({ connectionName: z.string() });

const GetSchema = Base.extend({
  key: z.string(),
  type: z.enum(["string", "hash", "list", "set", "zset"]).default("string"),
});

const SetSchema = Base.extend({
  key: z.string(),
  value: z.string(),
  exSeconds: z.number().optional(),
});

const DelSchema = Base.extend({ keys: z.array(z.string()) });

const KeysSchema = Base.extend({
  pattern: z.string(),
  count: z.number().default(100),
});

const CmdSchema = Base.extend({
  command: z.string(),
  args: z.array(z.unknown()).default([]),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_CMD_MAP: Record<string, (key: string) => [string, unknown[]]> = {
  string: (key) => ["get", [key]],
  hash: (key) => ["hgetall", [key]],
  list: (key) => ["lrange", [key, 0, -1]],
  set: (key) => ["smembers", [key]],
  zset: (key) => ["zrange", [key, 0, -1, "WITHSCORES"]],
};

// ─── Handlers ─────────────────────────────────────────────────────────────────

const redisGet: ToolHandler = async (args) => {
  const { connectionName, key, type } = GetSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const [cmd, params] = TYPE_CMD_MAP[type](key);
  const result = await adapter.executeRaw(cmd, params);
  return {
    content: [
      { type: "text", text: JSON.stringify(result.raw ?? result, null, 2) },
    ],
  };
};

const redisSet: ToolHandler = async (args) => {
  const { connectionName, key, value, exSeconds } = SetSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const params = exSeconds ? [key, exSeconds, value] : [key, value];
  const operation = exSeconds ? "setex" : "set";

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "redis",
    operation,
    params,
    previewFn: () =>
      `SET ${key} = "${value}"${exSeconds ? ` (expires in ${exSeconds}s)` : ""}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw(operation, params);
  return {
    content: [{ type: "text", text: JSON.stringify(result.raw, null, 2) }],
  };
};

const redisDel: ToolHandler = async (args) => {
  const { connectionName, keys } = DelSchema.parse(args);
  const adapter = await getAdapter(connectionName);

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "redis",
    operation: "del",
    params: keys,
    previewFn: () => `DEL ${keys.join(", ")}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw("del", keys);
  return {
    content: [{ type: "text", text: JSON.stringify(result.raw, null, 2) }],
  };
};

const redisKeys: ToolHandler = async (args) => {
  const { connectionName, pattern, count } = KeysSchema.parse(args);
  const adapter = await getAdapter(connectionName);

  // Use SCAN instead of KEYS for production safety
  const allKeys: string[] = [];
  let cursor = "0";
  do {
    const result = await adapter.executeRaw("scan", [
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      count,
    ]);
    const [nextCursor, keys] = result.raw as [string, string[]];
    cursor = nextCursor;
    allKeys.push(...keys);
    if (allKeys.length > 10_000) break; // safety cap
  } while (cursor !== "0");

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ keys: allKeys, count: allKeys.length }, null, 2),
      },
    ],
  };
};

const redisCommand: ToolHandler = async (args) => {
  const { connectionName, command, args: cmdArgs } = CmdSchema.parse(args);
  const adapter = await getAdapter(connectionName);

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "redis",
    operation: command.toLowerCase(),
    params: cmdArgs,
    previewFn: () => `${command.toUpperCase()} ${cmdArgs.join(" ")}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw(command.toLowerCase(), cmdArgs);
  return {
    content: [
      { type: "text", text: JSON.stringify(result.raw ?? result, null, 2) },
    ],
  };
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const redisHandlers: Record<string, ToolHandler> = {
  redis_get: redisGet,
  redis_set: redisSet,
  redis_del: redisDel,
  redis_keys: redisKeys,
  redis_command: redisCommand,
};
