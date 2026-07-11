import { DynamicOpenApiAgent } from '../dynamic-openapi-agent';
import type { ILogger } from '@/types';
import type { ToolFilterOptions } from '@/utils';
import { parseArgs } from './args';
import { formatToolsJson, formatToolsTable } from './format';

export const HELP_TEXT = `Usage: agentic-openapi-parser inspect <specUrl> [options]

Options:
  --tag <name>          Only include tools with this OpenAPI tag (repeatable)
  --exclude-tag <name>  Exclude tools with this OpenAPI tag (repeatable)
  --json                Print machine-readable JSON instead of a table
  -h, --help            Show this help text

Examples:
  npx agentic-openapi-parser inspect https://api.example.com/openapi.json
  npx agentic-openapi-parser inspect ./openapi.json --tag payments --json
`;

const SILENT_LOGGER: ILogger = {
  log: () => undefined,
  error: () => undefined,
  warn: () => undefined,
  debug: () => undefined,
};

/**
 * Orchestrates the `inspect` subcommand: parse argv, run parseAndFlatten() against a real spec,
 * print a table or JSON. Kept separate from index.ts (the actual `bin` entry point, which just
 * adds the shebang and top-level error handling) so it can be imported and tested directly
 * without triggering process.argv/console side effects on import.
 */
export async function main(argv: string[], stdout: (line: string) => void = console.log, stderr: (line: string) => void = console.error): Promise<number> {
  const args = parseArgs(argv);

  if (args.help) {
    stdout(HELP_TEXT);
    return 0;
  }

  if (args.command !== 'inspect') {
    stderr(`Unknown command "${args.command}".\n\n${HELP_TEXT}`);
    return 1;
  }

  if (!args.specUrl) {
    stderr(`Missing <specUrl>.\n\n${HELP_TEXT}`);
    return 1;
  }

  const filter: ToolFilterOptions | undefined =
    args.includeTags.length > 0 || args.excludeTags.length > 0
      ? {
          ...(args.includeTags.length > 0 ? { includeTags: args.includeTags } : {}),
          ...(args.excludeTags.length > 0 ? { excludeTags: args.excludeTags } : {}),
        }
      : undefined;

  stderr(`Parsing ${args.specUrl} ...`);
  const agent = new DynamicOpenApiAgent(SILENT_LOGGER);
  const { tools } = await agent.parseAndFlatten(args.specUrl, undefined, filter);

  stdout(args.json ? formatToolsJson(tools) : formatToolsTable(tools));
  return 0;
}
