import SwaggerParser from '@apidevtools/swagger-parser';
import { DynamicToolDefinition, ILogger } from '@/types';
import type { IOpenApiParserService } from '@/services';
import type { ToolFilterOptions } from '@/utils';
import { DEFAULT_LOGGER, deriveToolName, filterTools, iterateOperations } from '@/utils';

export class OpenApiParserService implements IOpenApiParserService {
  constructor(private readonly logger: ILogger = DEFAULT_LOGGER) {}

  async parseAndFlatten(apiSpecUrl: string, providerId?: string, filter?: ToolFilterOptions): Promise<{ document: Record<string, unknown>, tools: DynamicToolDefinition[] }> {
    this.logger.log(`Parsing OpenAPI spec from: ${apiSpecUrl}`);
    try {
      const document = await SwaggerParser.dereference(apiSpecUrl) as Record<string, unknown>;
      const allTools = this.extractToolsFromSpec(document, providerId);
      const tools = filterTools(allTools, filter);
      if (filter && tools.length !== allTools.length) {
        this.logger.log(`Tool filter kept ${tools.length}/${allTools.length} tools.`);
      }
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
      const { schema: requestBodySchema, required: requestBodyRequired } = this.extractRequestBody(operation);

      tools.push({
        name: toolName,
        description: (operation.summary as string) || (operation.description as string) || `Execute ${method.toUpperCase()} request to ${path}`,
        method,
        url: path,
        parameters: (operation.parameters as Record<string, unknown>[]) || [],
        security: (operation.security || spec.security) as Record<string, unknown>[] | undefined,
        providerId,
        requestBodySchema,
        requestBodyRequired,
        tags: (operation.tags as string[]) || undefined,
      });
    }

    this.logger.log(`Extracted ${tools.length} tools from spec.`);
    return tools;
  }

  private extractRequestBody(operation: Record<string, unknown>): { schema?: Record<string, unknown>; required?: boolean } {
    const requestBody = operation.requestBody as Record<string, unknown> | undefined;
    if (!requestBody) return {};

    const content = (requestBody.content as Record<string, Record<string, unknown>>) || {};
    const mediaType = content['application/json'] || Object.values(content)[0];

    return {
      schema: mediaType?.schema as Record<string, unknown> | undefined,
      required: (requestBody.required as boolean) || false,
    };
  }
}
