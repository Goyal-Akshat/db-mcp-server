import { DbKind, OperationClass } from "../types/index.js";

/** SQL keywords that indicate a write or structural change */
const SQL_WRITE_KEYWORDS = /^\s*(INSERT|UPDATE|DELETE|MERGE|CALL|EXEC)\b/i;
const SQL_DANGEROUS_KEYWORDS =
  /^\s*(DROP|TRUNCATE|ALTER|CREATE|REPLACE|GRANT|REVOKE|VACUUM|REINDEX)\b/i;

/** MongoDB operation names by class */
const MONGO_WRITE_OPS = new Set(["insertOne", "insertMany", "updateOne", "updateMany"]);
const MONGO_DANGEROUS_OPS = new Set(["deleteOne", "deleteMany", "command"]);

/** Redis commands by class */
const REDIS_READ_CMDS = new Set([
  "get", "mget", "hget", "hgetall", "hmget",
  "lrange", "llen", "lindex",
  "smembers", "scard", "sismember",
  "zrange", "zrangebyscore", "zcard", "zscore",
  "keys", "scan", "type", "ttl", "pttl", "exists",
  "strlen", "getrange", "getbit",
  "info", "dbsize", "ping", "echo",
]);
const REDIS_DANGEROUS_CMDS = new Set([
  "del", "unlink", "flushdb", "flushall", "rename",
  "expire", "expireat", "persist",
]);

export function classifyOperation(
  dbKind: DbKind,
  operation: string,
  _params: unknown[]
): OperationClass {
  switch (dbKind) {
    case "postgres": {
      if (SQL_DANGEROUS_KEYWORDS.test(operation)) return "dangerous";
      if (SQL_WRITE_KEYWORDS.test(operation)) return "write";
      return "read";
    }

    case "mongodb": {
      if (MONGO_DANGEROUS_OPS.has(operation)) return "dangerous";
      if (MONGO_WRITE_OPS.has(operation)) return "write";
      return "read";
    }

    case "redis": {
      const cmd = operation.toLowerCase();
      if (REDIS_DANGEROUS_CMDS.has(cmd)) return "dangerous";
      if (!REDIS_READ_CMDS.has(cmd)) return "write";
      return "read";
    }
  }
}
