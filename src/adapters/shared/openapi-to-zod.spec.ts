import { buildZodSchemaFromParameters, buildZodSchemaForTool, jsonSchemaToZod } from './openapi-to-zod';
import { DynamicToolDefinition } from '@/types';

describe('buildZodSchemaFromParameters', () => {
  it('maps integer/number to z.number()', () => {
    const schema = buildZodSchemaFromParameters([{ name: 'age', schema: { type: 'integer' }, required: true }]);
    expect(schema.parse({ age: 30 })).toEqual({ age: 30 });
    expect(() => schema.parse({ age: 'x' })).toThrow();
  });

  it('maps boolean to z.boolean()', () => {
    const schema = buildZodSchemaFromParameters([{ name: 'active', schema: { type: 'boolean' }, required: true }]);
    expect(schema.parse({ active: true })).toEqual({ active: true });
  });

  it('maps array to z.array(z.unknown())', () => {
    const schema = buildZodSchemaFromParameters([{ name: 'tags', schema: { type: 'array' }, required: true }]);
    expect(schema.parse({ tags: ['a', 1, true] })).toEqual({ tags: ['a', 1, true] });
  });

  it('defaults unknown/string types to z.string()', () => {
    const schema = buildZodSchemaFromParameters([{ name: 'name', schema: { type: 'string' }, required: true }]);
    expect(schema.parse({ name: 'hi' })).toEqual({ name: 'hi' });
  });

  it('marks non-required params optional', () => {
    const schema = buildZodSchemaFromParameters([{ name: 'q', schema: { type: 'string' }, required: false }]);
    expect(schema.parse({})).toEqual({});
  });

  it('falls back to the parameter object itself when schema is absent (Swagger 2 style)', () => {
    const schema = buildZodSchemaFromParameters([{ name: 'limit', type: 'integer', required: true }]);
    expect(schema.parse({ limit: 5 })).toEqual({ limit: 5 });
  });
});

describe('jsonSchemaToZod', () => {
  it('builds a nested object schema from properties/required', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      properties: {
        id: { type: 'integer' },
        name: { type: 'string' },
      },
      required: ['id'],
    });
    expect(schema.parse({ id: 1 })).toEqual({ id: 1 });
    expect(schema.parse({ id: 1, name: 'Alice' })).toEqual({ id: 1, name: 'Alice' });
    expect(() => schema.parse({})).toThrow();
  });

  it('builds an array-of-objects schema recursively', () => {
    const schema = jsonSchemaToZod({
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
    });
    expect(schema.parse([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(() => schema.parse([{}])).toThrow();
  });

  it('maps a string enum to z.enum', () => {
    const schema = jsonSchemaToZod({ enum: ['a', 'b', 'c'] });
    expect(schema.parse('b')).toBe('b');
    expect(() => schema.parse('z')).toThrow();
  });

  it('maps a mixed-type enum to a union of literals', () => {
    const schema = jsonSchemaToZod({ enum: ['a', 1, true] });
    expect(schema.parse('a')).toBe('a');
    expect(schema.parse(1)).toBe(1);
    expect(() => schema.parse('b')).toThrow();
  });

  it('maps format: date-time / email to the matching Zod string validator', () => {
    const dateTimeSchema = jsonSchemaToZod({ type: 'string', format: 'date-time' });
    expect(dateTimeSchema.parse('2024-01-01T00:00:00Z')).toBe('2024-01-01T00:00:00Z');
    expect(() => dateTimeSchema.parse('not-a-date')).toThrow();

    const emailSchema = jsonSchemaToZod({ type: 'string', format: 'email' });
    expect(emailSchema.parse('a@b.com')).toBe('a@b.com');
    expect(() => emailSchema.parse('not-an-email')).toThrow();
  });

  it('does not infinitely recurse on a self-referential schema (cycle guard)', () => {
    const selfRef: Record<string, unknown> = { type: 'object', properties: {} };
    (selfRef.properties as Record<string, unknown>).child = selfRef;
    expect(() => jsonSchemaToZod(selfRef)).not.toThrow();
  });
});

describe('buildZodSchemaForTool', () => {
  const baseToolDef: DynamicToolDefinition = {
    name: 'createUser',
    description: 'Create a user',
    method: 'post',
    url: '/users',
    parameters: [],
  };

  it('returns just the parameters schema when there is no requestBody', () => {
    const schema = buildZodSchemaForTool(baseToolDef);
    expect(schema.parse({})).toEqual({});
  });

  it('merges a required requestBody field into the schema', () => {
    const toolDef: DynamicToolDefinition = {
      ...baseToolDef,
      requestBodySchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      requestBodyRequired: true,
    };
    const schema = buildZodSchemaForTool(toolDef);
    expect(schema.parse({ requestBody: { name: 'Alice' } })).toEqual({ requestBody: { name: 'Alice' } });
    expect(() => schema.parse({})).toThrow();
  });

  it('marks requestBody optional when requestBodyRequired is false', () => {
    const toolDef: DynamicToolDefinition = {
      ...baseToolDef,
      requestBodySchema: { type: 'object', properties: { name: { type: 'string' } } },
      requestBodyRequired: false,
    };
    const schema = buildZodSchemaForTool(toolDef);
    expect(schema.parse({})).toEqual({});
  });
});
