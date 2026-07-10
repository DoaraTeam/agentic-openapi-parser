import { search } from 'jmespath';
import { ResponseProcessor } from '@/types';

/**
 * Selects/reshapes a response with a JMESPath expression before it reaches the LLM — e.g. picking
 * `data.items[*].{id: id, name: name}` out of a large payload instead of returning it whole.
 * JMESPath (not JSONPath) on purpose: it's a fully declarative query language with no script/filter
 * syntax that evaluates arbitrary code, which matters since the expression may come from
 * caller-supplied, semi-trusted config rather than only from a developer's own source.
 *
 * A malformed expression is a caller configuration bug, not a transient failure, so it throws
 * rather than silently passing the response through unmodified.
 */
export class JmesPathSelectProcessor implements ResponseProcessor {
  constructor(private readonly expression: string) {}

  process(data: unknown): unknown {
    try {
      return search(data, this.expression);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JMESPath expression "${this.expression}": ${message}`);
    }
  }
}
