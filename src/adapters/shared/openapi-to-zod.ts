import { z } from 'zod';

function mapOpenApiTypeToZod(type: string): z.ZodTypeAny {
  switch (type) {
    case 'integer':
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'array':
      return z.array(z.unknown());
    case 'string':
    default:
      return z.string();
  }
}

/** Converts an OpenAPI `parameters` array into a Zod object schema for tool-calling. */
export function buildZodSchemaFromParameters(parameters: Record<string, unknown>[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const p of parameters) {
    const name = String(p.name);
    const schema = (p.schema as Record<string, unknown>) || p;
    const zodType = mapOpenApiTypeToZod(schema.type as string);
    shape[name] = p.required ? zodType : zodType.optional();
  }
  return z.object(shape);
}
