import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { ToolRegistry } from "./tools/registry.js";
import { commonToolDefs, commonHandlers } from "./tools/common.js";
import { postgresToolDefs, postgresHandlers } from "./tools/postgres.js";
import { mongoToolDefs, mongoHandlers } from "./tools/mongodb.js";
import { redisToolDefs, redisHandlers } from "./tools/redis.js";
import { disconnectAll } from "./adapters/registry.js";
import { closeAllTunnels } from "./tunnel/manager.js";

export async function createServer(): Promise<McpServer> {
  const registry = new ToolRegistry();

  // Register all tool modules — add new DB tool modules here as needed
  registry.register(commonToolDefs, commonHandlers);
  registry.register(postgresToolDefs, postgresHandlers);
  registry.register(mongoToolDefs, mongoHandlers);
  registry.register(redisToolDefs, redisHandlers);

  const server = new McpServer(
    { name: "db-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  // List tools
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: registry.getDefinitions(),
  }));

  // Call tool
  server.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      return await registry.call(name, args ?? {});
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();

  // Graceful shutdown
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  async function shutdown() {
    console.error("[server] Shutting down...");
    await disconnectAll();
    await closeAllTunnels();
    process.exit(0);
  }

  await server.connect(transport);
  console.error("[server] DB MCP Server running on stdio");
}
