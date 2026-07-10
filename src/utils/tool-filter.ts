import { DynamicToolDefinition } from '@/types';
import { matchesGlob } from './glob-match';

export interface ToolFilterOptions {
  includeTags?: string[];
  excludeTags?: string[];
  /** Glob patterns matched against the derived tool name (operationId-based, see deriveToolName). */
  includeOperationIds?: string[];
  excludeOperationIds?: string[];
  /** Glob patterns matched against the OpenAPI path template, e.g. '/users/*' or '/admin/**'. */
  includePaths?: string[];
  excludePaths?: string[];
}

export function filterTools(tools: DynamicToolDefinition[], filter?: ToolFilterOptions): DynamicToolDefinition[] {
  if (!filter) return tools;
  return tools.filter((tool) => matchesFilter(tool, filter));
}

function matchesFilter(tool: DynamicToolDefinition, filter: ToolFilterOptions): boolean {
  const tags = tool.tags || [];

  if (filter.includeTags?.length && !tags.some((tag) => filter.includeTags!.includes(tag))) return false;
  if (filter.excludeTags?.length && tags.some((tag) => filter.excludeTags!.includes(tag))) return false;

  if (filter.includeOperationIds?.length && !filter.includeOperationIds.some((pattern) => matchesGlob(tool.name, pattern))) return false;
  if (filter.excludeOperationIds?.length && filter.excludeOperationIds.some((pattern) => matchesGlob(tool.name, pattern))) return false;

  if (filter.includePaths?.length && !filter.includePaths.some((pattern) => matchesGlob(tool.url, pattern))) return false;
  if (filter.excludePaths?.length && filter.excludePaths.some((pattern) => matchesGlob(tool.url, pattern))) return false;

  return true;
}
