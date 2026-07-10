import { buildZodSchemaFromParameters } from './openapi-to-zod';

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
