import { AgenticOpenApiError } from './agentic-openapi-error';

/** Thrown by parseAndFlatten() when the spec at apiSpecUrl can't be fetched or dereferenced. */
export class SpecParseError extends AgenticOpenApiError {
  constructor(
    public readonly apiSpecUrl: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
