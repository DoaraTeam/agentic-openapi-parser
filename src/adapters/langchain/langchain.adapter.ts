import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseAiAdapter } from '@/adapters/shared';

export class LangchainToolAdapter extends BaseAiAdapter<DynamicStructuredTool, DynamicStructuredTool[]> {
  getTools(): DynamicStructuredTool[] {
    return this.toolsDef.map((toolDef) => {
      return new DynamicStructuredTool({
        name: this.safeToolName(toolDef.name),
        description: toolDef.description || `Tool for ${toolDef.name}`,
        schema: this.buildSchema(toolDef.parameters),
        func: async (args: Record<string, unknown>) => {
          const result = await this.run(toolDef.name, args);
          return JSON.stringify(result);
        },
      });
    });
  }
}
