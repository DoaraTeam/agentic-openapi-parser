import type { ExecuteToolOptions } from '@/types';
import type { IDynamicToolExecutorService } from '@/services';
import { ToolNotFoundError } from '@/errors';

export interface MockExecutorCall {
  toolName: string;
  args: Record<string, unknown>;
  options?: ExecuteToolOptions;
}

export type MockToolResponse = unknown | ((args: Record<string, unknown>, options?: ExecuteToolOptions) => unknown | Promise<unknown>);

export interface MockExecutor extends IDynamicToolExecutorService {
  /** Every execute() call received so far, in call order — inspect to assert what a consumer's adapter wiring actually called. */
  readonly calls: MockExecutorCall[];
}

/**
 * Fakes IDynamicToolExecutorService for consumer unit tests, so code that wires an adapter to this
 * library can be tested without a real spec, a real HTTP call, or mocking axios directly. Pass an
 * Error instance as a response to simulate a failed tool call.
 */
export function createMockExecutor(responses: Record<string, MockToolResponse> = {}): MockExecutor {
  const calls: MockExecutorCall[] = [];

  return {
    calls,
    async execute(_spec, toolName, args, options) {
      calls.push({ toolName, args, options });

      if (!(toolName in responses)) {
        throw new ToolNotFoundError(toolName);
      }

      const response = responses[toolName];
      if (response instanceof Error) throw response;
      if (typeof response === 'function') {
        return (response as (args: Record<string, unknown>, options?: ExecuteToolOptions) => unknown | Promise<unknown>)(args, options);
      }
      return response;
    },
  };
}
