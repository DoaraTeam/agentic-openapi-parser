import { DynamicToolDefinition } from '@/types';
import { BaseNativeToolAdapter, buildStrictInputSchema } from '@/adapters/shared';

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Anthropic's tool-use format is plain JSON (Messages API), so like the OpenAI adapter this needs
 * no `@anthropic-ai/sdk` peer dependency — it only builds/consumes wire-format objects.
 */
export class AnthropicToolAdapter extends BaseNativeToolAdapter<AnthropicTool> {
  protected buildTool(name: string, toolDef: DynamicToolDefinition): AnthropicTool {
    return {
      name,
      description: toolDef.description || `Tool for ${toolDef.name}`,
      input_schema: buildStrictInputSchema(toolDef),
    };
  }
}
