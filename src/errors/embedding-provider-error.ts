import { AgenticOpenApiError } from './agentic-openapi-error';

/** Thrown by SemanticToolIndex when the caller-supplied EmbeddingProvider misbehaves (wrong
 *  number of embeddings returned, a missing embedding, ...) — a bug in that provider, not in the
 *  query or the indexed tools. */
export class EmbeddingProviderError extends AgenticOpenApiError {
  constructor(message: string) {
    super(message);
  }
}
