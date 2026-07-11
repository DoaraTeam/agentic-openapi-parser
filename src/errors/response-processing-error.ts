import { AgenticOpenApiError } from './agentic-openapi-error';

/** Thrown when a ResponseProcessor (TruncateResponseProcessor, JmesPathSelectProcessor, a custom
 *  one, ...) throws while post-processing an otherwise-successful tool response. */
export class ResponseProcessingError extends AgenticOpenApiError {
  constructor(
    public readonly processorName: string,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
