/** Converts a shell-style glob (`*`, `**`, `?`) into an anchored RegExp. No external dep needed
 *  for the small pattern vocabulary tool filtering requires. */
export function globToRegExp(pattern: string): RegExp {
  const tokens = pattern.split(/(\*\*|\*|\?)/);
  const body = tokens
    .map((token) => {
      if (token === '**') return '.*';
      if (token === '*') return '[^/]*';
      if (token === '?') return '.';
      return token.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${body}$`);
}

export function matchesGlob(value: string, pattern: string): boolean {
  return globToRegExp(pattern).test(value);
}
