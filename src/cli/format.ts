import { DynamicToolDefinition } from '@/types';

const SCALE_WARNING_THRESHOLD = 100;

/** Human-readable table for a terminal — method, derived name, path, one line per tool. */
export function formatToolsTable(tools: DynamicToolDefinition[]): string {
  if (tools.length === 0) return 'No tools found in this spec.';

  const nameWidth = Math.max(...tools.map((t) => t.name.length));
  const lines = tools.map((t) => `  ${t.method.toUpperCase().padEnd(6)} ${t.name.padEnd(nameWidth)} ${t.url}`);
  const header = `Found ${tools.length} tool${tools.length === 1 ? '' : 's'}:`;
  const warning =
    tools.length > SCALE_WARNING_THRESHOLD
      ? `\n\n⚠ ${tools.length} tools is a lot for an LLM to pick from accurately. Consider ToolFilterOptions ` +
        '(--tag/--exclude-tag here, or includeTags/excludeTags/includeOperationIds/includePaths in code) to narrow this down.'
      : '';

  return `${header}\n\n${lines.join('\n')}${warning}`;
}

/** Machine-readable form for piping into jq/other tooling. */
export function formatToolsJson(tools: DynamicToolDefinition[]): string {
  return JSON.stringify(
    tools.map((t) => ({ name: t.name, method: t.method, url: t.url, tags: t.tags ?? [] })),
    null,
    2
  );
}
