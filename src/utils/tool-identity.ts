import { createHash } from 'crypto';

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;
const MAX_TOOL_NAME_LENGTH = 64;

export interface OperationLocation {
  path: string;
  method: string;
  operation: Record<string, unknown>;
}

/** Single source of truth for turning operationId/method/path into a stable tool name. */
export function deriveToolName(method: string, path: string, operationId?: string): string {
  const rawName = operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const sanitized = rawName
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!sanitized) return 'unknown_tool';
  if (sanitized.length <= MAX_TOOL_NAME_LENGTH) return sanitized;

  // Blindly truncating a name longer than the 64-char limit most AI providers enforce can make
  // two distinct real operations collide (e.g. two operationIds that only differ after
  // character 64) — silently executing the wrong operation for one of them. Appending a short
  // hash of the full sanitized name keeps truncation unique, at the cost of some readability on
  // names this long.
  const hash = createHash('sha1').update(sanitized).digest('hex').slice(0, 8);
  const prefixLength = MAX_TOOL_NAME_LENGTH - hash.length - 1; // "-1" reserves room for the separator
  const prefix = sanitized.slice(0, prefixLength).replace(/_+$/, '');
  return `${prefix}_${hash}`;
}

/** Walks spec.paths once, yielding every {path, method, operation}. */
export function* iterateOperations(spec: Record<string, unknown>): Generator<OperationLocation> {
  const paths = (spec.paths as Record<string, unknown>) || {};
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as Record<string, unknown>)[method] as Record<string, unknown> | undefined;
      if (operation) yield { path, method, operation };
    }
  }
}

/** Finds the {path, method, operation} whose derived tool name matches toolName. */
export function findOperationByToolName(spec: Record<string, unknown>, toolName: string): OperationLocation | null {
  for (const loc of iterateOperations(spec)) {
    if (deriveToolName(loc.method, loc.path, loc.operation.operationId as string | undefined) === toolName) {
      return loc;
    }
  }
  return null;
}
