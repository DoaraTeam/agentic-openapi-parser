import { AgenticOpenApiError } from './agentic-openapi-error';
import { SpecParseError } from './spec-parse-error';

describe('AgenticOpenApiError', () => {
  it('is a real Error instance (instanceof Error holds)', () => {
    const error = new AgenticOpenApiError('boom');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('boom');
  });

  it('sets name to the constructor name, not the generic "Error"', () => {
    const error = new AgenticOpenApiError('boom');
    expect(error.name).toBe('AgenticOpenApiError');
  });

  it('a subclass automatically gets its own name via new.target, with no boilerplate', () => {
    const error = new SpecParseError('https://api.example.com/spec.json', 'failed');
    expect(error.name).toBe('SpecParseError');
    expect(error).toBeInstanceOf(AgenticOpenApiError);
    expect(error).toBeInstanceOf(Error);
  });

  it('preserves the original error via the standard Error cause chain', () => {
    const original = new Error('network down');
    const error = new AgenticOpenApiError('wrapped', { cause: original });
    expect(error.cause).toBe(original);
  });
});
