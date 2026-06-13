import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getEnvironmentNames } from "../config/index.js";
import { listAdapters } from "../adapters/registry.js";
import {
  cancelPendingOperation,
  listPendingOperations,
  resolvePendingOperation,
} from "../guardrails/confirmation.js";
import { getAdapter } from "../adapters/registry.js";
import { ToolHandler } from "./registry.js";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const commonToolDefs: Tool[] = [
  {
    name: "list_environments",
    description:
      "List all configured environments (local, dev, prod) and their available database connections.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ping_connection",
    description: "Ping a specific database connection to check if it is reachable.",
    inputSchema: {
      type: "object",
      properties: {
        env: { type: "string", description: "Environment name (e.g. local, dev, prod)" },
        connection: { type: "string", description: "Connection name within that environment" },
      },
      required: ["env", "connection"],
    },
  },
  {
    name: "confirm_operation",
    description:
      "Confirm and execute a previously staged write/dangerous operation on dev or prod. " +
      "You will receive a token when you attempt such an operation.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string", description: "The confirmation token from the pending operation" },
      },
      required: ["token"],
    },
  },
  {
    name: "cancel_operation",
    description: "Cancel a pending operation by its confirmation token.",
    inputSchema: {
      type: "object",
      properties: {
        token: { type: "string" },
      },
      required: ["token"],
    },
  },
  {
    name: "list_pending_operations",
    description: "List all operations awaiting confirmation.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

const listEnvironments: ToolHandler = async () => {
  const { loadConfig } = await import("../config/index.js");
  const config = loadConfig();
  const envs = Object.entries(config.environments).map(([name, entry]) => ({
    name,
    environment: entry.environment,
    connections: Object.entries(entry.connections).map(([cname, conn]) => ({
      name: cname,
      kind: conn.kind,
    })),
    sshEnabled: !!entry.ssh,
  }));
  return { content: [{ type: "text", text: JSON.stringify(envs, null, 2) }] };
};

const PingSchema = z.object({ env: z.string(), connection: z.string() });

const pingConnection: ToolHandler = async (args) => {
  const { env, connection } = PingSchema.parse(args);
  const adapter = await getAdapter(env, connection);
  const ok = await adapter.ping();
  return {
    content: [
      {
        type: "text",
        text: ok
          ? `✓ ${env}/${connection} (${adapter.kind}) is reachable`
          : `✗ ${env}/${connection} (${adapter.kind}) did NOT respond`,
      },
    ],
  };
};

const ConfirmSchema = z.object({ token: z.string() });

const confirmOperation: ToolHandler = async (args) => {
  const { token } = ConfirmSchema.parse(args);
  const op = resolvePendingOperation(token);
  const adapter = await getAdapter(
    // The adapter key is "envName/connectionName" — we stored connectionName; look up by kind+name
    findEnvNameForConnection(op.connectionName, op.environment),
    op.connectionName
  );
  const result = await adapter.executeRaw(op.operation, op.params);
  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
};

const cancelOperation: ToolHandler = async (args) => {
  const { token } = ConfirmSchema.parse(args);
  const removed = cancelPendingOperation(token);
  return {
    content: [
      {
        type: "text",
        text: removed ? `Operation ${token} cancelled.` : `No pending operation with token ${token}.`,
      },
    ],
  };
};

const listPending: ToolHandler = async () => {
  const ops = listPendingOperations();
  if (ops.length === 0) {
    return { content: [{ type: "text", text: "No pending operations." }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(ops, null, 2) }] };
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function findEnvNameForConnection(connectionName: string, environment: string): string {
  const adapters = listAdapters();
  const match = adapters.find(
    (a) => a.key.endsWith(`/${connectionName}`) && a.environment === environment
  );
  if (!match) throw new Error(`Cannot resolve env name for connection "${connectionName}"`);
  return match.key.split("/")[0];
}

// ─── Export handler map ───────────────────────────────────────────────────────

export const commonHandlers: Record<string, ToolHandler> = {
  list_environments: listEnvironments,
  ping_connection: pingConnection,
  confirm_operation: confirmOperation,
  cancel_operation: cancelOperation,
  list_pending_operations: listPending,
};
