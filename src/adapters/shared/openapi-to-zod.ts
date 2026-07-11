import { z } from 'zod';
import { DynamicToolDefinition } from '@/types';

function buildStringZodType(format?: string): z.ZodString {
  switch (format) {
    case 'date-time':
      return z.string().datetime({ offset: true });
    case 'email':
      return z.string().email();
    case 'uuid':
      return z.string().uuid();
    default:
      return z.string();
  }
}

function buildUnionZodType(variants: Record<string, unknown>[], seen: WeakSet<object>): z.ZodTypeAny {
  const zodVariants = variants.map((v) => jsonSchemaToZod(v, seen));
  return zodVariants.length === 1 ? zodVariants[0]! : z.union(zodVariants as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

function buildIntersectionZodType(variants: Record<string, unknown>[], seen: WeakSet<object>): z.ZodTypeAny {
  const zodVariants = variants.map((v) => jsonSchemaToZod(v, seen));
  const allObjects = zodVariants.every((v): v is z.ZodObject<z.ZodRawShape> => v instanceof z.ZodObject);
  if (!allObjects) return zodVariants[0] ?? z.unknown();
  return zodVariants.reduce((merged, part) => merged.merge(part));
}

function buildBaseZodType(schema: Record<string, unknown>, seen: WeakSet<object>): z.ZodTypeAny {
  const enumValues = schema.enum as unknown[] | undefined;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    if (enumValues.every((v) => typeof v === 'string')) {
      return z.enum(enumValues as [string, ...string[]]);
    }
    const literals = enumValues.map((v) => z.literal(v as string | number | boolean));
    return literals.length === 1 ? literals[0]! : z.union(literals as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
  }

  // oneOf/anyOf model "exactly/at-least one of these shapes" — a union is the correct Zod
  // equivalent for both (Zod has no laxer "anyOf" primitive; union already accepts whichever
  // variant matches, which is the practical behavior anyOf callers need).
  const oneOf = schema.oneOf as Record<string, unknown>[] | undefined;
  if (Array.isArray(oneOf) && oneOf.length > 0) return buildUnionZodType(oneOf, seen);

  const anyOf = schema.anyOf as Record<string, unknown>[] | undefined;
  if (Array.isArray(anyOf) && anyOf.length > 0) return buildUnionZodType(anyOf, seen);

  // allOf composes multiple object schemas into one — merge their shapes. A non-object member
  // (rare in practice) falls back to just the first variant rather than guessing a merge.
  const allOf = schema.allOf as Record<string, unknown>[] | undefined;
  if (Array.isArray(allOf) && allOf.length > 0) return buildIntersectionZodType(allOf, seen);

  switch (schema.type) {
    case 'object': {
      const properties = (schema.properties as Record<string, Record<string, unknown>>) || {};
      const required = new Set((schema.required as string[]) || []);
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [key, propSchema] of Object.entries(properties)) {
        const zodType = jsonSchemaToZod(propSchema, seen);
        shape[key] = required.has(key) ? zodType : zodType.optional();
      }
      return z.object(shape);
    }
    case 'array':
      return z.array(jsonSchemaToZod(schema.items as Record<string, unknown> | undefined, seen));
    case 'integer':
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'string':
    default:
      return buildStringZodType(schema.format as string | undefined);
  }
}

/** Converts a single OpenAPI/JSON-Schema fragment into a Zod type, recursively. */
export function jsonSchemaToZod(schema: Record<string, unknown> | undefined, seen: WeakSet<object> = new WeakSet()): z.ZodTypeAny {
  if (!schema) return z.unknown();
  if (seen.has(schema)) return z.unknown(); // cycle guard for self-referential specs
  seen.add(schema);

  const zodType = buildBaseZodType(schema, seen);
  return schema.nullable === true ? zodType.nullable() : zodType;
}

/** Converts an OpenAPI `parameters` array into a Zod object schema for tool-calling. */
export function buildZodSchemaFromParameters(parameters: Record<string, unknown>[]): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of parameters) {
    const name = String(p.name);
    const schema = (p.schema as Record<string, unknown>) || p;
    const zodType = jsonSchemaToZod(schema);
    shape[name] = p.required ? zodType : zodType.optional();
  }
  return z.object(shape);
}

/** Builds the full tool-call schema (parameters + requestBody, if any) for a tool definition. */
export function buildZodSchemaForTool(toolDef: DynamicToolDefinition): z.ZodObject<z.ZodRawShape> {
  const paramsSchema = buildZodSchemaFromParameters(toolDef.parameters);
  if (!toolDef.requestBodySchema) return paramsSchema;

  const requestBodyZod = jsonSchemaToZod(toolDef.requestBodySchema);
  return paramsSchema.extend({
    requestBody: toolDef.requestBodyRequired ? requestBodyZod : requestBodyZod.optional(),
  });
}
