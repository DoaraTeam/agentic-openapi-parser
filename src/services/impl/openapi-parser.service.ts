import SwaggerParser from '@apidevtools/swagger-parser';
import { DynamicToolDefinition } from '@/types';
import { IOpenApiParserService } from '@/services/openapi-parser.interface';
import { ILogger } from '@/types/logger';
import { DEFAULT_LOGGER } from '@/utils/logger';

export class OpenApiParserService implements IOpenApiParserService {
  constructor(private readonly logger: ILogger = DEFAULT_LOGGER) {}

  async parseAndFlatten(apiSpecUrl: string, providerId?: string): Promise<{ document: Record<string, unknown>, tools: DynamicToolDefinition[] }> {
    this.logger.log(`Parsing OpenAPI spec from: ${apiSpecUrl}`);
    try {
      const document = await SwaggerParser.dereference(apiSpecUrl) as Record<string, unknown>;
      const tools = this.extractToolsFromSpec(document, providerId);
      return { document, tools };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to parse OpenAPI spec: ${errorMessage}`);
      throw new Error(`Failed to parse OpenAPI spec: ${errorMessage}`);
    }
  }

  private extractToolsFromSpec(spec: Record<string, unknown>, providerId?: string): DynamicToolDefinition[] {
    const tools: DynamicToolDefinition[] = [];
    const paths = (spec.paths as Record<string, unknown>) || {};
    const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];

    for (const [path, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;

      for (const method of methods) {
        const operation = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
        if (!operation) continue;

        const rawName = (operation.operationId as string) || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
        const toolName = rawName
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 64)
          .replace(/^_+|_+$/g, '') || 'unknown_tool';

        tools.push({
          name: toolName,
          description: (operation.summary as string) || (operation.description as string) || `Execute ${method.toUpperCase()} request to ${path}`,
          method,
          url: path,
          parameters: (operation.parameters as Record<string, unknown>[]) || [],
          security: (operation.security || spec.security) as Record<string, unknown>[] | undefined,
          providerId,
        });
      }
    }

    this.logger.log(`Extracted ${tools.length} tools from spec.`);
    return tools;
  }
}
