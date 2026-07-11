const NAMESPACE_SEPARATOR = '__';

/** Prefixes a derived tool name so tools from multiple specs can coexist in one flat tool list
 *  without colliding (e.g. two providers both exposing a `getUser` operation). */
export function applyNamespace(toolName: string, namespace?: string): string {
  return namespace ? `${namespace}${NAMESPACE_SEPARATOR}${toolName}` : toolName;
}

/** Reverses applyNamespace() so the executor can look the operation up by its un-prefixed name. */
export function stripNamespace(toolName: string, namespace?: string): string {
  if (!namespace) return toolName;
  const prefix = `${namespace}${NAMESPACE_SEPARATOR}`;
  return toolName.startsWith(prefix) ? toolName.slice(prefix.length) : toolName;
}
