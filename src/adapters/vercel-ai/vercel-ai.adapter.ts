import { tool as createTool } from 'ai';
import { z } from 'zod';
import { DynamicToolDefinition, ExecuteToolOptions, IAiAdapter } from '@/types';
import { IDynamicToolExecutorService } from '@/services';

export class VercelAiAdapter implements IAiAdapter<unknown, Record<string, unknown>> {
  constructor(
    private executor: IDynamicToolExecutorService,
    private spec: Record<string, unknown>,
    private toolsDef: DynamicToolDefinition[],
    private options?: ExecuteToolOptions
  ) {}

  getTools(): Record<string, unknown> {
    const toolsMap: Record<string, unknown> = {};
    
    for (const toolDef of this.toolsDef) {
      const safeName = toolDef.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
      const createToolFn = createTool as unknown as (config: Record<string, unknown>) => unknown;
      toolsMap[safeName] = createToolFn({
        description: toolDef.description || `Tool for ${toolDef.name}`,
        parameters: this.buildZodSchema(toolDef.parameters),
        execute: async (args: unknown) => {
          const result = await this.executor.execute(this.spec, toolDef.name, args as Record<string, unknown>, this.options);
          return result;
        },
      });
    }

    return toolsMap;
  }

  private buildZodSchema(parameters: Record<string, unknown>[]): z.ZodTypeAny {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const p of parameters) {
      const name = String(p.name);
      let zodType: z.ZodTypeAny = z.string();
      
      const schema = (p.schema as Record<string, unknown>) || p;
      const type = schema.type as string;

      switch (type) {
        case 'integer':
        case 'number':
          zodType = z.number();
          break;
        case 'boolean':
          zodType = z.boolean();
          break;
        case 'array':
          zodType = z.array(z.unknown());
          break;
        case 'string':
        default:
          zodType = z.string();
      }

      if (p.required) {
        shape[name] = zodType;
      } else {
        shape[name] = zodType.optional();
      }
    }
    return z.object(shape);
  }
}
