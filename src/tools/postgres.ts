import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getAdapter } from "../adapters/registry.js";
import { PostgresAdapter } from "../adapters/postgres.js";
import { applyGuardrails } from "../guardrails/middleware.js";
import { ToolHandler } from "./registry.js";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const postgresToolDefs: Tool[] = [
  {
    name: "postgres_query",
    description:
      "Execute a SQL query against a PostgreSQL database. " +
      "On dev/prod, write or dangerous queries require a confirmation step.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string", description: "Connection name" },
        sql: { type: "string", description: "SQL query to execute" },
        params: {
          type: "array",
          description: "Bind parameters for the query (positional $1, $2, ...)",
          items: {},
        },
      },
      required: ["connectionName", "sql"],
    },
  },
  {
    name: "postgres_list_tables",
    description:
      "List all tables in the public schema of a PostgreSQL database.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
      },
      required: ["connectionName"],
    },
  },
  {
    name: "postgres_describe_table",
    description: "Show column definitions for a specific table.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        table: { type: "string", description: "Table name" },
      },
      required: ["connectionName", "table"],
    },
  },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const QuerySchema = z.object({
  connectionName: z.string(),
  sql: z.string(),
  params: z.array(z.unknown()).default([]),
});

const BasicSchema = z.object({ connectionName: z.string() });
const TableSchema = BasicSchema.extend({ table: z.string() });

// ─── Handlers ─────────────────────────────────────────────────────────────────

const postgresQuery: ToolHandler = async (args) => {
  const { connectionName, sql, params } = QuerySchema.parse(args);
  const adapter = await getAdapter(connectionName);

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "postgres",
    operation: sql,
    params: [params],
    previewFn: () => `SQL: ${sql}\nParams: ${JSON.stringify(params)}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw(sql, [params]);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

const postgresListTables: ToolHandler = async (args) => {
  const { connectionName } = BasicSchema.parse(args);
  const adapter = (await getAdapter(connectionName)) as PostgresAdapter;
  const tables = await adapter.listTables();
  return { content: [{ type: "text", text: JSON.stringify(tables, null, 2) }] };
};

const postgresDescribeTable: ToolHandler = async (args) => {
  const { connectionName, table } = TableSchema.parse(args);
  const adapter = (await getAdapter(connectionName)) as PostgresAdapter;
  const result = await adapter.describeTable(table);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const postgresHandlers: Record<string, ToolHandler> = {
  postgres_query: postgresQuery,
  postgres_list_tables: postgresListTables,
  postgres_describe_table: postgresDescribeTable,
};
