import { DynamicToolDefinition } from '@/types';

const READ_ONLY_METHODS = new Set(['get', 'head', 'options']);

/** GET/HEAD/OPTIONS are read-only; everything else (POST/PUT/DELETE/PATCH) is treated as destructive. */
export function deriveMethodAnnotations(method: string): { readOnlyHint: boolean; destructiveHint: boolean } {
  const isReadOnly = READ_ONLY_METHODS.has(method.toLowerCase());
  return { readOnlyHint: isReadOnly, destructiveHint: !isReadOnly };
}

/**
 * Strips/rewrites JSON Schema keywords that strict-mode function-calling parsers (e.g. OpenAI)
 * reject or mishandle: `type: 'file'` isn't valid JSON Schema, `default`/`example`/`pattern`/
 * `min*`/`max*` keywords commonly trip strict validators, and explicit `null` values are rejected
 * outright. Recurses into `properties`, `items`, and `oneOf`/`anyOf`/`allOf` branches, with a
 * cycle guard for specs where SwaggerParser.dereference() has produced a genuinely
 * self-referential schema object (a real object cycle, not just a repeated `$ref` string).
 */
export function sanitizeJsonSchema(schema: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (Array.isArray(schema)) return schema.map((item) => sanitizeJsonSchema(item, seen));
  if (!schema || typeof schema !== 'object') return schema;
  if (seen.has(schema)) return { type: 'object', description: '(circular schema reference)' };
  seen.add(schema);

  const result: Record<string, unknown> = { ...(schema as Record<string, unknown>) };

  if (result.type === 'file') {
    result.type = 'string';
    delete result.format;
    result.description = result.description ? `${result.description} (Base64 Encoded Binary Data)` : 'Base64 Encoded Binary Data';
  }

  delete result.default;
  delete result.example;
  delete result.examples;
  delete result.pattern;
  delete result.minLength;
  delete result.maxLength;
  delete result.minimum;
  delete result.maximum;

  for (const key of Object.keys(result)) {
    if (result[key] === null) delete result[key];
  }

  if (result.properties && typeof result.properties === 'object') {
    const sanitizedProps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result.properties as Record<string, unknown>)) {
      sanitizedProps[key] = sanitizeJsonSchema(value, seen);
    }
    result.properties = sanitizedProps;
  }

  if (result.items) {
    result.items = sanitizeJsonSchema(result.items, seen);
  }

  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(result[key])) {
      result[key] = (result[key] as unknown[]).map((item) => sanitizeJsonSchema(item, seen));
    }
  }

  return result;
}

/**
 * Builds a strict-mode-safe JSON Schema `inputSchema` for a tool definition — the MCP/OpenAI
 * function-calling equivalent of `buildZodSchemaForTool` (which targets Zod for Langchain/Vercel AI).
 */
export function buildStrictInputSchema(
  toolDef: DynamicToolDefinition,
  opts?: { skipHeaderParams?: string[] }
): Record<string, unknown> {
  const skipHeaderParams = opts?.skipHeaderParams ?? ['authorization', 'bearer', 'cookie'];
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const p of toolDef.parameters) {
    const name = String(p.name);
    if (p.in === 'header' && skipHeaderParams.includes(name.toLowerCase())) continue;

    const paramSchema = (p.schema as Record<string, unknown>) || { type: (p.type as string) ?? 'string' };
    const schema: Record<string, unknown> = { ...paramSchema };
    if (p.description && !schema.description) schema.description = p.description;

    properties[name] = sanitizeJsonSchema(schema);
    if (p.required) required.push(name);
  }

  if (toolDef.requestBodySchema) {
    const schema: Record<string, unknown> = { ...toolDef.requestBodySchema };
    if (!schema.description) schema.description = 'Payload for the request';

    properties['requestBody'] = sanitizeJsonSchema(schema);
    if (toolDef.requestBodyRequired) required.push('requestBody');
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}
