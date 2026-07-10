import { z } from 'zod';
import { DynamicToolDefinition, ExecuteToolOptions, IAiAdapter } from '@/types';
import { IDynamicToolExecutorService } from '@/services';
import { buildZodSchemaFromParameters } from './openapi-to-zod';

/**
 * Shared plumbing for AI-framework adapters (Langchain, Vercel AI, ...).
 * Subclasses only need to implement `getTools()` in their framework's shape.
 */
export abstract class BaseAiAdapter<TTool, TReturnType> implements IAiAdapter<TTool, TReturnType> {
  constructor(
    protected readonly executor: IDynamicToolExecutorService,
    protected readonly spec: Record<string, unknown>,
    protected readonly toolsDef: DynamicToolDefinition[],
    protected readonly options?: ExecuteToolOptions
  ) {}

  protected safeToolName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  }

  protected buildSchema(parameters: Record<string, unknown>[]): z.ZodTypeAny {
    return buildZodSchemaFromParameters(parameters);
  }

  protected async run(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.executor.execute(this.spec, toolName, args, this.options);
  }

  abstract getTools(): TReturnType;
}
