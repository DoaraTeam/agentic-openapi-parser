import { z } from 'zod';
import { DynamicToolDefinition, ExecuteToolOptions, IAiAdapter } from '@/types';
import { IDynamicToolExecutorService } from '@/services';
import { buildZodSchemaForTool } from './openapi-to-zod';
import { safeToolName as sanitizeToolName } from './tool-name';

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
    return sanitizeToolName(name);
  }

  protected buildSchema(toolDef: DynamicToolDefinition): z.ZodTypeAny {
    return buildZodSchemaForTool(toolDef);
  }

  protected async run(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    return this.executor.execute(this.spec, toolName, args, this.options);
  }

  abstract getTools(): TReturnType;
}
