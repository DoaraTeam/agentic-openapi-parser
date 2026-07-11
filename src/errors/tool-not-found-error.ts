import { AgenticOpenApiError } from './agentic-openapi-error';

/** Thrown when a tool name can't be resolved to an operation in the spec — by the executor
 *  (executeTool) or by a native adapter (executeToolCall) resolving a provider's echoed name. */
export class ToolNotFoundError extends AgenticOpenApiError {
  constructor(public readonly toolName: string) {
    super(`Tool "${toolName}" not found in the provided OpenAPI spec.`);
  }
}
