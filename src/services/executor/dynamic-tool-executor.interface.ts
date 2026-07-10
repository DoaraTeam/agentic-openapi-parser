import { ExecuteToolOptions } from '@/types';

export const DYNAMIC_TOOL_EXECUTOR_SERVICE = Symbol('DYNAMIC_TOOL_EXECUTOR_SERVICE');

export interface IDynamicToolExecutorService {
  execute(spec: Record<string, unknown>, toolName: string, args: Record<string, unknown>, options?: ExecuteToolOptions): Promise<unknown>;
}
