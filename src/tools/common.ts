import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  cancelPendingOperation,
  listPendingOperations,
  resolvePendingOperation,
} from "../guardrails/confirmation.js";
import { getAdapter } from "../adapters/registry.js";
import { ToolHandler } from "./registry.js";
import { getAvailableConfigs } from "../config/index.js";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const commonToolDefs: Tool[] = [
  {
    name: "list_available_connections",
    description:
      "List all configured connections with connection name its environment (local, dev, prod) and its kind (postgres, redis, mongo).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "ping_connection",
    description:
      "Ping a specific database connection to check if it is reachable.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: {
          type: "string",
          description: "Connection name",
        },
      },
      required: ["connectionName"],
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
        token: {
          type: "string",
          description: "The confirmation token from the pending operation",
        },
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

const listAvailableConfigs: ToolHandler = async () => {
  const configs = getAvailableConfigs();
  return {
    content: [{ type: "text", text: JSON.stringify(configs, null, 2) }],
  };
};

const PingSchema = z.object({ connectionName: z.string() });

const pingConnection: ToolHandler = async (args) => {
  const { connectionName } = PingSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const ok = await adapter.ping();
  return {
    content: [
      {
        type: "text",
        text: ok
          ? `✓ ConnectionName: ${connectionName} Environment: ${adapter.environment} Kind: ${adapter.kind} is reachable`
          : `✗ ${connectionName} Environment: ${adapter.environment} Kind: ${adapter.kind} did NOT respond`,
      },
    ],
  };
};

const ConfirmSchema = z.object({ token: z.string() });

const confirmOperation: ToolHandler = async (args) => {
  const { token } = ConfirmSchema.parse(args);
  const op = resolvePendingOperation(token);
  const adapter = await getAdapter(
    op.connectionName,
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
        text: removed
          ? `Operation ${token} cancelled.`
          : `No pending operation with token ${token}.`,
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

// ─── Export handler map ───────────────────────────────────────────────────────

export const commonHandlers: Record<string, ToolHandler> = {
  list_available_configs: listAvailableConfigs,
  ping_connection: pingConnection,
  confirm_operation: confirmOperation,
  cancel_operation: cancelOperation,
  list_pending_operations: listPending,
};
