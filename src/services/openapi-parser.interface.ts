import { DynamicToolDefinition } from '@/types/core';

export const OPENAPI_PARSER_SERVICE = Symbol('OPENAPI_PARSER_SERVICE');

export interface IOpenApiParserService {
  parseAndFlatten(apiSpecUrl: string, providerId?: string): Promise<{ document: Record<string, unknown>; tools: DynamicToolDefinition[] }>;
}
