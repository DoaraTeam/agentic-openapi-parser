import { tool as createTool } from 'ai';
import { BaseAiAdapter } from '@/adapters/shared';

export class VercelAiAdapter extends BaseAiAdapter<unknown, Record<string, unknown>> {
  getTools(): Record<string, unknown> {
    const toolsMap: Record<string, unknown> = {};

    for (const toolDef of this.toolsDef) {
      const createToolFn = createTool as unknown as (config: Record<string, unknown>) => unknown;
      toolsMap[this.safeToolName(toolDef.name)] = createToolFn({
        description: toolDef.description || `Tool for ${toolDef.name}`,
        parameters: this.buildSchema(toolDef),
        execute: async (args: unknown) => {
          return this.run(toolDef.name, args as Record<string, unknown>);
        },
      });
    }

    return toolsMap;
  }
}
