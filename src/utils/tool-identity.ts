const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'] as const;

export interface OperationLocation {
  path: string;
  method: string;
  operation: Record<string, unknown>;
}

/** Single source of truth for turning operationId/method/path into a stable tool name. */
export function deriveToolName(method: string, path: string, operationId?: string): string {
  const rawName = operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, '_')}`;
  return (
    rawName
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 64)
      .replace(/^_+|_+$/g, '') || 'unknown_tool'
  );
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
