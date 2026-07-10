import { DynamicToolDefinition } from '@/types';
import { BaseNativeToolAdapter, buildStrictInputSchema } from '@/adapters/shared';

export interface OpenAiFunctionTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * OpenAI's function-calling tool format (Chat Completions and Responses APIs) is plain JSON, so
 * unlike the Langchain/Vercel AI/MCP adapters this one needs no `openai` peer dependency at all —
 * it only builds/consumes wire-format objects.
 */
export class OpenAiToolAdapter extends BaseNativeToolAdapter<OpenAiFunctionTool> {
  protected buildTool(name: string, toolDef: DynamicToolDefinition): OpenAiFunctionTool {
    return {
      type: 'function',
      function: {
        name,
        description: toolDef.description || `Tool for ${toolDef.name}`,
        parameters: buildStrictInputSchema(toolDef),
      },
    };
  }
}
