import { AgenticOpenApiError } from './agentic-openapi-error';

/** Thrown when the HTTP request for a tool call actually failed (network error, non-2xx
 *  response, ...) — as opposed to ToolNotFoundError (bad tool name) or ResponseProcessingError
 *  (the request succeeded but post-processing the response failed). */
export class ToolExecutionError extends AgenticOpenApiError {
  constructor(
    message: string,
    public readonly statusCode: number | undefined,
    public readonly responseData: unknown,
    options?: { cause?: unknown }
  ) {
    super(message, options);
  }
}
