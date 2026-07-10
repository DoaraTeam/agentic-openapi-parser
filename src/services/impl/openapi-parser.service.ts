import SwaggerParser from '@apidevtools/swagger-parser';
import { DynamicToolDefinition, ILogger } from '@/types';
import type { IOpenApiParserService } from '@/services';
import { DEFAULT_LOGGER, deriveToolName, iterateOperations } from '@/utils';

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

    for (const { path, method, operation } of iterateOperations(spec)) {
      const toolName = deriveToolName(method, path, operation.operationId as string | undefined);

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

    this.logger.log(`Extracted ${tools.length} tools from spec.`);
    return tools;
  }
}
