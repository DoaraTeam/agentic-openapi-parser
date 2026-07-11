import { buildStrictInputSchema, deriveMethodAnnotations, sanitizeJsonSchema } from './openapi-to-json-schema';
import { DynamicToolDefinition } from '@/types';

describe('sanitizeJsonSchema', () => {
  it('rewrites type: file to type: string, drops format, and annotates description', () => {
    const result = sanitizeJsonSchema({ type: 'file', format: 'binary', description: 'Upload' }) as Record<string, unknown>;
    expect(result.type).toBe('string');
    expect(result.format).toBeUndefined();
    expect(result.description).toBe('Upload (Base64 Encoded Binary Data)');
  });

  it('sets a default description when type: file has none', () => {
    const result = sanitizeJsonSchema({ type: 'file' }) as Record<string, unknown>;
    expect(result.description).toBe('Base64 Encoded Binary Data');
  });

  it('strips default/example/examples/pattern/minLength/maxLength/minimum/maximum', () => {
    const result = sanitizeJsonSchema({
      type: 'string',
      default: 'x',
      example: 'y',
      examples: ['z'],
      pattern: '^[a-z]+$',
      minLength: 1,
      maxLength: 10,
      minimum: 0,
      maximum: 100,
    }) as Record<string, unknown>;
    expect(result).toEqual({ type: 'string' });
  });

  it('removes keys with an explicit null value', () => {
    const result = sanitizeJsonSchema({ type: 'string', nullableThing: null }) as Record<string, unknown>;
    expect(result).toEqual({ type: 'string' });
  });

  it('recurses into properties and items but not anyOf/oneOf/allOf', () => {
    const result = sanitizeJsonSchema({
      type: 'object',
      properties: { name: { type: 'string', default: 'x' } },
      anyOf: [{ default: 'untouched' }],
    }) as Record<string, unknown>;
    expect((result.properties as Record<string, unknown>).name).toEqual({ type: 'string' });
    expect((result.anyOf as Record<string, unknown>[])[0]).toEqual({ default: 'untouched' });
  });
});

describe('deriveMethodAnnotations', () => {
  it.each([
    ['get', true, false],
    ['head', true, false],
    ['options', true, false],
    ['post', false, true],
    ['put', false, true],
    ['delete', false, true],
    ['patch', false, true],
  ])('%s -> readOnlyHint=%s destructiveHint=%s', (method, readOnlyHint, destructiveHint) => {
    expect(deriveMethodAnnotations(method)).toEqual({ readOnlyHint, destructiveHint });
  });
});

describe('buildStrictInputSchema', () => {
  const baseToolDef: DynamicToolDefinition = {
    name: 'createUser',
    description: 'Create a user',
    method: 'post',
    url: '/users',
    parameters: [],
  };

  it('omits the required key entirely when there are no required fields', () => {
    const schema = buildStrictInputSchema(baseToolDef);
    expect(schema).toEqual({ type: 'object', properties: {} });
    expect(schema).not.toHaveProperty('required');
  });

  it('skips authorization/bearer/cookie header params by default', () => {
    const toolDef: DynamicToolDefinition = {
      ...baseToolDef,
      parameters: [
        { name: 'Authorization', in: 'header', schema: { type: 'string' }, required: true },
        { name: 'X-Request-Id', in: 'header', schema: { type: 'string' }, required: false },
      ],
    };
    const schema = buildStrictInputSchema(toolDef);
    expect(schema.properties).toEqual({ 'X-Request-Id': { type: 'string' } });
    expect(schema).not.toHaveProperty('required');
  });

  it('wraps requestBody into a single "requestBody" property with fallback description', () => {
    const toolDef: DynamicToolDefinition = {
      ...baseToolDef,
      requestBodySchema: { type: 'object', properties: { name: { type: 'string' } } },
      requestBodyRequired: true,
    };
    const schema = buildStrictInputSchema(toolDef);
    expect(schema.properties).toEqual({
      requestBody: { type: 'object', properties: { name: { type: 'string' } }, description: 'Payload for the request' },
    });
    expect(schema.required).toEqual(['requestBody']);
  });

  it('falls back to Swagger 2 style {type: rawType} when a parameter has no nested schema', () => {
    const toolDef: DynamicToolDefinition = {
      ...baseToolDef,
      parameters: [{ name: 'limit', in: 'query', type: 'integer', required: true }],
    };
    const schema = buildStrictInputSchema(toolDef);
    expect(schema.properties).toEqual({ limit: { type: 'integer' } });
    expect(schema.required).toEqual(['limit']);
  });
});
