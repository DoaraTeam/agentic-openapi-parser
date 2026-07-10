import { DynamicToolDefinition } from '@/types';
import type { ToolFilterOptions } from '@/utils';

export const OPENAPI_PARSER_SERVICE = Symbol('OPENAPI_PARSER_SERVICE');

export interface IOpenApiParserService {
  parseAndFlatten(apiSpecUrl: string, providerId?: string, filter?: ToolFilterOptions): Promise<{ document: Record<string, unknown>; tools: DynamicToolDefinition[] }>;
}
