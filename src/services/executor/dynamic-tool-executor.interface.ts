import { ExecuteToolOptions, ToolCallRequest, ToolCallOutcome } from '@/types';

export const DYNAMIC_TOOL_EXECUTOR_SERVICE = Symbol('DYNAMIC_TOOL_EXECUTOR_SERVICE');

export interface IDynamicToolExecutorService {
  execute(spec: Record<string, unknown>, toolName: string, args: Record<string, unknown>, options?: ExecuteToolOptions): Promise<unknown>;
  /** Runs multiple tool calls concurrently (e.g. an LLM turn's parallel tool_calls), preserving
   *  call order in the result and never letting one call's failure affect the others. */
  executeMany(spec: Record<string, unknown>, calls: ToolCallRequest[], options?: ExecuteToolOptions): Promise<ToolCallOutcome[]>;
}
