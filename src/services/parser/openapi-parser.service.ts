import axios from 'axios';
import SwaggerParser from '@apidevtools/swagger-parser';
import { DynamicToolDefinition, ILogger, ParsedOpenApiSpec } from '@/types';
import type { IOpenApiParserService } from '@/services';
import type { ToolFilterOptions } from '@/utils';
import { applyNamespace, DEFAULT_LOGGER, deriveToolName, filterTools, iterateOperations } from '@/utils';
import { SpecCache } from './spec-cache';

export interface OpenApiParserServiceOptions {
  /** Caches dereferenced spec documents in memory, keyed by apiSpecUrl. Unset = no caching (always re-fetch/re-dereference). */
  cache?: {
    ttlMs: number;
    /** For http(s) URLs, revalidate an expired entry with a conditional GET (If-None-Match) instead of a full re-fetch when the server returns an ETag. Default true. */
    revalidateWithEtag?: boolean;
  };
}

const HTTP_URL_PATTERN = /^https?:\/\//i;

export class OpenApiParserService implements IOpenApiParserService {
  private readonly cache?: SpecCache;
  private readonly revalidateWithEtag: boolean;

  constructor(private readonly logger: ILogger = DEFAULT_LOGGER, options?: OpenApiParserServiceOptions) {
    this.cache = options?.cache ? new SpecCache(options.cache.ttlMs) : undefined;
    this.revalidateWithEtag = options?.cache?.revalidateWithEtag ?? true;
  }

  async parseAndFlatten(
    apiSpecUrl: string,
    providerId?: string,
    filter?: ToolFilterOptions,
    namespace?: string
  ): Promise<ParsedOpenApiSpec> {
    this.logger.log(`Parsing OpenAPI spec from: ${apiSpecUrl}`);
    try {
      const document = await this.loadDocument(apiSpecUrl);
      const allTools = this.extractToolsFromSpec(document, providerId, namespace);
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

  private async loadDocument(apiSpecUrl: string): Promise<Record<string, unknown>> {
    if (!this.cache) {
      return (await SwaggerParser.dereference(apiSpecUrl)) as Record<string, unknown>;
    }

    const fresh = this.cache.get(apiSpecUrl);
    if (fresh) {
      this.logger.debug?.(`Using cached spec for ${apiSpecUrl}`);
      return fresh.document;
    }

    if (!HTTP_URL_PATTERN.test(apiSpecUrl)) {
      const document = (await SwaggerParser.dereference(apiSpecUrl)) as Record<string, unknown>;
      this.cache.set(apiSpecUrl, { document });
      return document;
    }

    const stale = this.cache.getStale(apiSpecUrl);
    if (stale?.etag && this.revalidateWithEtag) {
      const response = await axios.get(apiSpecUrl, {
        headers: { 'If-None-Match': stale.etag },
        validateStatus: (status) => status === 200 || status === 304,
      });
      if (response.status === 304) {
        this.cache.touch(apiSpecUrl);
        this.logger.debug?.(`Spec unchanged (304 Not Modified): ${apiSpecUrl}`);
        return stale.document;
      }
      const document = (await SwaggerParser.dereference(response.data)) as Record<string, unknown>;
      this.cache.set(apiSpecUrl, { document, etag: response.headers.etag as string | undefined });
      return document;
    }

    const response = await axios.get(apiSpecUrl);
    const document = (await SwaggerParser.dereference(response.data)) as Record<string, unknown>;
    this.cache.set(apiSpecUrl, { document, etag: response.headers.etag as string | undefined });
    return document;
  }

  private extractToolsFromSpec(spec: Record<string, unknown>, providerId?: string, namespace?: string): DynamicToolDefinition[] {
    const tools: DynamicToolDefinition[] = [];

    for (const { path, method, operation } of iterateOperations(spec)) {
      const toolName = applyNamespace(deriveToolName(method, path, operation.operationId as string | undefined), namespace);
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
