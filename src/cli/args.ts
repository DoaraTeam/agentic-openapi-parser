export interface CliArgs {
  help: boolean;
  command?: string;
  specUrl?: string;
  includeTags: string[];
  excludeTags: string[];
  json: boolean;
}

/** Parses argv already sliced past `node cli.js` (i.e. process.argv.slice(2)). */
export function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    return { help: true, includeTags: [], excludeTags: [], json: false };
  }

  const result: CliArgs = { help: false, command, includeTags: [], excludeTags: [], json: false };
  const positional: string[] = [];

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === undefined) continue;
    if (arg === '--tag') {
      result.includeTags.push(rest[++i] ?? '');
    } else if (arg === '--exclude-tag') {
      result.excludeTags.push(rest[++i] ?? '');
    } else if (arg === '--json') {
      result.json = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else {
      positional.push(arg);
    }
  }

  result.specUrl = positional[0];
  return result;
}
