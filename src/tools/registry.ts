import { Tool } from "@modelcontextprotocol/sdk/types.js";

export type ToolHandler = (args: unknown) => Promise<{
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}>;

/** Central registry — all tool modules register here at startup */
export class ToolRegistry {
  private definitions: Tool[] = [];
  private handlers = new Map<string, ToolHandler>();

  register(defs: Tool[], handlers: Record<string, ToolHandler>): void {
    this.definitions.push(...defs);
    for (const [name, handler] of Object.entries(handlers)) {
      if (this.handlers.has(name)) {
        throw new Error(`Tool "${name}" is already registered`);
      }
      this.handlers.set(name, handler);
    }
  }

  getDefinitions(): Tool[] {
    return this.definitions;
  }

  async call(name: string, args: unknown): Promise<ReturnType<ToolHandler>> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Unknown tool: "${name}"`);
    return handler(args);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }
}
