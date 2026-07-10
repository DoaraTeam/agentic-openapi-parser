import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { DynamicToolDefinition, ExecuteToolOptions, IAiAdapter } from '@/types';
import { IDynamicToolExecutorService } from '@/services';

export class LangchainToolAdapter implements IAiAdapter<DynamicStructuredTool, DynamicStructuredTool[]> {
  constructor(
    private executor: IDynamicToolExecutorService,
    private spec: Record<string, unknown>,
    private toolsDef: DynamicToolDefinition[],
    private options?: ExecuteToolOptions
  ) {}

  getTools(): DynamicStructuredTool[] {
    return this.toolsDef.map((toolDef) => {
      return new DynamicStructuredTool({
        name: toolDef.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
        description: toolDef.description || `Tool for ${toolDef.name}`,
        schema: this.buildZodSchema(toolDef.parameters),
        func: async (args: Record<string, unknown>) => {
          const result = await this.executor.execute(this.spec, toolDef.name, args, this.options);
          return JSON.stringify(result);
        },
      });
    });
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
