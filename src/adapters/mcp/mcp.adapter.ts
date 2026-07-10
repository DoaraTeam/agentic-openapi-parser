import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Implementation } from '@modelcontextprotocol/sdk/types.js';
import { DynamicToolDefinition, ExecuteToolOptions } from '@/types';
import { IDynamicToolExecutorService } from '@/services';
import { buildZodSchemaForTool, safeToolName } from '@/adapters/shared';

/**
 * Registers parsed OpenAPI tools onto an MCP server. Unlike the other adapters, MCP's unit of
 * consumption is "register tools onto a server instance", not a flat list of tool objects — so
 * this class doesn't implement `IAiAdapter`/extend `BaseAiAdapter`.
 *
 * Transport (stdio, HTTP, ...) and `server.connect(transport)` are left to the caller, matching
 * this library's existing "bring your own X" scope boundary (e.g. it also doesn't perform OAuth2
 * grant flows, just injects an already-valid token).
 */
export class McpToolAdapter {
  constructor(
    private readonly executor: IDynamicToolExecutorService,
    private readonly spec: Record<string, unknown>,
    private readonly toolsDef: DynamicToolDefinition[],
    private readonly options?: ExecuteToolOptions
  ) {}

  /** Registers every parsed tool onto an existing McpServer instance. Does not connect a transport. */
  registerOn(server: McpServer): void {
    for (const toolDef of this.toolsDef) {
      const schema = buildZodSchemaForTool(toolDef);

      server.registerTool(
        safeToolName(toolDef.name),
        {
          description: toolDef.description || `Tool for ${toolDef.name}`,
          inputSchema: schema.shape,
        },
        async (args: Record<string, unknown>) => {
          try {
            const result = await this.executor.execute(this.spec, toolDef.name, args, this.options);
            return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { content: [{ type: 'text' as const, text: message }], isError: true };
          }
        }
      );
    }
  }

  /** Convenience: builds a fresh McpServer, registers all tools on it, and returns it (unconnected). */
  createServer(serverInfo: Implementation): McpServer {
    const server = new McpServer(serverInfo);
    this.registerOn(server);
    return server;
  }
}
