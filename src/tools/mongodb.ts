import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getAdapter } from "../adapters/registry.js";
import { applyGuardrails } from "../guardrails/middleware.js";
import { ToolHandler } from "./registry.js";

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const mongoToolDefs: Tool[] = [
  {
    name: "mongo_find",
    description:
      "Query documents from a MongoDB collection. " +
      "Supports filter and options (projection, sort, limit).",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        collection: { type: "string" },
        filter: {
          type: "object",
          description: "MongoDB filter document (default: {})",
        },
        options: {
          type: "object",
          description: "Query options: { projection, sort, limit }",
        },
      },
      required: ["connectionName", "collection"],
    },
  },
  {
    name: "mongo_aggregate",
    description: "Run an aggregation pipeline on a MongoDB collection.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        collection: { type: "string" },
        pipeline: {
          type: "array",
          description: "Array of aggregation stage documents",
        },
      },
      required: ["connectionName", "collection", "pipeline"],
    },
  },
  {
    name: "mongo_insert",
    description:
      "Insert one or more documents into a MongoDB collection. " +
      "Requires confirmation on dev/prod.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        collection: { type: "string" },
        documents: {
          type: "array",
          description:
            "Documents to insert (single-element array for insertOne)",
        },
      },
      required: ["connectionName", "collection", "documents"],
    },
  },
  {
    name: "mongo_update",
    description:
      "Update documents in a MongoDB collection. " +
      "Requires confirmation on dev/prod.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        collection: { type: "string" },
        filter: { type: "object" },
        update: {
          type: "object",
          description: "Update document (e.g. { $set: { ... } })",
        },
        many: {
          type: "boolean",
          description: "If true, updateMany; else updateOne",
        },
      },
      required: ["connectionName", "collection", "filter", "update"],
    },
  },
  {
    name: "mongo_delete",
    description:
      "Delete documents from a MongoDB collection. " +
      "Requires confirmation on dev/prod.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
        collection: { type: "string" },
        filter: { type: "object" },
        many: {
          type: "boolean",
          description: "If true, deleteMany; else deleteOne",
        },
      },
      required: ["connectionName", "collection", "filter"],
    },
  },
  {
    name: "mongo_list_collections",
    description: "List all collections in the MongoDB database.",
    inputSchema: {
      type: "object",
      properties: {
        connectionName: { type: "string" },
      },
      required: ["connectionName"],
    },
  },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const Base = z.object({ connectionName: z.string() });

const FindSchema = Base.extend({
  collection: z.string(),
  filter: z.record(z.unknown()).default({}),
  options: z.record(z.unknown()).default({}),
});

const AggregateSchema = Base.extend({
  collection: z.string(),
  pipeline: z.array(z.record(z.unknown())),
});

const InsertSchema = Base.extend({
  collection: z.string(),
  documents: z.array(z.record(z.unknown())),
});

const UpdateSchema = Base.extend({
  collection: z.string(),
  filter: z.record(z.unknown()),
  update: z.record(z.unknown()),
  many: z.boolean().default(false),
});

const DeleteSchema = Base.extend({
  collection: z.string(),
  filter: z.record(z.unknown()),
  many: z.boolean().default(false),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

const mongoFind: ToolHandler = async (args) => {
  const { connectionName, collection, filter, options } =
    FindSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const result = await adapter.executeRaw("find", [
    collection,
    filter,
    options,
  ]);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

const mongoAggregate: ToolHandler = async (args) => {
  const { connectionName, collection, pipeline } = AggregateSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const result = await adapter.executeRaw("aggregate", [collection, pipeline]);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

const mongoInsert: ToolHandler = async (args) => {
  const { connectionName, collection, documents } = InsertSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const operation = documents.length === 1 ? "insertOne" : "insertMany";
  const params =
    documents.length === 1
      ? [collection, documents[0]]
      : [collection, documents];

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "mongodb",
    operation,
    params,
    previewFn: () =>
      `${operation} into "${collection}":\n${JSON.stringify(documents, null, 2)}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw(operation, params);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

const mongoUpdate: ToolHandler = async (args) => {
  const { connectionName, collection, filter, update, many } =
    UpdateSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const operation = many ? "updateMany" : "updateOne";
  const params = [collection, filter, update];

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "mongodb",
    operation,
    params,
    previewFn: () =>
      `${operation} in "${collection}"\nFilter: ${JSON.stringify(filter, null, 2)}\nUpdate: ${JSON.stringify(update, null, 2)}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw(operation, params);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

const mongoDelete: ToolHandler = async (args) => {
  const { connectionName, collection, filter, many } = DeleteSchema.parse(args);
  const adapter = await getAdapter(connectionName);
  const operation = many ? "deleteMany" : "deleteOne";
  const params = [collection, filter];

  const guard = applyGuardrails({
    environment: adapter.environment,
    connectionName: connectionName,
    dbKind: "mongodb",
    operation,
    params,
    previewFn: () =>
      `${operation} from "${collection}"\nFilter: ${JSON.stringify(filter, null, 2)}`,
  });

  if (!guard.allowed) {
    return { content: [{ type: "text", text: guard.reason! }] };
  }

  const result = await adapter.executeRaw(operation, params);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

const mongoListCollections: ToolHandler = async (args) => {
  const { connectionName } = Base.parse(args);
  const adapter = await getAdapter(connectionName);
  const result = await adapter.executeRaw("listCollections", []);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
};

// ─── Export ───────────────────────────────────────────────────────────────────

export const mongoHandlers: Record<string, ToolHandler> = {
  mongo_find: mongoFind,
  mongo_aggregate: mongoAggregate,
  mongo_insert: mongoInsert,
  mongo_update: mongoUpdate,
  mongo_delete: mongoDelete,
  mongo_list_collections: mongoListCollections,
};
